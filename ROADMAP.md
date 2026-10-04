# VagaSync — Roadmap

## Objetivo
Um CRM pessoal para centralizar e gerenciar candidaturas de estágio/emprego
de forma inteligente, sem a complexidade de um Kanban ou a bagunça de um Notion.

## Fluxo do usuário
```
[Login] → [Perfil (onboarding)] → [Dashboard] → [Nova Vaga] → [Análise da IA] → [Confirmação] → [Detalhes da Vaga] → [Atualizar Status/Metadados]
```

---

## Concluído

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

### 2. Onboarding visual (2–3 passos na primeira entrada)
Hoje o onboarding é só texto em `/perfil`. Tornar mais visual:
- Três cards sequenciais: "Cole a vaga → IA analisa → Acompanhe o status"
- Pode ser um modal simples na primeira visita ao dashboard (flag
  `hasSeenOnboarding` no `UserProfile`)
- Não bloqueia o uso — pode ser pulado

### 3. Checklist com itens marcáveis persistidos
Hoje o checklist é só leitura. Adicionar campo `checklistDone` (`String`,
array JSON de índices marcados) no modelo `Job`. O `ChecklistItem` vira
um Client Component com checkbox que chama `PATCH /api/jobs/[id]`.

### 4. Refinar comparação de skills
Hoje é match exato normalizado — não entende "JS" = "JavaScript" ou
"React.js" = "React". Solução: tabela de aliases em `lib/skillAliases.ts`
(`{ "js": "javascript", "react.js": "react", ... }`), aplicada antes do
match em `SkillCompatibility`.

### 5. Ativar e testar webhook n8n ponta a ponta
Requer: workflow n8n configurado externamente + `N8N_WEBHOOK_SECRET` e
`N8N_TARGET_USER_ID` no `.env` de produção. A rota já está pronta e auditada.

### 6. Screenshots reais no README
Fazer antes de tornar o repositório público e postar no LinkedIn.
Sugestão: dashboard com vagas reais, tela de análise preenchida, mobile.

### 7. Monitoramento básico em produção
Log estruturado quando `/api/analyze` falhar repetidamente.
Opção simples: Vercel Analytics (já incluso no plano) + alerta por email
via Resend quando `error.tsx` for renderizado N vezes em X minutos.

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
- Checklist de itens marcáveis com persistência (ver próximos passos #3)
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
