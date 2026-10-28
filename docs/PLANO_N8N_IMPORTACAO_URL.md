# Plano — correções do n8n, novas fontes e cadastro de vaga por URL

Documento de trabalho para organizar a execução no Maestri. **Status:** E0
(seção 1.1, 1.2 e contagem por busca) implementada em `fix/n8n-idioma-origem`;
o resto ainda não. Diagnóstico feito em 28/10/2026, depois dos PRs #33 e #34.
A issue #35 (fontes do Google no build) fica fora deste plano.

Legenda usada em todo o documento:

- **[Confirmado]** — verificado diretamente: código do repositório, banco de
  produção (consultas só de leitura), logs do GitHub Actions ou execução local
  do código real do workflow.
- **[Subagente]** — levantado por um subagente de pesquisa (requisições HTTP e
  leitura de robots.txt/ToS em 28/10/2026). Não foi repetido pelo agente
  principal.
- **[Hipótese]** — inferência ainda não verificada.

---

## Contexto: estado atual da coleta

### Fontes ativas [Confirmado]

`n8n-workflows/vagas-br.json`, 23 buscas, todas respondendo HTTP 200 em
28/10/2026. Funil de uma amostra (uma rodada, código real dos nós "Fontes" e
"Montar vagas" executado localmente):

| Fonte | Buscas | Únicas na janela de datas | Passam no filtro | Observações |
|---|---|---|---|---|
| Remotar (API JSON) | 5 (`estágio`, `estagio`, `júnior`, `junior`, `trainee`) | 20 | 8 | Até 50 itens por busca, sem paginação |
| GitHub (issues) | 4 repositórios | 11 | 5 | Nesta amostra, as 5 vieram de `soujava/vagas-java` |
| Himalayas (API JSON) | 3 | 17 | 3 | Republica vagas da Gupy (mesma vaga apareceu nas duas) |
| Gupy (`__NEXT_DATA__`) | 11 | 43 | 2 | 30 recusadas por local (presencial/híbrido fora de Teresina/PI), o que é o comportamento esperado do filtro |

Total da amostra: 476 itens brutos → 18 candidatas, 2 delas de estágio. O teto
de 40 envios por rodada não foi atingido.

Motivos de recusa na amostra (primeiro critério que falhou):

- Gupy: local 30, área não é TI 5, título de outra área 3, exige inglês 2, área fora 1.
- Himalayas: nível 9, título de outra área 3, área fora 1, idioma 1.
- Remotar: local 4, **idioma 3**, nível acima 2, nível 2, exige 2+ anos 1.
- GitHub: local 4, nível 2.

### Execuções recentes [Confirmado]

- 12 execuções de 26/10 a 28/10/2026, todas com sucesso.
- O agendamento é a cada 2h, mas os intervalos reais ficaram entre 4,5h e 6,7h
  (o GitHub atrasa/pula agendamentos).
- Primeiras execuções com o código do PR #33 (28/10, 07:36 manual e 08:26
  agendada): 18 candidatas, checagem em lote "0 novas, 18 já cadastradas", 0
  envios, 0 chamadas de IA. As 18 foram reconhecidas pela URL exata; nenhuma
  pela regra de título + empresa.
- Vagas criadas por dia (todas as origens): 25/10: 17 (primeira carga),
  26/10: 8, 27/10: 3, 28/10: 2.

Aproveitamento das vagas com URL dessas fontes, últimos 14 dias (status atual):

| Fonte (pelo host da URL) | Aplicadas | Descartadas | Monitoradas |
|---|---|---|---|
| Himalayas | 5 | 2 | 1 |
| Remotar | 2 | 5 | 5 |
| Gupy | 1 | 0 | 2 |
| GitHub `soujava/vagas-java` | 0 | 0 | 5 |
| GitHub `backend-br/vagas` | 0 | 1 | 0 |

Essa tabela só pôde ser montada pelo host da URL porque a origem não é gravada
(ver 1.2).

---

## 1. Correções atuais do n8n

### 1.1 Filtro de idioma recusa descrições válidas em português

**Problema [Confirmado].** `emPortugues()` (nó "Montar vagas") exige ao menos 4
ocorrências de uma lista fixa de palavras (`você`, `vaga`, `requisitos`,
`benefícios`...). Descrições curtas do Remotar, escritas em português, não
atingem o mínimo. Exemplos reais de 28/10/2026, todos com 2 ocorrências:

- "Estágio em Inteligência Artificial" — remoto, 601 caracteres → recusada.
- "Programa de Estágio em Segurança da Informação" — 804 caracteres (também
  seria recusada por local: híbrido em Belo Horizonte).
- "Estágio em Contabilidade: Dados e Inteligência Artificial" — 593 caracteres.

**Proposta.**

- Trocar a contagem fixa por uma proporção de palavras funcionais do
  português (`de`, `da`, `do`, `em`, `para`, `com`, `que`, `uma`, `os`, `as`,
  `no`, `na`...) sobre o total de palavras, comparada com a proporção de
  palavras funcionais do inglês e do espanhol (`the`, `and`, `of`, `to`,
  `with`, `y`, `el`, `los`, `con`...). Português vence quando a proporção dele
  é maior; empate ou texto curto demais (< ~40 palavras) **não recusa**.
- Se a dúvida persistir, aceitar e deixar a decisão para a usuária em
  `/monitoradas` (descartar custa um clique; perder a vaga não tem volta).

**Hipótese a validar.** A proporção separa bem PT de EN/ES nas fontes atuais.
Validar com as amostras reais (vagas em inglês do Himalayas/RemoteOK e as
descrições curtas do Remotar) antes de trocar.

**Arquivos.** `n8n-workflows/vagas-br.json` (nó "Montar vagas"),
`tests/n8nWorkflow.test.mjs`, `docs/N8N_SETUP.md`.

### 1.2 Registro da origem (`Job.source`)

**Fatos [Confirmado].**

- Significado atual do campo: **canal de entrada** da vaga. Migration
  `20261022120000_add_job_source_ai_fields`: "diferencia vagas manuais das
  coletadas pelo n8n (valores esperados: `"manual"` | `"n8n"`)". Comentário no
  `prisma/schema.prisma` igual. `NOT NULL DEFAULT 'manual'`.
- Usos no código: **nenhuma leitura**. Não aparece em `JOB_SUMMARY_SELECT`,
  `types/job.ts`, exportação CSV, Server Actions nem na interface.
- Escrita: nenhuma. `createJob` (cadastro manual) usa o default; o webhook do
  n8n valida o `source` recebido (`remotar`, `gupy`...) mas **não grava** no
  `Job` — usa o valor só na resposta HTTP e em `AiUsage.action`
  (`analyze_job_webhook_<fonte>`).
- Resultado em produção: as 78 vagas têm `source = "manual"`, inclusive as que
  vieram do n8n.

**Proposta.**

- Manter o significado do campo como **canal**: o webhook passa a gravar
  `source: "n8n"`. Não gravar nomes de provedores (`gupy`, `remotar`...) nesse
  campo, para não misturar dois conceitos numa coluna que já tem contrato
  documentado.
- O provedor pode ser derivado do host da URL (como foi feito na tabela de
  aproveitamento acima), sem coluna nova. Se for preciso guardar o provedor
  explicitamente (ex.: vaga sem URL ou métricas por fonte na interface), criar
  uma coluna própria (ex.: `provider`) por migration, seguindo o fluxo do
  Turso — decisão a tomar depois, não necessária para esta correção.
- Atualizar o comentário do schema e a documentação dizendo que `source` é o
  canal e quais valores existem.
- **Vagas antigas:** não há como saber com segurança quais das 78 vieram do
  n8n só pelo `Job` (vagas manuais também têm URL). Não fazer backfill. Se um
  dia for desejado, mostrar o SQL e esperar confirmação (regra do projeto).

**Arquivos.** `app/api/webhook/n8n/route.ts`, `prisma/schema.prisma`
(só comentário; sem migration), `docs/N8N_SETUP.md`, `ARCHITECTURE.md`.

### 1.3 Observações da coleta que não entram nesta correção

- **Agendamento real ~6h em vez de 2h [Confirmado].** Impacto baixo porque
  cada execução olha os últimos 7 dias (30 na Gupy). Opções futuras: aceitar e
  documentar, ou disparo externo (exige token).
- **Buscas sem resultado na amostra [Confirmado, amostra única].** As 6 buscas
  nacionais de estágio da Gupy e duas do Himalayas (`desenvolvedor`,
  `estagio`) não trouxeram nenhuma vaga aprovada nesta rodada. **Não remover
  com base numa amostra.** Proposta: incluir no log do Actions o número de
  itens e aprovadas por busca e decidir depois de ~2 semanas de dados.
- **Regra "exige 2+ anos" pode atingir estágio [Hipótese].** Um estágio foi
  marcado por essa regra, mas também caiu por local; pode ser texto como
  "mínimo de 2 anos para se formar". Verificar com mais exemplos.
- Já registrados no `ROADMAP.md`: índice único `(userId, url)`, normalização
  de URL, consulta de deduplicação mais enxuta, Gmail, monitoramento por usuário.

---

## 2. Avaliação de novas fontes

Toda esta seção é **[Subagente]** (testes em 28/10/2026, User-Agent
`VagaSync-n8n`, poucas requisições, sem login), salvo indicação. Restrições do
ambiente: Actions descartável, sem navegador, sem OAuth, sem estado.

| Fonte | Acesso | Filtros úteis | Volume relevante observado | robots / termos | Situação |
|---|---|---|---|---|---|
| **Sólides** (`vagas.solides.com.br`) | Listagem em HTML Next (RSC); detalhe com JSON-LD `JobPosting` | Pelo caminho: `/vagas/estagio-tecnologia/remoto`, `/vagas/estagio/teresina-pi`, `/vagas/area/tecnologia/teresina-pi`, `/vagas/desenvolvedor-junior/remoto`; paginação `?page=` | ~13 estágios em tecnologia remotos (~9 de TI); 9 estágios em Teresina (1 de TI); 25 de tecnologia em Teresina | robots `Allow: /`; termos genéricos proíbem "cópia/reprodução" (incerto) | **Candidata — viabilidade a confirmar** |
| Super Estágios | JSON via POST (`comunicacaoAjax/vagas.php`) | Estado, cidade, curso, modalidade; **sem data** | ~1 de TI em Teresina; ~2 home office | robots sem restrição; termos incertos | Talvez |
| Programathor | HTML + JSON-LD no detalhe | `contract_type`, `expertise`, `remoto` | ~1–2 úteis por rodada | robots libera `/jobs` | Talvez |
| Nube | API JSON | tipo, área, modalidade | ~2 remotas de TI; 0 no PI | robots sem restrição; termos não encontrados | Talvez |
| CIEE | API JSON | só tipo de vaga | 0 de TI no PI; sem data/modalidade | incerto | Não incluir |
| Vagas.com.br | HTML + JSON-LD | termo no caminho | ~0–1 passariam | robots libera as páginas usadas | Não incluir |
| Coodesh | sitemap + JSON-LD | nenhum | quase tudo em inglês | API com `Disallow: /` | Não incluir |
| Trabalha Brasil | HTML + JSON-LD | termo ignorado | incerto | termos proíbem reprodução | Não incluir |
| GeekHunter, Remotive | — | — | — | robots bloqueia | Não incluir |
| RemoteOK | API JSON | — | 0 em português | exige atribuição | Não incluir |
| Novos repositórios GitHub | API | — | ~1 issue/mês, nenhuma júnior | público | Não incluir |
| Inhire, Recrutei, Abler | sem portal agregado | — | — | — | Não incluir |
| Editais PI/Teresina | PDF | — | sem feed | — | Não incluir |

### Sólides — o que falta confirmar antes de implementar

Mantida como candidata. Itens a verificar numa etapa curta de prova de
conceito (sem mexer no workflow de produção):

1. **Termos de uso [Hipótese de risco baixo para uso pessoal, não verificada
   juridicamente].** Ler os termos completos e decidir se o uso é aceitável.
2. **Estabilidade do formato [Hipótese].** A listagem vem em payload RSC
   (texto com JSON escapado), mais frágil que `__NEXT_DATA__`. Medir em alguns
   dias se o formato se mantém; o JSON-LD do detalhe tende a ser mais estável.
3. **Custo por rodada.** São 2 requisições por vaga (listagem + detalhe).
   Ler o detalhe só das que passarem num pré-filtro por título, data e local.
4. **Volume real ao longo do tempo.** Os números acima são de um único dia.
5. **Sobreposição** com Gupy/Himalayas: o subagente não encontrou, mas a regra
   de título + empresa (`lib/jobDedup.ts`) cobriria se aparecesse.

Se os itens 1 e 2 forem aceitáveis, implementar como fonte nova no mesmo
padrão das demais (busca em "Fontes", parse em "Montar vagas", testes com
HTML salvo).

---

## 3. Cadastro de vaga por URL e ajustes no onboarding

### 3.1 Fluxo

1. `/nova-vaga` ganha duas abas: **Link da vaga** (padrão) e **Colar texto**
   (fluxo atual, intacto).
2. A usuária cola o link. Antes de baixar, o servidor procura a URL entre as
   vagas dela (`lib/jobDedup.ts`); se existir: "Você já cadastrou esta vaga",
   com link para ela.
3. Nova rota (ex.: `POST /api/vaga/importar`) baixa a página e devolve
   `{ texto, titulo?, empresa?, urlFinal, site, avisos[] }`.
4. **Confirmação 1 — "É esta vaga?":** título, empresa e site, com o texto
   extraído visível e editável. Ações: "Analisar com IA" ou "Não é isso — colar
   o texto". Só depois disso a IA roda.
5. Análise pela rota existente `/api/analyze` e a prévia atual, já com a URL
   preenchida. **Nada é gravado antes de "Salvar"** (Server Action `createJob`).

### 3.2 Extração (sem IA)

Ordem de tentativa:

1. Adaptadores por site conhecido: Gupy (`__NEXT_DATA__` da página da vaga),
   Remotar (API pública por id), GitHub (API de issues), Himalayas, Sólides
   (JSON-LD). [Confirmado em 28/10: páginas de vaga da Gupy e do Remotar
   respondem 200 a um acesso simples de servidor e trazem `__NEXT_DATA__`.]
2. JSON-LD `JobPosting` genérico (Programathor, Vagas.com.br, Sólides,
   Coodesh... segundo o subagente).
3. Último recurso: maior bloco de texto da página, sem `script`, `style`,
   menu e rodapé.

Texto final limitado ao `maxDescriptionLength` atual (8000).

**Qualidade do texto — sem filtro de idioma eliminatório.** Ao contrário do
n8n, o cadastro por URL **não recusa por idioma**: a vaga foi escolhida pela
usuária, e o filtro do n8n já descartou descrição válida (ver 1.1). Critérios
só de leitura bem-sucedida: texto mínimo (~300 caracteres) e sinais de página
de vaga (título, ou JSON-LD, ou termos como requisitos/atividades). Se o texto
for curto ou estranho, **mostrar mesmo assim** na confirmação, com o aviso "o
texto parece incompleto" e a opção de colar o texto — nunca descartar
automaticamente.

### 3.3 Sites bloqueados e alternativa de colar texto

- Lista conhecida, sem tentar baixar: LinkedIn, Indeed, Glassdoor, Catho
  ("Esse site não permite leitura automática. Copie o texto da vaga e cole
  aqui"). [Confirmado em 28/10: Indeed respondeu 401 com bloqueio; Catho já
  respondia 403 no diagnóstico anterior. LinkedIn: exige login e os termos de
  uso não permitem leitura automática.]
- Detecção após tentar: HTTP 401/403/429/999, páginas de captcha ou desafio
  (Cloudflare), exigência de login, página só em JavaScript (pouco texto),
  tempo esgotado → mesma alternativa, nunca erro genérico.
- A alternativa abre a aba de texto **com o link já preenchido**; o link é
  salvo junto com a vaga.
- Sem contornar bloqueios: sem navegador automatizado, proxy ou cookies.

### 3.4 Autenticação e limites

- A rota exige login (`requireUser`). Visitante: o clique em "Buscar" abre a
  janela de login (`useLoginGate`); o link digitado volta depois do login
  (mesmo mecanismo do rascunho de texto em `sessionStorage`).
- Visitante tem um "link de exemplo" com extração e análise prontas (sem rede
  e sem IA), como o texto de exemplo atual.
- Limites de importação por usuário (ex.: 20/hora, 60/dia) e por IP, contados
  no banco. A análise segue com a cota diária de IA existente.
- Mensagens de erro não ecoam o HTML da página nem o IP de destino.

### 3.5 Proteção do servidor ao acessar URLs (SSRF)

1. Só `http`/`https`, portas 80 e 443, sem `usuário:senha@`, URL com até 2000
   caracteres.
2. Resolver o DNS e recusar endereços internos ou reservados: `127.0.0.0/8`,
   `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
   (inclui `169.254.169.254`), `100.64.0.0/10`, `0.0.0.0/8`, `::1`,
   `fc00::/7`, `fe80::/10`, IPv4 mapeado em IPv6 (`::ffff:`), multicast.
3. Conectar no IP validado (lookup próprio no agente HTTP), para o endereço
   não mudar entre a checagem e a conexão (DNS rebinding).
4. Redirecionamentos seguidos manualmente, no máximo 3, validando cada destino.
5. Tempo total máximo 8 s; corpo máximo 2 MB (interrompe o download); só
   `text/html`, `application/json`, `application/ld+json`; sem cookies;
   User-Agent identificável; nunca executar JavaScript.
6. Só texto limpo volta ao navegador; logs sem a query string da URL.
7. Rota em runtime `nodejs`, com `maxDuration` explícito. Antes de escrever a
   rota, ler a documentação de Route Handlers em `node_modules/next/dist/docs/`
   (regra do projeto, Next 16).

### 3.6 Origem da vaga importada

Seguindo 1.2: `source` continua sendo o canal. Duas opções, a decidir:

- **(A, recomendada)** gravar `source: "manual"` — foi a usuária que cadastrou;
  o site sai do host da URL.
- (B) introduzir o canal `"url"`. Muda o contrato documentado do campo
  (`"manual" | "n8n"`); se escolhida, atualizar schema (comentário), docs e
  quem vier a ler o campo.

### 3.7 Ajustes no onboarding visual

- Passo 1 de `OnboardingSteps`: "Cole o link ou o texto da vaga".
- Convite do visitante e dashboard vazio: botão "Adicionar pelo link".
- `lib/demoJobs.ts`: link de exemplo + extração pronta.
- Estado "não consegui ler esta página" com visual próprio e o botão
  "Colar texto".

### 3.8 Decisões em aberto

1. Parser de HTML: dependência leve (ex.: `node-html-parser`, recomendada) ou
   só expressões regulares.
2. Contador de importações: reaproveitar `AiUsage` com ação `import_url`
   (sem migration, recomendada) ou tabela própria (migration + fluxo do Turso).
3. Confirmação do texto antes da IA (recomendada) ou análise direta.
4. Origem da vaga importada: opção A ou B de 3.6.
5. Lista inicial de sites bloqueados.

---

## 4. Critérios de aceitação e divisão de tarefas

### 4.1 Critérios de aceitação

**Correções do n8n (seção 1)**

- [ ] As três descrições reais citadas em 1.1 (salvas como fixture) passam no
      teste de idioma; vagas em inglês e espanhol continuam recusadas.
- [ ] Nenhum texto curto ou ambíguo é recusado só por idioma.
- [ ] Vaga criada pelo webhook grava `source = "n8n"`; cadastro manual
      continua `"manual"`; nenhum nome de provedor é gravado em `source`.
- [ ] Comentário do schema e docs descrevem `source` como canal.
- [ ] Log do Actions mostra itens e aprovadas por busca (base para decidir
      sobre buscas sem retorno — nenhuma busca removida nesta etapa).
- [ ] `npm run lint`, `npm test` e `npm run build` passam; ensaio local com
      SQLite descartável; nenhuma alteração manual em produção.

**Sólides (seção 2)**

- [ ] Prova de conceito documentada: termos de uso lidos, formato observado em
      pelo menos 3 dias, volume e sobreposição medidos.
- [ ] Só depois disso: implementação com testes a partir de HTML salvo.

**Cadastro por URL (seção 3)**

- [ ] Links da Gupy, do Remotar e de uma página com JSON-LD geram texto,
      título e empresa corretos (testes com HTML salvo, sem rede no CI).
- [ ] LinkedIn/Indeed levam à alternativa de colar texto, com o link
      preservado e salvo junto com a vaga.
- [ ] Texto curto ou em outro idioma é mostrado com aviso, nunca descartado.
- [ ] Link já cadastrado mostra "Você já cadastrou esta vaga" sem baixar a página.
- [ ] Nada é gravado antes de "Salvar"; a IA só roda após a confirmação.
- [ ] Rota recusa sem login (401); visitante vê a janela de login e o link
      volta depois.
- [ ] Limites por usuário e IP funcionando; mensagens sem detalhes internos.
- [ ] Testes de SSRF: cada faixa de 3.5 recusada; redirecionamento para
      endereço interno recusado; porta fora de 80/443 recusada; resposta acima
      de 2 MB e acima de 8 s interrompidas.
- [ ] Onboarding e exemplo do visitante atualizados; docs (`ROADMAP.md`,
      `ARCHITECTURE.md`, `docs/`) atualizados.
- [ ] Revisão por um agente que não participou da implementação, com os
      achados relevantes corrigidos.

### 4.2 Divisão de tarefas (máximo de duas frentes simultâneas)

| Etapa | Escopo | Arquivos principais | Depende de | Paralelo com |
|---|---|---|---|---|
| E0 | Correções 1.1 e 1.2 + contagem por busca no log | `n8n-workflows/vagas-br.json`, `app/api/webhook/n8n/route.ts`, `scripts/n8n-execution-summary.mjs`, `prisma/schema.prisma` (comentário), testes, docs | — | E1 |
| E1 | `lib/safeFetch` (SSRF, limites de tempo e tamanho) + testes | `lib/safeFetch.ts`, `tests/` | — | E0 ou E2 |
| E2 | Extratores (adaptadores, JSON-LD, último recurso) + fixtures + testes | `lib/jobImport/`, `tests/fixtures/` | — | E1 |
| E3 | Rota de importação (login, limites, duplicata, bloqueios, erros) | `app/api/vaga/importar/route.ts` | E1, E2 | — |
| E4 | Interface de `/nova-vaga` (abas, confirmação, alternativa, visitante) | `app/nova-vaga/page.tsx`, componentes | contrato da E3 (pode começar com dados simulados) | E5 |
| E5 | Onboarding, exemplo do visitante, docs | `components/onboarding/`, `lib/demoJobs.ts`, docs | E4 | E4 (arquivos distintos) |
| E6 | Revisão independente + validação final | — | tudo | — |
| S1 | Prova de conceito da Sólides (sem alterar produção) | relatório em `docs/` | — | qualquer etapa |

Regras do `AGENTS.md` para a execução: escopo e arquivos definidos por agente,
worktrees separados para trabalho paralelo, o agente principal integra e
valida (`npm run lint`, `npm test`, `npm run build`), e o relato final informa
o que foi delegado e o resultado das validações.
