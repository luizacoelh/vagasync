# VagaSync — Roadmap

## Objetivo
Um CRM pessoal para centralizar e gerenciar candidaturas de estágio/emprego
de forma inteligente, sem a complexidade de um Kanban ou a bagunça de um Notion.

## Fluxo do usuário
```
[Login] → [Perfil (onboarding)] → [Dashboard] → [Nova Vaga] → [Análise da IA] → [Confirmação] → [Detalhes da Vaga] → [Atualizar Status/Metadados]
```

---

## Proteção de criação independente da IA (PR #37) e auditoria complementar

- PR #37 integrado no commit `96981a2` (implementação `77b9b1c`).
- **Aplicado no Turso em 29/10/2026:** migration `20261028160000_job_creation_quota`,
  após backup consistente de 9 tabelas, conferência por hash e ensaio numa cópia.
  `check:turso`: 0 erros, 1 aviso cosmético preexistente. O deploy do PR #37
  já estava em Production; faltava a tabela, agora criada.
- Revisão complementar: perfil com limites de campos/listas; teto de
  corpo em todas as APIs próprias que recebem JSON; IDs individuais validados;
  reserva atômica por IP antes da IA; cota separada de tentativas de análise n8n;
  exportação CSV neutraliza fórmulas. Inventário e limites da auditoria em
  `docs/AUDITORIA_ENDPOINTS_2026-10-29.md`.

- Branch `fix/job-creation-limits`: cota persistente por canal/usuário,
  teto de armazenamento e validação de payload nos cadastros e metadados.
- Migration aditiva aplicada em produção. Não houve limpeza de vagas existentes.
- Validação local da revisão: 51 testes, lint, TypeScript e build aprovados;
  revisão independente somente-leitura. Publicação pelo deploy do commit na main.
- Valores iniciais: manual 10/min e 100/24h; n8n 60/min e 500/24h;
  2.000 vagas armazenadas por conta, incluindo descartadas.

## Entregas anteriores concluídas

### fix(n8n): idioma em descrições curtas, origem n8n e contagem por busca
- [x] Teste de idioma do "Montar vagas" compara palavras funcionais de
  português, inglês e espanhol; texto curto (< 40 palavras) ou empate não é
  recusado. Três descrições curtas reais do Remotar, antes recusadas, viraram
  fixture (`tests/fixtures/n8n-idioma.json`); vagas em inglês e espanhol
  continuam recusadas
- [x] Webhook grava `Job.source = "n8n"` nas vagas novas (canal de entrada;
  provedor não vai para a coluna). Vagas antigas não foram alteradas
- [x] Teste de persistência (`tests/jobSource.test.mjs`): SQLite temporário
  criado pelas migrations, Gemini simulado, webhook grava `"n8n"` e o
  cadastro manual (`createJob`) mantém `"manual"`. Sem dependência nova:
  `tests/support/ts-loader.mjs` transpila o TS com o `typescript` instalado
- [x] Resumo do Actions mostra itens e aprovadas por busca. Nenhuma busca
  removida: decidir depois de ~2 semanas de dados
  (`docs/PLANO_N8N_IMPORTACAO_URL.md`, etapa E0)

### fix(n8n): vaga repetida entre fontes e filtro de área pelo título
- [x] Mesma vaga em fontes diferentes (ex: Remotar e Himalayas) não entra
  duas vezes: além da URL, o webhook compara título + empresa (sem acento,
  caixa, pontuação e espaços) de outra origem nos últimos 30 dias, antes do
  Gemini. Só entre as vagas do mesmo usuário; empresa vazia ou genérica
  ("Confidencial", "Não informada"...) nunca casa; mesma origem com URL
  diferente é vaga distinta; no GitHub cada repositório é uma origem
  (`lib/jobDedup.ts`). Depois da IA confere de novo, com as vagas recarregadas
  do banco, usando o título e a empresa extraídos (pega o GitHub, que não tem
  empresa)
- [x] n8n manda `title` e `company` como a fonte publicou
- [x] Teto de 40 por rodada passa a contar só vagas novas: nó "Checar já
  cadastradas" (`POST /api/webhook/n8n/check`, uma chamada por rodada) +
  "Separar novas". Duplicadas antigas não travam mais a fila; se a checagem
  falhar, volta ao comportamento anterior
- [x] Área decidida pelo título (e categorias no Remotar), não pela
  descrição; título de marketing/vendas/comercial/RH etc. sem nada de TI cai.
  Corrige "Estágio em Marketing e Vendas" entrando pelo Himalayas
- [x] `npm test` (node --test, sem dependência nova) com 24 testes; roda no CI
- [x] Revisão independente antes do merge: corrigidos `` virado
  caractere de controle no filtro (vendas/RH passavam), símbolos de
  linguagem no título (C++ x C#), empresa genérica escrita pela IA e
  recarga das vagas antes da checagem pós-IA
- [x] CI: Node 22 (o mesmo do `engines`), `actions/checkout@v5` e
  `actions/setup-node@v5` (rodam em Node 24; some o aviso de Node 20)

### feat(visitante): usar o app sem login (só leitura) + onboarding visual
- [x] Sem login, `/`, `/monitoradas`, `/nova-vaga` e `/vaga/*` abrem com vagas
  de exemplo (`lib/demoJobs.ts`, nada do banco); `/perfil` e `/admin`
  continuam pedindo login, e link de vaga real leva ao login e volta
- [x] Qualquer ação que grava (status, checklist, dados da candidatura,
  excluir, Tenho interesse/Descartar, Analisar, Salvar) abre uma janela de
  login por cima da página (`components/auth/LoginGate.tsx`) e volta para a
  mesma página depois. O servidor continua recusando sem sessão
- [x] `/nova-vaga` como visitante: a vaga de exemplo mostra uma análise pronta
  (sem gastar IA); outro texto pede login e o texto colado volta depois
- [x] Onboarding visual: três passos (Cole a vaga → IA analisa → Acompanhe)
  no convite do visitante e no dashboard vazio de quem acabou de entrar.
  Some com a primeira vaga, então não precisou de `hasSeenOnboarding` nem
  de migration
- [x] `/login` e a janela usam os mesmos botões (`LoginButtons`); "Sair" agora
  volta para o dashboard de exemplo

### feat(n8n): estágio na Gupy, filtro por local e execução no GitHub Actions
- [x] Gupy volta como fonte: a página de busca do portal traz as 12 vagas mais
  recentes no `__NEXT_DATA__` (a API JSON saiu do ar). 11 buscas só de
  estágio: remoto do Brasil todo + Piauí, janela de 30 dias respeitando o
  prazo de inscrição
- [x] Filtro de local para todas as fontes: remoto de qualquer lugar;
  presencial/híbrido só Teresina/PI (`ESTADO_LOCAL`, `CIDADES_LOCAIS`)
- [x] Estágio entra primeiro na fila da rodada; `soujava/vagas-java` entra no
  GitHub; "Programa de Estágio" e "Desenvolvimento de Negócios" não contam
  mais como TI
- [x] "Buscar vagas" lê o corpo como texto (para aceitar o HTML da Gupy)
- [x] `.github/workflows/n8n-vagas.yml`: a cada 2h roda o mesmo workflow num
  n8n descartável (sem PC ligado); log só com o resumo
  (`scripts/n8n-execution-summary.mjs`). Agendamento do n8n local desligado
- [x] Medido: InfoJobs (RSS virou HTML) e Catho (403) fora; primeira rodada
  trouxe 5 vagas novas, 2 da Gupy (uma presencial em Teresina)

### chore(turso): banco de produção movido para São Paulo
- A função da Vercel roda em `gru1` (São Paulo) e o banco `applylens` estava
  no grupo `default` na Irlanda (`aws-eu-west-1`): ~175 ms por consulta
- Novo grupo `sao-paulo` (`aws-sa-east-1`) e banco `vagasync` criado a partir
  do backup; comparação só leitura: estrutura e todas as 9 tabelas idênticas
  (contagem + hash das linhas)
- Vercel apontada para o banco novo; páginas com consulta passaram a responder
  no mesmo tempo que `/login` (o banco deixou de pesar). Passo a passo em
  `DEPLOY.md` ("Trocar o banco de região")
- `applylens` (Irlanda) fica parado como reserva por alguns dias

### feat(monitoradas): busca, seleção em lote e ações dentro da vaga
- `/monitoradas`: o quadro inteiro da vaga abre a página (link "esticado"),
  busca sem acento por empresa/cargo/tecnologia/resumo e modo **Selecionar**
  para "Tenho interesse"/"Descartar" em várias vagas de uma vez (com "Desfazer")
- Página de uma vaga MONITORADA: troca status, "Excluir" e "Detalhes da
  candidatura" (o "Salvar" que confundia) por **Tenho interesse** e
  **Descartar**. Depois de agir, volta para `/monitoradas` no mesmo ponto da
  rolagem e com a mesma busca (`lib/monitoredView.ts`, sessionStorage), com o
  aviso na tela
- Dashboard: modo **Selecionar** (cards e tabela) para excluir várias vagas;
  como apaga de vez, pede um "Sim, excluir N" na própria barra
- Actions em lote: `markJobsInterested`, `discardJobs`, `restoreDiscardedJobs`,
  `deleteJobs` (ids validados, teto de 200, dono no `WHERE`)
- Diagnóstico de lentidão: a função da Vercel roda em `gru1` (São Paulo) e o
  banco Turso estava em `aws-eu-west-1` (Irlanda) — ~170–180 ms por consulta.
  Resolvido em "chore(turso): banco de produção movido para São Paulo"

### feat(monitoradas): descartar sem apagar + menos idas ao servidor
- Status `DESCARTADA`: "Descartar" em `/monitoradas` não apaga mais a vaga, só
  muda o status. Ela some de todas as telas (dashboard, filtros, estatísticas,
  CSV, `GET /api/jobs`), mas a deduplicação por URL do webhook continua
  reconhecendo — o n8n não recria vaga descartada. Sem SQL: o enum é `TEXT` no
  SQLite/Turso (`prisma migrate diff` vazio), nada a aplicar no Turso
- Sem confirmação: a vaga some no clique (otimista) e aparece um aviso com
  "Desfazer" por 8 s (`restoreDiscardedJob`). "Tenho interesse" também ficou
  otimista; se o servidor recusar, a vaga volta e o erro aparece
- Fluidez: removido o `router.refresh()` depois das Server Actions
  (`StatusSelect`, `JobMetaEditor`, `/monitoradas`) — o `revalidatePath` já
  devolve a página atualizada na mesma resposta, então era uma segunda ida ao
  servidor por clique. As actions checam o dono no `WHERE`
  (`updateMany`/`deleteMany` com `userId`), uma consulta em vez de duas
- Removido do roadmap o item do `JobsProvider`: ele não existe mais no código

### feat(n8n): fontes de vagas BR (GitHub + Himalayas)
Diagnóstico: nenhuma vaga chegava porque (1) o workflow estava desativado,
(2) o feed do We Work Remotely parou em 06/10/2026, então o filtro de 2h
nunca deixava nada passar, e (3) o segredo vinha de `$vars`, recurso pago do
n8n (a tabela estava vazia; a credencial Header Auth é que autenticava).
- [x] `n8n-workflows/vagas-br.json`: Remotar (vagas remotas BR) + GitHub
  (`frontendbr`, `backend-br`, `react-brasil`) + Himalayas, janela de 7 dias,
  fontes intercaladas, até 40 por rodada, 1 envio a cada 8s, erro numa vaga
  não derruba as outras
- [x] Filtro de perfil no nó "Montar vagas", igual para todas as fontes:
  estágio/trainee/júnior (sem pleno/sênior no título), área de TI, texto em
  português, sem exigir inglês nem 2+ anos de experiência, sem "banco de
  talentos"; no Himalayas só vagas abertas ao Brasil. A primeira carga sem
  esse filtro trouxe vagas sênior e internacionais (removidas pela tela)
- [x] Webhook aceita `remotar`, `github` e `himalayas` em `VALID_SOURCES`
- [x] Ativado no n8n local. Volume medido com o filtro: ~12 vagas/semana
- [x] `docs/N8N_SETUP.md`: fluxo novo, comandos de import/publish/execute
  pela CLI, fontes medidas (Gupy sem API pública)

### feat(vaga): diferenciais, salário pela IA, checklist marcável, sinônimos de skills e dedup no webhook
- [x] Migration `20261025120000_add_job_differentials`: coluna `Job.differentials`
  (JSON array, opcional — vagas antigas só não mostram a seção)
- [x] `lib/gemini.ts`: prompt pede `differentials`, `salary` e `location`;
  `normalizeExtras` deixa os três tolerantes a resposta incompleta
- [x] `/nova-vaga`: salário/bolsa e local já vêm preenchidos (editáveis) e a
  prévia mostra os diferenciais; `/vaga/[id]` ganha a seção "Diferenciais"
- [x] Webhook n8n grava diferenciais, salário e modalidade nas monitoradas
- [x] Checklist marcável (antigo próximo passo #3): migration
  `20261025130000_add_job_checklist_done` (`Job.checklistDone`, JSON de
  índices); `components/job/JobChecklist.tsx` com atualização otimista e a
  server action `toggleChecklistItem` (altera só o índice pedido, valida o
  limite do checklist)
- [x] Sinônimos de skills (antigo próximo passo #4): `lib/skillAliases.ts` +
  `skillKey()` em `lib/skillGap.ts` — "JS" = "JavaScript", "Node.js" = "NodeJS",
  "Postgres" = "PostgreSQL", "APIs REST" = "REST API" etc.
- [x] Webhook (antigo próximo passo #5): deduplica por URL **antes** do Gemini
  (responde 200 `{ duplicate: true }`) e aceita a fonte `weworkremotely`

**Como aplicar:** backup do Turso → `npm run migrate:turso -- --dry-run`
(deve listar as duas migrations) → `npm run migrate:turso` →
`npm run check:turso` → deploy. ✅ Aplicado no Turso em 2026-10-25 (backup
feito antes; `check:turso` voltou a 0 erros, 1 aviso cosmético).
- [x] Workflow real do n8n versionado em `n8n-workflows/weworkremotely-rss.json`
  (exportado pela CLI, sem metadados da instância). Fonte passa a ser
  `weworkremotely` (estava fixa como `indeed` no nó Code **e** no corpo do
  HTTP, que agora usa `{{ $json.source }}`), e o filtro "Só vagas das últimas
  2h" teve o "Always Output Data" desligado, como manda o CLAUDE.md

### fix(db-hardening): auditoria do banco de produção após o incidente de out/2026
Auditoria do export do Turso (`applylens.db`) depois do reparo manual. O banco está
íntegro (`integrity_check` ok), mas divergia das migrations:
- **Índices únicos ausentes** em `User.email`, `Account(provider, providerAccountId)`,
  `Session.sessionToken` e `VerificationToken` (sem duplicatas hoje; risco de
  duplicar usuário/conta em corrida de login) e sem índice em `Job.userId`
- `Job` reconstruído à mão: **sem chave estrangeira** para `User`, com `userId`
  `DEFAULT` apontando para um id que não existe em `User`
- **3 colunas fora do schema** em `Job` (`source`, `recruiterProfile`, `skillsToStudy`):
  existem no banco, não estão no `schema.prisma` nem em nenhuma migration
- Dados: as 49 vagas ficaram com `appliedAt` carimbado em `2026-10-17 03:03:16`; a
  vaga de exemplo do João ficou no usuário dono; `url`, `location` e `salary` de todas
  se perderam (fora da janela de 24 h do PITR)
- [x] `prisma/migrations/20261019120000_add_missing_indexes`: recria os índices que
  faltam, idempotente (no-op em banco criado pelas migrations; falha sem registrar se
  houvesse duplicata)
- [x] `scripts/check-turso-schema.mjs` (`npm run check:turso`): compara o schema real
  com as migrations, só leitura, aceita `--file export.db`
- [x] `docs/REPARO_DADOS_2026-10.sql`: devolve `appliedAt` (= data de cadastro,
  aproximação) e a vaga do João; testado numa cópia do export
- [x] `DEPLOY.md` §2.1: rotina backup → ensaio na cópia → aplicar → `check:turso`
- [x] Decidir as 3 colunas extras de `Job`: entram no `schema.prisma` com migration
  (se alguma feature vai usá-las) ou saem do banco
- [x] Aplicar migration `20261022180000_fix_job_fk_and_userid_default` no Turso:
  FK `ON DELETE CASCADE` restaurada, `DEFAULT` legado em `userId` removido.
  `check:turso` passou de 3 para 1 aviso (só `UserProfile.updatedAt` default,
  cosmético — `@updatedAt` do Prisma sobrescreve; não vale reconstrução de tabela)
- [x] Aposentar `scripts/fix-turso-job-table.mjs` e `scripts/sync-turso-schema.mjs`
  (foram a origem da divergência; removidos do repo — o histórico do git os guarda)
- [x] CI no GitHub Actions (`.github/workflows/ci.yml`): lint + tsc + build + migrations
  num banco vazio + `check:turso --file` — verifica que 0 erros/avisos em banco limpo
- [x] Recuperar `location` a partir da `description`: `scripts/recover-job-location.mjs`
  aplicado — 23 vagas atualizadas (14 REMOTO, 9 HIBRIDO). 26 permanecem NAO_INFORMADO
  por falta de sinal. `url` e `salary` irrecuperáveis (<4 vagas com dado na description)

### fix(migrate-turso): script passa a registrar as migrations aplicadas
- [x] `scripts/apply-turso-migrations.mjs` reexecutava **todas** as migrations a
  cada rodada. As quatro que recriam `Job`/`User` (`CREATE new_X → INSERT…SELECT
  → DROP → RENAME`) não falham numa segunda execução: reescrevem a tabela no
  formato antigo e apagam colunas e dados (reproduzido em teste: `Job` perde
  `userId`, `url`, `location`, `salary`, `appliedAt`; sobra a tabela `new_Job`).
  Reproduzido num banco com dados antes da correção
- [x] Agora: registra o que aplicou em `_turso_migrations`, executa só as
  pendentes, recusa banco existente sem `--baseline`, recusa migration com
  `DROP TABLE` sem `--allow-redefine`, e tem `--dry-run`
- [x] `DEPLOY.md` corrigido (dizia "seguro rodar mais de uma vez") e novo
  `docs/RECUPERACAO_TURSO.md` (diagnóstico + restauração PITR)

### feat(monitoradas) + fix(admin): aba de vagas monitoradas e dono imutável

**feat/monitored-jobs-tab**
- [x] Nova página `/monitoradas` (`app/monitoradas/page.tsx` +
  `components/monitoradas/MonitoredJobList.tsx`): feed das vagas com status
  `MONITORADA` (coletadas pelo n8n), agrupadas por dia (Hoje / Ontem / data),
  com **"Tenho interesse"** (status vira `APLICADA`, data da candidatura = hoje,
  a vaga passa para o dashboard principal) e **"Descartar"** (exclui, com
  confirmação inline). Um painel de vidro por dia, não por vaga, para não pesar
  com muitos itens
- [x] Dashboard principal não lista mais vagas `MONITORADA`: `app/page.tsx`
  filtra `status: { not: "MONITORADA" }` e conta as monitoradas numa terceira
  query do `Promise.all`; novo botão com sino e contador no header
  (`components/dashboard/MonitoredLink.tsx`)
- [x] `lib/jobStatus.ts`: `DASHBOARD_STATUSES` (funil sem `MONITORADA`) usado em
  `StatsBar` e `FilterBar` — a taxa de conversão deixa de contar vagas que
  ainda nem foram candidatadas
- [x] `app/vaga/[id]/page.tsx`: botão de voltar leva para `/monitoradas` quando
  a vaga é monitorada; imports sem uso removidos

**fix/admin-owner-protection**
- [x] `prisma/schema.prisma` + migration `20261013120000_add_user_owner`: campo
  `User.isOwner` (padrão `false`)
- [x] `app/api/admin/users/[id]/route.ts`: nenhum admin consegue alterar o
  `isAdmin` do dono; `isOwner` nunca é lido do body (sem mass assignment)
- [x] `components/admin/UsersTable.tsx`: dono aparece com o selo "Dono" no lugar
  do checkbox
- [x] `scripts/set-admin.mjs`: nova flag `--owner` (define dono + admin)
- [x] `app/admin/page.tsx`: a página agora re-valida `isAdmin` no banco — antes
  só a API fazia isso, então um admin revogado ainda abria `/admin` com o
  cookie JWT antigo (até 30 dias) e via usuários e consumo de IA

**Como aplicar:** ~~`npm run migrate:turso`~~ — **não use essa forma num banco
com dados** (ver correção abaixo). Use
`npm run migrate:turso -- --baseline 20260919131927_add_admin_settings`
(aplica só a migration do dono), depois
`node scripts/set-admin.mjs seu-email --owner` (uma vez por ambiente) e o
deploy. Local: `npx prisma migrate deploy` + `npx prisma generate`. A migration
precisa rodar no Turso **antes** do deploy: o Auth.js lê todas as colunas de
`User` e, sem a coluna, o login quebra.

### Sprint 21 — fix(gemini): modelo corrigido para alias estável
- [x] `lib/gemini.ts`: modelo trocado para `gemini-flash-latest` — alias oficial
  do Google que sempre aponta para o Flash mais recente disponível na chave,
  sem quebrar quando o Google depreca versões específicas. Modelos anteriores
  tentados (`gemini-3-flash-preview`, `gemini-2.0-flash`, `gemini-2.5-flash`)
  retornavam 404 por indisponibilidade no projeto ApplyLens2 ou por
  descontinuação para novos usuários — problema do lado do Google, não do código
- [x] `lib/gemini.ts`: `toFriendlyError` refatorado para normalizar status HTTP
  independente do formato retornado pelo SDK (`.status`, `.httpErrorCode`, ou
  embutido na mensagem como string)

### Sprint 22 — feat(n8n): integracao automática de vagas

Webhook atualizado (`app/api/webhook/n8n/route.ts`):
- Aceita campos opcionais `url` (link original da vaga) e `source`
  (indeed | gupy | infojobs | catho | gmail | manual)
- Valida URL se fornecida
- Registra source no aiUsage para rastreabilidade por canal
- Log no console: qual vaga foi criada e de qual fonte

Workflow n8n implementado (`n8n-workflows/indeed-rss.json`):
- Indeed via RSS feed público — sem autenticação
- Roda a cada 2h, filtra só vagas das últimas 2h
- Extrai título + snippet + URL e envia para /api/webhook/n8n
- Importar direto no n8n: Add workflow → Import from file

Documentação (`docs/N8N_SETUP.md`):
- Guia completo de setup do n8n self-hosted via Docker
- Variáveis de ambiente necessárias (VagaSync + n8n)
- Instrucoes de import do workflow
- Documentação detalhada das fontes pendentes:
  Gupy (API HTTP publica), InfoJobs (RSS), Catho (RSS), Gmail (OAuth2)
- Secao de deduplicacao de vagas (problema a resolver)
- Comando curl para testar webhook manualmente

Proximas fontes a implementar (workflows pendentes):
- feat(n8n): workflow Gupy API
- feat(n8n): workflow InfoJobs RSS
- feat(n8n): workflow Catho RSS
- feat(n8n): workflow Gmail trigger
- fix(webhook): deduplicacao por URL antes de criar vaga

### Sprint 21 — fix(gemini): modelo e retry corrigidos
- [x] `lib/gemini.ts`: modelo trocado para `gemini-3.5-flash` — estável,
  disponível na chave Pro, nome fixo (evita surpresas de alias dinâmico).
  Modelos anteriores tentados: `gemini-3-flash-preview` (instável), 
  `gemini-2.0-flash` e `gemini-2.5-flash` (404 na chave), 
  `gemini-flash-latest` (503 frequente por sobrecarga do alias)
- [x] `lib/gemini.ts`: retry automático com backoff exponencial (até 3x,
  2s e 4s de espera) para erros 503 temporários do servidor do Google
- [x] `lib/gemini.ts`: `toFriendlyError` corrigido para detectar 503 via
  mensagem de texto além do campo numérico; mensagem específica por tipo
  de erro (503, 429, 404, 400) em vez de fallback genérico

### Sprint 20 — UX mais intuitivo + contador de tokens
- [x] `app/nova-vaga/page.tsx`: placeholder do textarea atualizado para
  mencionar LinkedIn, Gupy, Indeed — mais claro de onde colar o texto
- [x] `app/nova-vaga/page.tsx`: botão "Ver como funciona com uma vaga de
  exemplo" — preenche o textarea com uma vaga realista de estágio para quem
  quer testar sem ter uma vaga em mãos
- [x] `components/profile/ProfileForm.tsx` + `app/perfil/page.tsx`: card de
  "Análises de IA hoje" adicionado no perfil — mostra X/Y análises usadas
  com barra de progresso colorida (verde → amarelo → vermelho conforme o
  limite se aproxima) e texto "N restantes" ou "Limite atingido"

### Sprint 19 — Renomeação para VagaSync + Painel de consumo de IA
- [x] Renomeação completa de ApplyLens para VagaSync em todos os arquivos
- [x] `components/admin/AiUsagePanel.tsx`: totais gerais, tabela por usuário
  e gráfico de barras dos últimos 14 dias dentro do painel admin
- [x] `app/admin/page.tsx`: `getAiUsageStats()` no `Promise.all` existente

### Sprint 18 — Sessão persistente
- [x] `auth.ts`: sessão de 30 dias com `updateAge` de 24h — usuário não é
  deslogado automaticamente; renova silenciosamente enquanto ativo

### Sprint 17 — Eliminação do skeleton nas transições
- [x] `lib/prisma.ts`: cache de conexão habilitado em produção (era só dev)
  — eliminava cold start de conexão ao Turso a cada request
- [x] `lib/JobsContext.tsx` + `components/job/VagaContent.tsx`: dados do
  dashboard reutilizados ao navegar para /vaga/[id] — transição instantânea
  sem skeleton nem roundtrip ao servidor
- [x] `components/dashboard/DashboardClient.tsx`: envolto em `JobsProvider`

### Sprint 16 — JWT + Promise.all
- [x] `auth.ts`: strategy "jwt" — `auth()` decodifica cookie local, sem
  query ao banco a cada navegação
- [x] `lib/adminAuth.ts`: re-validação de `isAdmin` no banco em rotas admin
- [x] `app/page.tsx` + `app/vaga/[id]/page.tsx`: queries paralelas com `Promise.all`

### Sprint 15 — Auditoria e hardening de segurança
- [x] Security headers em `next.config.ts` (CSP, X-Frame-Options, etc.)
- [x] `timingSafeEqual` no webhook n8n (timing attack)
- [x] Validação de schema no output do Gemini (prompt injection)
- [x] `unsafe-eval` em CSP só em dev (React dev mode)

### Sprint 14 — Correções pós-deploy
- [x] `proxy.ts`: header `x-pathname` injetado — corrigia 404 nas vagas
- [x] FAB oculto em `/nova-vaga` e `/admin`
- [x] `BackButton` em nova-vaga, admin, perfil, vaga

### Sprints 9–13 — Design visual "vidro" + polish
- [x] Sistema de vidro completo (GlassPanel, glass-input, glass-btn, glass-chip)
- [x] Tipografia Outfit + Inter, filtro SVG de refração
- [x] 100% das páginas convertidas — sem bg-[#1A1B23] ou font-mono terminal
- [x] FAB global de Nova Vaga, BackButton reutilizável
- [x] Loading skeleton espelhando layout real do Dashboard
- [x] Exportar CSV movido para /perfil

### Sprints 1–8 — Core do produto
- [x] Auth OAuth (Google + GitHub), isolamento por usuário
- [x] Dashboard com cards/tabela, busca, filtros, métricas
- [x] Cadastro de vaga em 2 etapas com análise Gemini
- [x] Perfil de usuário + onboarding
- [x] Checklist, requisitos, perguntas prováveis, compatibilidade de skills
- [x] Rate limit por usuário (diário, atômico) + por IP (horário)
- [x] Painel admin: limites globais, override por usuário, promoção de admin
- [x] Painel admin: consumo de IA por usuário e por dia
- [x] Webhook n8n para automação
- [x] Deploy Vercel + Turso em produção

---

## Próximos passos

### 1. Magic Link por e-mail (próxima sprint recomendada)
Auth.js já tem suporte nativo. Falta escolher provedor de envio:
- **Resend** (recomendado): free tier generoso, SDK simples, funciona bem
  com Next.js. `npm install resend` + configurar `EmailProvider` em `auth.ts`.
- Alternativa: Nodemailer com SMTP do Gmail (zero custo, mais configuração).
Benefício: inclui quem não usa Google/GitHub (recrutadores, usuários comuns).
Encaixe pronto: basta um terceiro botão (campo de e-mail) em
`components/auth/LoginButtons.tsx`, que já serve a tela `/login` e a janela de
login do modo visitante. Falta criar a conta no Resend e verificar um domínio.

### 2. Finalizar a automação n8n
Rodando a cada 2h no GitHub Actions (Remotar, GitHub, Himalayas e Gupy →
webhook → `/monitoradas`). Falta:
- Gmail (alertas de vaga por e-mail: LinkedIn, CIEE...) — exige OAuth do
  Google no n8n, então não roda no Actions descartável
- Monitoramento por usuário: hoje tudo vai para `N8N_TARGET_USER_ID`; para
  outros usuários cada conta precisaria da própria config (palavras-chave e
  fontes). Enquanto isso, quem não é o dono vê `/monitoradas` sempre vazia
  com "quando o monitoramento encontrar vagas..." — ajustar esse texto (ou
  esconder a aba) para essas contas
- Dedup — sobras da revisão do PR #33:
  - Índice único `(userId, url)` por migration (fluxo de backup do Turso) e
    conflito tratado como duplicata: fecha a corrida residual de dois envios
    gravando a mesma vaga no mesmo instante
  - Normalizar URL (http/https, barra final, `?utm_*`, `#`) no que é salvo e
    no que é comparado
  - `loadDedupJobs` traz todas as vagas do usuário dos últimos 30 dias a cada
    chamada; filtrar mais no banco se o volume crescer

### 2b. Build instável no CI: download das fontes do Google
`next build` (Turbopack) às vezes falha ao baixar Inter/Outfit do Google
Fonts: `Module not found: Can't resolve
'@vercel/turbopack-next/internal/font/google/font'` + `next/font/google
queries have exactly one entry`. No PR #33 (commit `4cd3098`) o job
"Lint + TypeScript + Build" do run 40584675565 falhou nas tentativas 1 e 2 e
passou na 3, sem mudança de código; o run do pull request (40584836617)
passou de primeira. Lint, testes e migrations passaram em todas. O mesmo erro
apareceu uma vez num build local (Node 22). Causa não confirmada (antes o CI
usava Node 20 e não tinha falhado; a Vercel já builda em Node 22 e passa).
Correção provável, num PR próprio: fontes locais com `next/font/local`
(arquivos `.woff2` no repo) em `app/layout.tsx`, tirando a rede do build.
Detalhes e logs na issue #35.

### 3. Screenshots reais no README
Fazer antes de tornar o repositório público e postar no LinkedIn.
Sugestão: dashboard com vagas reais, tela de análise preenchida, mobile.

### 4. Monitoramento básico em produção
Log estruturado quando `/api/analyze` falhar repetidamente.
Opção simples: Vercel Analytics (já incluso no plano) + alerta por email
via Resend quando `error.tsx` for renderizado N vezes em X minutos.

### 5. Fluidez: vidro dos cards (só se ainda travar)
Cada `JobCard` do dashboard é um `GlassPanel` com `backdrop-filter` + filtro SVG
`#glass-distort`; com muitas vagas o scroll pode pesar em celular. A versão
"vidro leve" nos cards foi testada e **recusada** (perde o efeito). Só voltar a
isso se a fluidez ainda incomodar depois das melhorias de Server Action — e
buscando alternativas que mantenham o visual (ex: `content-visibility: auto`
nos cards fora da tela).

---

## Backlog de longo prazo (não prioritário agora)

### SaaS-1 — Planos e assinaturas
Só executar quando houver decisão de monetizar.
- Schema: `planStatus`, `planExpiresAt`, `stripeCustomerId`, `stripeSubscriptionId`
- Stripe webhook (`customer.subscription.deleted`) + Vercel Cron como fallback
- `lib/planAuth.ts`: `hasActivePlan()` separado de `isAdmin`
- Dados NUNCA apagados na expiração — só `planStatus` muda
- Usuário expirado: banner de renovação, acesso leitura mantido

### Outras ideias documentadas
- Extensão de navegador para capturar vagas sem copiar texto
- Integração direta com Gmail/Notion
- Scraping automático a partir de URL de vaga
- Upload de currículo PDF para comparação com requisitos
- Analytics de uso do produto (diferente do registro de IA)

---

## Explicitamente fora de escopo por enquanto
- Login por senha/credenciais puras (OAuth + Magic Link cobre bem)
- Perfis/papéis além de admin (todo usuário tem os mesmos direitos sobre
  os próprios dados)
