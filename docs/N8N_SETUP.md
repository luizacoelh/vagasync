# VagaSync — Integração n8n

## Visão geral

O n8n monitora fontes de vagas a cada 2 horas e envia automaticamente para o
VagaSync via webhook. O Gemini analisa cada vaga e ela aparece no dashboard.

```
[Fonte de vagas]
    ↓ (n8n, a cada 2h)
[Filtra vagas recentes]
    ↓
[Extrai texto]
    ↓
POST /api/webhook/n8n
    ↓
[Gemini analisa]
    ↓
[Dashboard VagaSync]
```

---

## 1. Instalar n8n self-hosted

A opção mais simples sem precisar de VPS é rodar localmente via Docker:

```bash
# Instalar Docker Desktop (Windows): https://www.docker.com/products/docker-desktop/

# Rodar n8n localmente
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

Acessa em: http://localhost:5678

> Para rodar em produção (24/7 sem depender do seu computador), o Railway.app
> tem plano free que suporta n8n. Outro opção é o Render.com.
> Tutorial Railway: https://docs.n8n.io/hosting/installation/railway/

---

## 2. Variáveis de ambiente no VagaSync

Adicionar no `.env` (local) e nas variáveis da Vercel (produção):

```env
# Segredo compartilhado entre VagaSync e n8n — gere um aleatório forte
# Sugestão: openssl rand -hex 32
N8N_WEBHOOK_SECRET=seu_segredo_aqui

# ID do seu usuário no banco — encontre em /admin ou no Turso
N8N_TARGET_USER_ID=seu_user_id_aqui
```

---

## 3. Variáveis no n8n

No n8n, vá em **Settings → Variables** e crie:

| Nome | Valor |
|---|---|
| `VAGASYNC_WEBHOOK_URL` | `https://seu-projeto.vercel.app/api/webhook/n8n` |
| `N8N_WEBHOOK_SECRET` | (mesmo valor do .env) |
| `INDEED_KEYWORDS` | `desenvolvedor+react` (ou o que quiser buscar) |
| `INDEED_LOCATION` | `Remoto` (ou cidade) |
| `GUPY_JOB_NAME` | `desenvolvedor` |
| `GUPY_CITY` | (opcional — deixe vazio para todas as cidades) |

---

## 4. Importar o workflow

O fluxo em uso é `n8n-workflows/vagas-br.json` ("VagaSync — Vagas BR"):

```
A cada 2h ─┐
Manual ────┴→ Fontes → Buscar vagas → Montar vagas → Checar já cadastradas
                                                   → Separar novas → Enviar para VagaSync
```

- **Fontes**: lista de URLs — busca do Remotar (`estágio`, `júnior`,
  `trainee`), issues abertas de `frontendbr/vagas`, `backend-br/vagas`,
  `react-brasil/vagas` e `soujava/vagas-java` (GitHub: 60 req/h sem token,
  1000 com o `GITHUB_TOKEN` do Actions), a busca do Himalayas e 11 buscas de
  estágio na Gupy (remoto do Brasil todo + Piauí).
- **Buscar vagas**: devolve o corpo como **texto** (a Gupy responde HTML);
  o `Montar vagas` faz o parse.
- **Montar vagas**: normaliza os quatro formatos, pega as publicadas nos
  últimos 7 dias (30 na Gupy, se o prazo de inscrição não passou), aplica o
  filtro de perfil e devolve as candidatas (até 300), estágio primeiro,
  intercalando as fontes. Cada uma leva `title` e `company` como a fonte
  publicou (`company` vazio no GitHub, que não tem esse campo). O perfil fica
  nas constantes do topo do código: `ESTADO_LOCAL`/`CIDADES_LOCAIS`
  (presencial/híbrido só em Teresina/PI; remoto de qualquer lugar),
  `NIVEL_OK`/`NIVEL_FORA` (estágio–júnior), `AREA_TI`/`AREA_FORA`/`NAO_TI`,
  `EXIGE_INGLES`, `EXIGE_ANOS` (2+ anos), `CATEGORIAS_REMOTAR` e o teste de
  português. Para trocar de estado, mude `ESTADO_LOCAL`/`CIDADES_LOCAIS` e a
  busca `state=` da Gupy em "Fontes".
  - **Área (TI ou não)** sai do **título**, não da descrição: texto de vaga de
    marketing fala em "autodesenvolvimento" e "sistemas" e passava. No Remotar
    contam também as categorias (já filtradas por `CATEGORIAS_REMOTAR`); no
    GitHub os repositórios já são só de desenvolvimento. Título de outra área
    (`NAO_TI`: marketing, vendas, comercial, RH, jurídico, administrativo...)
    cai, a menos que também tenha algo de TI ("Analista de Dados de
    Marketing" passa). As categorias do Himalayas **não** são usadas: vaga de
    "Desenvolvimento de Negócios" vem com "Estágio-em-Desenvolvimento".
- **Checar já cadastradas**: uma única chamada (`executeOnce`) a
  `POST /api/webhook/n8n/check` com `{ vagas: [{ url, title, company }] }`
  de todas as candidatas. Responde os índices das que ainda não existem (ver
  seção 6). Não grava nada nem chama a IA.
- **Separar novas**: fica só com as novas e aplica o teto de **40 envios por
  rodada** (`MAX_POR_EXECUCAO`) sobre elas. Assim vagas antigas que
  reaparecem no feed nunca ocupam a fila. Se a checagem falhar (rede, deploy
  sem a rota), volta ao comportamento antigo: as 40 primeiras candidatas, e o
  webhook deduplica uma a uma.
- **Enviar para VagaSync**: 1 vaga a cada 8s (abaixo do limite por minuto
  do Gemini), com `description`, `url`, `source`, `title` e `company`,
  autenticado pela credencial *Header Auth* (`x-webhook-secret`, a mesma da
  checagem). Erro numa vaga não para as outras; ela é tentada de novo na
  próxima rodada.

Importar/atualizar pela CLI (o arquivo tem `id` fixo, então reimportar
substitui o mesmo workflow):

```bash
docker cp n8n-workflows/vagas-br.json n8n:/tmp/vagas-br.json
docker exec n8n n8n import:workflow --input=/tmp/vagas-br.json
# só se quiser o agendamento no PC em vez do GitHub Actions (seção 7):
docker exec n8n n8n publish:workflow --id=qNi4pLxpKJ1N6moj
docker restart n8n   # publish pela CLI só vale depois de reiniciar
```

Rodar uma vez na hora, sem esperar o agendamento (a porta extra evita
conflito com o task broker do n8n que já está rodando):

```bash
docker exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=qNi4pLxpKJ1N6moj
```

A credencial *Header Auth account* precisa existir no n8n com o header
`x-webhook-secret` = `N8N_WEBHOOK_SECRET`. A aba **Variables** do n8n é
recurso pago — não use `$vars` para o segredo.

`weworkremotely-rss.json` (desativado): o feed do We Work Remotely parou de
atualizar em 06/10/2026. `indeed-rss.json` é o template antigo.

---

## 5. Fontes disponíveis

### ✅ Remotar (implementado — `vagas-br.json`)
API pública `https://api.remotar.com.br/jobs?search=TERMO` (50 por página).
Vagas remotas/híbridas brasileiras com tags de nível ("Estágio", "Júnior",
"Sênior"), de idioma e categorias ("Programação", "QA", "DevOps"...) — a
fonte principal para estágio/júnior. URL da vaga: `remotar.com.br/job/ID`.

### ✅ GitHub — repositórios de vagas BR (implementado — `vagas-br.json`)
Volume medido em out/2026: ~10 vagas/semana somando `frontendbr`, `backend-br`
e `react-brasil`. Outros repositórios (`qa-brasil`, `phpdevbr`,
`androiddevbr`, `datascience-br`) estão quase parados.

### ✅ Himalayas (implementado — `vagas-br.json`)
API pública `https://himalayas.app/jobs/api/search` (`q`, `country`,
`sort=recent`; `seniority=Entry-level` também funciona). Maioria internacional
e em inglês: o filtro só aceita vagas com `Brazil` em `locationRestrictions`
e texto em português, o que deixa poucas.

### ✅ Gupy (implementado — `vagas-br.json`)
Os endpoints JSON antigos (`portal.api.gupy.io`, `employability-portal.gupy.io`)
respondem 404 desde out/2026, mas a página de busca do portal já vem com as
12 vagas mais recentes no HTML, dentro de `<script id="__NEXT_DATA__">`
(`props.pageProps.initialJobList.data`, com descrição completa). O
`robots.txt` do portal libera tudo. Filtros vão no caminho:

```
https://portal.gupy.io/job-search/term=estágio ti&type=vacancy_type_internship&sortBy=publishedDate&sortOrder=desc&workplaceTypes=remote
```

(`state=Piauí` no lugar de `workplaceTypes` para presencial/híbrido). A
paginação (`offset`) é ignorada, então cada busca rende só 12 — por isso são
várias buscas estreitas. A busca casa o termo no título e ignora o tipo
`talent_pool` com `type=vacancy_type_internship`. Medido em out/2026: estágio
remoto de TI é pouco e quase sempre pede inglês; o Piauí tem ~1 vaga de TI
por mês.

### ⛔ Trampos.co
API pública existe, mas só tem marketing, design e comercial.

### ⛔ InfoJobs e Catho
Medido em out/2026: o "RSS" do InfoJobs devolve a página HTML comum e a
Catho responde 403. As seções abaixo são do plano antigo.

### ⛔ Indeed (template antigo — `indeed-rss.json`)
- **Método:** RSS feed público
- **URL:** `https://br.indeed.com/rss?q=KEYWORDS&l=LOCATION&sort=date`
- **Autenticação:** nenhuma
- **Frequência recomendada:** a cada 2h
- **Notas:** o snippet do RSS é curto (~200 chars). Funciona bem para análise
  básica. Se quiser o texto completo da vaga, adicionar um nó HTTP Request
  para fazer scraping da página da vaga (URL vem no item RSS).

---

### ⛔ InfoJobs (plano antigo — RSS não existe mais)
- **Método:** RSS feed público
- **URL:** `https://www.infojobs.com.br/vagas-de-emprego/rss.aspx?palabra=desenvolvedor`
- **Autenticação:** nenhuma
- **Frequência recomendada:** a cada 4h (atualiza menos que Indeed)
- **Notas para implementar no n8n:**
  - Mesmo padrão do Indeed — nó RSS Feed Read
  - Campos: `title`, `link`, `contentSnippet`, `pubDate`
  - Enviar para VagaSync com `source: 'infojobs'`

---

### ⛔ Catho (plano antigo — responde 403)
- **Método:** RSS feed público
- **URL:** `https://www.catho.com.br/vagas/rss/?q=desenvolvedor`
- **Autenticação:** nenhuma
- **Frequência recomendada:** a cada 4h
- **Notas para implementar no n8n:**
  - Mesmo padrão do Indeed — nó RSS Feed Read
  - Campos similares ao Indeed
  - Enviar para VagaSync com `source: 'catho'`
- **Atenção:** Catho pode bloquear requests sem User-Agent. Adicionar header:
  `User-Agent: Mozilla/5.0 (compatible; VagaSync-Bot/1.0)`

---

### 🔲 Gmail (próximo a implementar)
- **Método:** Conector nativo do n8n (Gmail Trigger)
- **Autenticação:** OAuth2 com conta Google
- **Como funciona:**
  1. Criar um filtro no Gmail: emails com "vaga" ou "oportunidade" no assunto
     vão para uma label `vagas-n8n`
  2. No n8n, usar o nó **Gmail Trigger** monitorando essa label
  3. Nó Code para extrair o corpo do email (remover assinatura, HTML, etc.)
  4. Enviar para VagaSync com `source: 'gmail'`
- **Notas:** requer configurar credenciais OAuth2 no n8n com a conta Google.
  Tutorial: https://docs.n8n.io/integrations/builtin/credentials/google/

---

## 6. Evitar vagas duplicadas

A regra fica em `lib/jobDedup.ts` e vale igual no webhook e na checagem em
lote (`/api/webhook/n8n/check`). Sempre só entre as vagas do mesmo usuário
(`N8N_TARGET_USER_ID`), em qualquer status (inclusive `DESCARTADA`):

1. **Mesma URL**, em qualquer data. A comparação é exata (só remove espaços
   nas pontas). Se uma fonte coloca parâmetros de rastreio variáveis no link
   (`utm_*` etc.), limpe a URL no nó Code antes de enviar.
2. **Mesmo título e mesma empresa vindos de outra origem**, criados nos
   últimos 30 dias (`DEDUP_WINDOW_DAYS`). É a mesma vaga anunciada em fontes
   diferentes (ex: Remotar e Himalayas, Remotar e Gupy). Título e empresa são
   comparados sem acento, maiúsculas, pontuação e espaços extras. "Origem" é
   o domínio da URL:
   - mesmo título + empresa no **mesmo site** com URL diferente são vagas
     **distintas** (ex: duas turmas de estágio) e entram;
   - empresa vazia ou genérica (`Confidencial`, `Não informado`...) **nunca**
     casa: sem empresa não dá para dizer que é a mesma vaga;
   - limitação conhecida: duas vagas realmente diferentes, com título e
     empresa idênticos, em sites diferentes no mesmo mês, contam como uma.

Duplicata volta `200` com `{ "duplicate": true, "id": "...", "reason": "url" |
"titulo_empresa" }` **sem chamar o Gemini** e sem criar nada.

O webhook compara o `title`/`company` **enviados pelo n8n** (como a fonte
publicou) com o título e a empresa **salvos** (os que a IA extraiu na época;
na prática são iguais). Os dois campos são opcionais: sem eles, só a URL
decide antes da IA. Depois da análise ele confere de novo com o título e a
empresa que a IA extraiu, o que pega fontes sem empresa (GitHub): nesse caso a
IA já foi gasta, mas a vaga repetida não é criada.

Fontes aceitas em `source`: `indeed`, `weworkremotely`, `github`,
`himalayas`, `remotar`, `gupy`, `infojobs`, `catho`, `gmail`, `manual` (outro
valor vira `manual`). Na Gupy o link é gravado sem o `?jobBoardSource=...`,
que muda conforme a página de origem.

---

## 7. Rodar sem o PC ligado (GitHub Actions)

`.github/workflows/n8n-vagas.yml` roda o mesmo `vagas-br.json` a cada 2 horas
(minuto 17) num n8n descartável: sobe `n8nio/n8n:2.41.4`, importa a credencial
e o workflow, executa uma vez (`n8n execute`) e descarta o container. Não há
estado a guardar: a deduplicação é no VagaSync (seção 6). Grátis porque o
repositório é público.

- **Secret necessário** (Settings → Secrets and variables → Actions →
  *New repository secret*): `N8N_WEBHOOK_SECRET`, o mesmo valor da Vercel.
- **Log**: só o resumo de `scripts/n8n-execution-summary.mjs` (itens por nó,
  resultado da checagem em lote, vagas novas, duplicadas e erros). A saída bruta não vai para o log. O job
  falha se o webhook responder 401 (secret errado).
- **Rodar na hora**: aba *Actions* → "n8n — vagas" → *Run workflow*.
- **Local**: o agendamento do n8n do PC fica desligado para não rodar duas
  vezes (o `import:workflow` já desativa). O n8n local continua servindo para
  editar e testar; depois de mudar o workflow, exporte para
  `n8n-workflows/vagas-br.json` e faça push — o Actions usa o arquivo do repo.
- O GitHub pausa agendamentos de repositórios públicos sem commits há 60
  dias; se parar, reative na aba *Actions*.

---

## 8. Testar sem esperar o schedule

Para testar o webhook manualmente sem esperar 2 horas:

```bash
curl -X POST https://seu-projeto.vercel.app/api/webhook/n8n \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: seu_segredo_aqui" \
  -d '{
    "description": "Desenvolvedor React Pleno - Empresa XYZ. Buscamos desenvolvedor com 3+ anos de experiência em React, TypeScript e testes unitários. Remoto. CLT.",
    "url": "https://br.indeed.com/vaga-teste",
    "source": "indeed",
    "title": "Desenvolvedor React Pleno",
    "company": "Empresa XYZ"
  }'
```

Resposta esperada: JSON com a vaga criada (`id`, `title`, `company`, etc.)

A checagem em lote, que não cria nada:

```bash
curl -X POST https://seu-projeto.vercel.app/api/webhook/n8n/check \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: seu_segredo_aqui" \
  -d '{ "vagas": [{ "url": "https://br.indeed.com/vaga-teste", "title": "Desenvolvedor React Pleno", "company": "Empresa XYZ" }] }'
# → { "novas": [0], "duplicadas": 0 }
```

**Testes automáticos** (`npm test`, também no CI): `tests/jobDedup.test.mjs`
cobre as regras da seção 6 e `tests/n8nWorkflow.test.mjs` roda o código dos
nós "Montar vagas" e "Separar novas" direto do `vagas-br.json`, com respostas
falsas das fontes (filtro de área, campos enviados e teto de 40).

**Ensaio completo sem tocar na produção**: suba o app numa porta livre
apontando para um SQLite descartável (`DATABASE_URL=file:...`,
`N8N_WEBHOOK_SECRET` e `N8N_TARGET_USER_ID` de teste, `GEMINI_API_KEY` vazia
para não gastar IA), troque `https://vagasync.vercel.app` por
`http://host.docker.internal:<porta>` numa **cópia** do `vagas-br.json` e rode
a cópia no mesmo container do Actions
(`--add-host=host.docker.internal:host-gateway`). Vagas novas voltam erro de
chave do Gemini, o que mostra que passaram da deduplicação sem gastar IA.

---

## 9. Onde as vagas aparecem no VagaSync

Toda vaga criada pelo webhook entra com status `MONITORADA` e **não** aparece no
dashboard principal. Ela fica na aba **Monitoradas** (botão com sino no header
do dashboard, com contador), agrupada por dia de chegada:

- **Tenho interesse** → status vira `APLICADA`, a data da candidatura passa a
  ser hoje e a vaga vai para o dashboard principal
- **Descartar** → a vaga some na hora e vira `DESCARTADA` (não é apagada, então o
  webhook continua reconhecendo a URL e não a recria). Um aviso com "Desfazer"
  fica 8 s na tela
- Os dois botões também existem dentro da página da vaga e em lote (botão
  **Selecionar**); a aba tem busca por empresa, cargo ou tecnologia

Hoje todas as vagas do n8n vão para a conta definida em `N8N_TARGET_USER_ID`.
Outros usuários não recebem vagas automáticas até existir configuração de
monitoramento por conta (ver `ROADMAP.md`, "Finalizar a automação n8n").
