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
Manual ────┴→ Fontes → Buscar vagas → Montar vagas → Enviar para VagaSync
```

- **Fontes**: lista de URLs — busca do Remotar (`estágio`, `júnior`,
  `trainee`), issues abertas de `frontendbr/vagas`, `backend-br/vagas` e
  `react-brasil/vagas` (GitHub, sem token: 60 req/h) e a busca do Himalayas.
- **Montar vagas**: normaliza os três formatos, pega as publicadas nos
  últimos 7 dias, aplica o filtro de perfil e manda no máximo 40 por rodada,
  intercalando as fontes. O perfil fica nas constantes do topo do código:
  `NIVEL_OK`/`NIVEL_FORA` (estágio–júnior), `AREA_TI`, `EXIGE_INGLES`,
  `EXIGE_ANOS` (2+ anos), `CATEGORIAS_REMOTAR` e o teste de português.
- **Enviar para VagaSync**: 1 vaga a cada 8s (abaixo do limite por minuto
  do Gemini), autenticado pela credencial *Header Auth* (`x-webhook-secret`).
  Erro numa vaga não para as outras; ela é tentada de novo na próxima rodada
  (o webhook deduplica pela URL).

Importar/atualizar pela CLI (o arquivo tem `id` fixo, então reimportar
substitui o mesmo workflow):

```bash
docker cp n8n-workflows/vagas-br.json n8n:/tmp/vagas-br.json
docker exec n8n n8n import:workflow --input=/tmp/vagas-br.json
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

### ⛔ Trampos.co
API pública existe, mas só tem marketing, design e comercial.

### ⚠️ Gupy
Os endpoints públicos (`portal.api.gupy.io`, `employability-portal.gupy.io`)
respondem 404 desde out/2026 — sem API aberta, só scraping.

### ⛔ Indeed (template antigo — `indeed-rss.json`)
- **Método:** RSS feed público
- **URL:** `https://br.indeed.com/rss?q=KEYWORDS&l=LOCATION&sort=date`
- **Autenticação:** nenhuma
- **Frequência recomendada:** a cada 2h
- **Notas:** o snippet do RSS é curto (~200 chars). Funciona bem para análise
  básica. Se quiser o texto completo da vaga, adicionar um nó HTTP Request
  para fazer scraping da página da vaga (URL vem no item RSS).

---

### 🔲 Gupy (próximo a implementar)
- **Método:** API HTTP pública (não documentada mas estável)
- **URL base:** `https://portal.api.gupy.io/api/job`
- **Parâmetros:** `jobName=desenvolvedor&limit=10&offset=0`
- **Exemplo:**
  ```
  GET https://portal.api.gupy.io/api/job?jobName=desenvolvedor+react&limit=10
  ```
- **Resposta:** JSON com array de vagas, cada uma tem `name`, `description`,
  `careerPageUrl`, `publishedDate`
- **Autenticação:** nenhuma
- **Frequência recomendada:** a cada 2h
- **Notas para implementar no n8n:**
  - Nó HTTP Request → GET na URL acima
  - Nó Split In Batches para processar cada vaga
  - Filtrar por `publishedDate` (últimas 2h)
  - `description` vem em HTML — usar nó Code para limpar com `.replace(/<[^>]+>/g, ' ')`
  - Enviar para VagaSync com `source: 'gupy'`

---

### 🔲 InfoJobs (próximo a implementar)
- **Método:** RSS feed público
- **URL:** `https://www.infojobs.com.br/vagas-de-emprego/rss.aspx?palabra=desenvolvedor`
- **Autenticação:** nenhuma
- **Frequência recomendada:** a cada 4h (atualiza menos que Indeed)
- **Notas para implementar no n8n:**
  - Mesmo padrão do Indeed — nó RSS Feed Read
  - Campos: `title`, `link`, `contentSnippet`, `pubDate`
  - Enviar para VagaSync com `source: 'infojobs'`

---

### 🔲 Catho (próximo a implementar)
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

O webhook deduplica por URL: se já existe uma vaga do usuário com a mesma
`url`, ele responde `200` com `{ "duplicate": true, "id": "..." }` **sem chamar
o Gemini** e sem criar nada. Vaga enviada sem `url` não é deduplicada.

A comparação é exata (só remove espaços nas pontas). Se uma fonte coloca
parâmetros de rastreio variáveis no link (`utm_*` etc.), limpe a URL no nó
Code antes de enviar.

Fontes aceitas em `source`: `indeed`, `weworkremotely`, `gupy`, `infojobs`,
`catho`, `gmail`, `manual` (outro valor vira `manual`).

---

## 7. Testar sem esperar o schedule

Para testar o webhook manualmente sem esperar 2 horas:

```bash
curl -X POST https://seu-projeto.vercel.app/api/webhook/n8n \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: seu_segredo_aqui" \
  -d '{
    "description": "Desenvolvedor React Pleno - Empresa XYZ. Buscamos desenvolvedor com 3+ anos de experiência em React, TypeScript e testes unitários. Remoto. CLT.",
    "url": "https://br.indeed.com/vaga-teste",
    "source": "indeed"
  }'
```

Resposta esperada: JSON com a vaga criada (`id`, `title`, `company`, etc.)

---

## 8. Onde as vagas aparecem no VagaSync

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
