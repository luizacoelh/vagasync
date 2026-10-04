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

## 4. Importar o workflow do Indeed

1. No n8n, clique em **Add workflow → Import from file**
2. Selecione o arquivo `n8n-workflows/indeed-rss.json`
3. Ative o workflow com o toggle no canto superior direito
4. Clique em **Execute workflow** para testar imediatamente

---

## 5. Fontes disponíveis

### ✅ Indeed (implementado — `indeed-rss.json`)
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

O webhook atual não verifica duplicatas — se a mesma vaga aparecer no RSS
duas vezes (o Indeed mantém vagas por dias), ela pode ser cadastrada de novo.

**Solução simples a implementar no n8n:**
Adicionar um nó **n8n-nodes-base.filter** antes do envio que verifica se a URL
já foi processada. O n8n tem um nó nativo de deduplicação:
`n8n-nodes-base.removeDuplicates` — usar com o campo `url` como chave.

**Solução robusta (futura sprint no VagaSync):**
Adicionar campo `sourceUrl` no modelo `Job` do Prisma e fazer o webhook
verificar `prisma.job.findFirst({ where: { url: jobUrl } })` antes de criar.

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
