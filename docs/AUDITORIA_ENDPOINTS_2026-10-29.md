# Auditoria de endpoints — 29/10/2026

## Estado de produção

O PR #37 foi integrado (`96981a2`, implementação `77b9b1c`) e o deployment
Production `7402899698` foi confirmado como bem-sucedido. A consulta inicial
detectou ausência de `JobCreationQuota`: o código novo falhava ao cadastrar.

Em 29/10/2026, após autorização de publicação:
- Backup consistente com token somente-leitura, 9 tabelas/270 registros,
  hashes conferidos e `integrity_check`/`foreign_key_check` aprovados.
  Arquivo local ignorado pelo Git: `backups/pre-security-20261029.db`.
- Ensaio na cópia: migration aplicada, todas as 8 tabelas de dados anteriores
  idênticas ao backup (a nona é o histórico de migrations).
- Dry-run de produção confirmou somente `20261028160000_job_creation_quota`.
- Migration aplicada no Turso; conferência posterior: **0 erros**, 1 aviso
  cosmético preexistente em `UserProfile.updatedAt`. Nenhuma vaga apagada.
- Correções complementares no commit `365992a`: 51 testes, lint, TypeScript e
  build locais aprovados. [CI aprovado](https://github.com/luizacoelh/vagasync/actions/runs/40823817437)
  e deployment Production `7404894761` bem-sucedido.
- Verificação HTTP em `https://vagasync.vercel.app`: página pública 200 e
  12 endpoints privados 401 sem autenticação, incluindo criação, perfil, IA,
  administração, exportação e webhooks.
- Teste controlado no Turso real usando `createLimitedJob`: permitiu a última
  unidade da cota e rejeitou o cadastro seguinte com `JobQuotaError`, mantendo
  consumo de IA em zero. Transação revertida obrigatoriamente e ausência de
  usuário/vagas de teste confirmada após rollback.

## Limpeza do incidente e atualização de 30/10/2026

- As ~16 mil vagas de teste de 28/10 saíram quando a dona da instância excluiu,
  direto no Turso, as contas que as criaram (a chave estrangeira apaga as vagas).
  Por isso o backup de 29/10 já tinha só 270 registros. Em 30/10: 90 vagas,
  4 contas, nenhuma linha órfã.
- O arquivo do banco continuou com ~254 MB, ~0,6 MB de dados: páginas livres que
  reaproveitadas pelas próximas gravações; o Turso recusa `VACUUM` pela API. Ver `DEPLOY.md`. O contador mensal de linhas lidas e
  escritas do Turso não diminui: é uso do mês e zera no ciclo de cobrança.
- Risco de várias contas, em duas camadas:
  - teto de contas novas em 24h, 20 por padrão (`lib/signupGuard.ts`, pelo `User.createdAt`;
    quem já tem conta entra sempre);
  - teto global de cadastros manuais em 24h, 500 por padrão, somando todas as contas menos a
    do dono, contado por hora em `GlobalJobHour` (apagar a vaga não devolve espaço).
  Custo aceito: num ataque, cadastro de contas e cadastro manual das outras
  contas param até a janela andar. A primeira versão somava as janelas de 24h de
  cada conta e foi corrigida: janelas espalhadas nunca atingiam o teto (revisão
  do PR #39: 100 contas, 10.000 cadastros em 24h; o "~2×" documentado estava
  errado). Limite real: logins simultâneos podem passar alguns acima das 20
  contas. A análise por IA recusa antes de chamar o
  Gemini quando a vaga não poderia ser salva.
- Sem aviso de abuso: `alerta-volume.yml` confere de hora em hora e falha acima
  dos limites de `lib/volumeReport.ts` (cadastros, contas criando, contas
  novas, IA e estoque de vagas), o que gera e-mail do GitHub. Também falha se
  não conseguir ler o relatório. O log público só mostra os limites que passaram e o valor de cada um.
  O atraso dos agendamentos do GitHub vale aqui também.
- Custo global de IA: desde 31/10/2026 há teto de análises pelo site em 24h, 500
  por padrão, sem o dono. A coleta do n8n tem cota própria. Os três tetos do site
  ficam em `AppSettings`, editáveis em `/admin`. Com o site bloqueado, a análise
  recusa antes de gastar a cota da conta; só uma corrida na última vaga pode gastar.
- Atualização de 31/10/2026: rotas de vagas e perfil e Server Actions de edição
  ganharam limite por conta (`lib/apiQuota.ts`); `GET /api/jobs` passou a paginar;
  exportação e painel admin deixaram de carregar colunas e linhas sem uso. A
  regra que protege a `main` está ativa no GitHub (`DEPLOY.md`, "Proteção da main"). Páginas renderizadas e visitantes seguem sem
  limite por conta; dependem da Vercel.
- Revisão independente somente-leitura (subagente, 30/10): sem achado alto; os
  médios (apagar vagas burlava teto e alerta; workflow passava verde sem ler o
  relatório) e os baixos relevantes foram corrigidos antes do merge. Segunda
  leitura do commit de correções: sem bypass no `signIn`; o limite de ~2× foi
  documentado, e a mensagem de login e o tempo do workflow, corrigidos. Não há
  teste de corrida específico do teto global; uma simulação do revisor com 8
  processos no adapter libSQL não passou de 500.

## Superfícies examinadas

| Entrada | Autorização e proteção |
| --- | --- |
| `/api/jobs` GET/POST | Sessão; usuário da sessão; POST usa cota transacional independente da IA |
| `/api/jobs/[id]` GET/PATCH/DELETE | Sessão e proprietário no filtro; metadados limitados |
| `/api/jobs/export` GET | Sessão, somente vagas próprias, neutralização de fórmulas CSV |
| `/api/profile` GET/PUT | Sessão e perfil próprio; textos até 1.000 caracteres, até 100 skills de 100 caracteres |
| `/api/analyze` POST | Sessão; descrição até min(configuração, 8.000); cota individual e reserva IP antes do Gemini |
| `/api/admin/settings` GET/PUT | Papel admin revalidado no banco; números positivos limitados ao inteiro do banco |
| `/api/admin/users` GET e `/[id]` PATCH | Papel admin revalidado; dono protegido, sem autopromoção; boolean validado |
| `/api/webhook/n8n` POST | Segredo timing-safe; alvo configurado no servidor; cotas de cadastro e tentativas de IA |
| `/api/webhook/n8n/check` POST | Mesmo segredo; até 300 candidatas, corpo até 1 MiB |
| `/api/webhook/n8n/volume` GET | Mesmo segredo; só contagens, sem ids nem e-mails; não grava |
| Server Actions de vagas | Sessão e proprietário; IDs individuais validados e lotes até 200 |
| Auth.js e páginas | OAuth gerenciado pelo Auth.js; admin revalidado; vaga real exige proprietário; visitante recebe exemplos |

APIs próprias que recebem JSON limitam o corpo real antes de parsear (64 KiB,
exceto checagem em lote n8n). Server Actions mantêm o limite de transporte do
Next.js e validam campos no servidor. Não foi encontrada rota própria que
permita leitura ou escrita anônima de dados privados.

## Cotas e comportamento

- Cadastro manual: 10/minuto, 100/janela de 24h. API e Action compartilham cota.
- n8n: 60/minuto e 500/janela de 24h para criação e, separadamente, tentativas
  de IA (`n8n-analysis`, mesma tabela de contadores, sem nova migration).
- Teto de 2.000 vagas por usuário, inclusive descartadas. Excluir não devolve
  cota temporal. As janelas são fixas a partir da primeira reserva, não móveis.
- Reserva IP usa escrita, contagem e inserção de `AiUsage` na mesma transação:
  chamadas em andamento e falhas contam. O painel manual passa a registrar
  tentativas com estimativa de tokens, não apenas análises bem-sucedidas.
- Bloqueio por IP pode consumir a cota individual já reservada. A reserva não
  é devolvida em falhas. Nenhuma falha de persistência libera chamada à IA.
- IP depende de proxy confiável que sobrescreva `x-forwarded-for` (Vercel).

## Limites da conclusão

Revisão de código e testes locais com SQLite descartável e Gemini simulado,
incluindo autenticação, isolamento, payloads e concorrência. Uma revisão
independente somente-leitura conferiu endpoints e alterações.
Não houve teste de carga/ataque em produção; apenas a checagem HTTP e o teste
transacional com rollback descritos acima. Cotas por conta não são um teto
global do banco: múltiplas contas OAuth e retenção de histórico ainda exigem
monitoramento e controles de infraestrutura. Leituras e atualizações repetidas
também podem consumir recursos; WAF e orçamento global não foram verificados.
Isso não é uma garantia de inexistência de qualquer vulnerabilidade.
