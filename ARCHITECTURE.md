# Arquitetura — VagaSync

Detalhe de estrutura de pastas e decisões técnicas. Visão geral do produto
fica no [`README.md`](./README.md); passo a passo de deploy no
[`DEPLOY.md`](./DEPLOY.md).

## Estrutura do projeto

```
vagasync/
  auth.ts                       # Config central do Auth.js (providers, adapter, callbacks)
  proxy.ts                      # Protege rotas (substitui middleware.ts no Next.js 16)
  app/
    page.tsx                    # Dashboard (exige sessão + perfil, filtra por usuário)
    login/page.tsx               # Tela de login (Google/GitHub)
    perfil/page.tsx              # Perfil do usuário (onboarding + edição)
    admin/page.tsx                # Limites globais + gestão de usuários (admin only)
    monitoradas/page.tsx         # Vagas coletadas pelo n8n (status MONITORADA): Tenho interesse / Descartar
    privacidade/page.tsx         # Política de Privacidade
    termos/page.tsx              # Termos de Uso
    nova-vaga/page.tsx          # Cadastro de vaga (Analisar → Confirmar → Salvar)
    vaga/[id]/page.tsx          # Detalhes da vaga (só do dono)
    api/
      auth/[...nextauth]/route.ts  # Handler do Auth.js (login/logout/callback OAuth)
      analyze/route.ts          # Chama o Gemini — sessão + limite de tamanho + rate limit (usuário e IP)
      profile/route.ts          # GET / PUT (upsert) do perfil do usuário logado
      jobs/route.ts             # GET (lista do usuário) / POST (cria para o usuário)
      jobs/[id]/route.ts        # GET / PATCH / DELETE — só se for dono da vaga
      jobs/export/route.ts      # Exporta as vagas do usuário logado em CSV
      webhook/n8n/route.ts      # Endpoint para automações futuras (desativado por padrão)
      admin/settings/route.ts   # GET/PUT dos limites globais (admin only)
      admin/users/route.ts      # Lista usuários (admin only)
      admin/users/[id]/route.ts # Edita override de limite / isAdmin de um usuário (admin only)
    error.tsx                   # Erros dentro de rotas
    global-error.tsx            # Erros no próprio layout raiz
    not-found.tsx / loading.tsx
  components/
    ui/                         # Componentes genéricos de apresentação
    job/                        # Componentes do domínio "vaga"
    dashboard/                  # Componentes específicos do Dashboard
    auth/                       # UserMenu (avatar + link de perfil + admin + logout)
    profile/                    # ProfileForm
    admin/                      # AppSettingsForm, UsersTable
    monitoradas/                # MonitoredJobList (feed de vagas do n8n com ações)
    README.md                   # Critério de organização usado acima
  lib/
    prisma.ts                   # Singleton do PrismaClient — escolhe adapter (local/Turso) automaticamente
    gemini.ts                   # Integração com a API do Gemini (inicialização preguiçosa)
    apiAuth.ts                  # requireUser() — checagem de sessão nas rotas de API
    adminAuth.ts                # requireAdmin() — checagem de sessão + isAdmin nas rotas de admin
    appSettings.ts              # Limites globais editáveis (tabela AppSettings, singleton)
    rateLimit.ts                # Limite diário de IA por usuário — atômico, sem condição de corrida
    ipRateLimit.ts              # Limite adicional de chamadas ao Gemini por IP
    aiUsage.ts                  # Registro de cada chamada à IA (tabela AiUsage)
    jobMapper.ts                # Converte o registro do Prisma para o tipo Job da app
    jobStatus.ts / jobLocation.ts / experienceLevel.ts  # Labels e estilos dos enums
    json.ts                     # parseArray/stringifyArray (campos JSON-em-string)
    skillGap.ts                 # Compara tecnologias da vaga com as skills do UserProfile
  prisma/
    schema.prisma                # User/Account/Session/VerificationToken (Auth.js) + UserProfile + AiUsage + AppSettings + Job
    prisma.config.ts            # Config do CLI — sempre aponta para o SQLite local
  scripts/
    apply-turso-migrations.mjs  # Aplica só as migrations pendentes no Turso (registra em _turso_migrations; sem CLI)
    fix-turso-job-table.mjs     # Referência: como corrigir uma tabela específica sem apagar as demais
    sync-turso-schema.mjs       # Referência: cria tabelas novas faltantes sem reaplicar o histórico inteiro
    set-admin.mjs                # Bootstrap: marca um e-mail como admin (local ou Turso)
  types/
    job.ts / profile.ts
    next-auth.d.ts              # Adiciona `id` e `isAdmin` ao tipo Session.user
```

## Decisões documentadas de propósito

- **Sessão em banco (`strategy: "database"`), não JWT.** Permite invalidar
  uma sessão específica apagando a linha, se precisar, e mantém a tabela
  `Session` como fonte de verdade.
- **`proxy.ts`, não `middleware.ts`.** Nome novo obrigatório no Next.js 16,
  roda em runtime Node.js — evita o workaround de "config dividida" que a
  maioria dos tutoriais de Auth.js pede para viabilizar Edge runtime.
- **Proteção em duas camadas.** `proxy.ts` só cuida de navegação; toda rota
  de API e todo Server Component que consulta o banco confere `auth()` de
  novo. Depender só do proxy é desaconselhado pela comunidade Next.js (CVE de
  2025 envolvendo bypass de middleware via header forjado).
- **404, não 403, para recurso de outro usuário.** Não confirmamos para quem
  não tem acesso que aquele id existe.
- **Rate limit (usuário e IP) contado no banco, não em memória.** Funções
  serverless não compartilham memória entre instâncias — um contador em
  memória seria inútil em produção na Vercel.
- **Rate limit por IP reaproveita a tabela `AiUsage`.** Em vez de criar uma
  tabela nova só para contagem, o mesmo registro de uso (que já existe para
  fins de histórico) é consultado por IP dentro de uma janela de tempo —
  mantém a solução simples.
- **`UserProfile` separado de `User`.** `User` é gerenciado pelo
  `PrismaAdapter` do Auth.js (nomes e campos não podem mudar); `UserProfile`
  é dado de produto, editável livremente, sem misturar as duas
  responsabilidades.
- **Onboarding é um redirect, não um bloqueio rígido.** Usuário sem perfil
  (novo ou conta antiga de antes desta sprint) é levado a `/perfil` ao
  acessar o Dashboard, mas nada é apagado ou impedido de outra forma —
  compatível com contas já existentes sem quebrar nada.
- **Comparação de skills usa `UserProfile.skills`, não mais uma lista
  estática no código.** Antes de existir perfil de usuário, a comparação
  usava um array fixo em `lib/skills.ts`; esse arquivo foi removido nesta
  sprint em favor do dado real por usuário.
- **Webhook n8n precisa de `N8N_TARGET_USER_ID`.** Como toda vaga pertence a
  um usuário e o webhook é uma chamada servidor-a-servidor (sem sessão de
  navegador), ele precisa saber a quem atribuir a vaga criada.
- **Campos array (`technologies`, `requirements`, `questions`, `checklist`,
  `UserProfile.skills`) são salvos como JSON-string no SQLite**, não em
  tabelas relacionadas. Decisão temporária do MVP — ver `lib/json.ts`. V2:
  normalizar em tabelas próprias.
- **Checklist é somente leitura.** Persistir o estado "concluído" por item
  exigiria mudar o schema — fora do escopo atual.
- **Limites globais (`AppSettings`) em vez de constantes no código.** Antes,
  `DAILY_LIMIT`, `IP_LIMIT` e `MAX_DESCRIPTION_LENGTH` eram números fixos —
  mudar qualquer um exigia editar código e fazer deploy. Agora ficam numa
  tabela singleton (`AppSettings`, id fixo `"singleton"`), editável em
  `/admin` sem deploy. `lib/appSettings.ts` cria a linha com valores padrão
  automaticamente se ela ainda não existir.
- **Override de limite por usuário (`User.dailyAiLimitOverride`)** em vez de
  um caso especial no código para uma conta específica (ex: a sua). Nulo =
  usa o padrão global; qualquer conta pode receber um valor diferente via
  `/admin`, inclusive maior que o padrão.
- **Rate limit por usuário corrigido para ser atômico** (`lib/rateLimit.ts`).
  A versão original fazia `findUnique` + `update` como duas operações
  separadas — sob concorrência (duplo clique, retry automático), duas
  requisições podiam ler o mesmo contador antes de qualquer uma escrever,
  permitindo passar do limite por 1-2 chamadas. A versão atual usa
  `updateMany` com a condição de limite dentro do próprio `WHERE` da query
  SQL, tornando a checagem e o incremento uma única operação atômica no
  banco. Documentado no próprio arquivo o único caso extremo remanescente
  (janela de 24h expirando exatamente no mesmo instante de duas requisições
  concorrentes) e por que não vale a complexidade de eliminá-lo.
- **Painel `/admin` enxuto, não um CRUD completo.** Uma tela só, com os
  limites globais e uma tabela de usuários com override e toggle de admin —
  sem gráficos, sem filtros, sem paginação. Proporcional ao estágio atual do
  produto (poucos usuários); pode crescer depois se necessário.
- **Primeiro admin via script (`scripts/set-admin.mjs`), não via UI.** Não
  existe cadastro de admin pela interface de propósito — evita a
  possibilidade de qualquer usuário se autopromover. O primeiro admin é
  definido rodando o script uma vez; depois disso, promoções seguintes
  acontecem pelo próprio painel.
- **`requireAdmin()` responde 404 pra quem não é admin, não 403** — mesma
  lógica de "não confirmar a existência do recurso" já usada no resto do
  app (ver isolamento por usuário acima).
- **Dono da instância (`User.isOwner`) é imutável pela interface.** Um admin
  comum pode promover/rebaixar outros admins, mas nunca o dono:
  `PATCH /api/admin/users/[id]` rejeita qualquer mudança de `isAdmin` num
  usuário com `isOwner = true`, e a tabela mostra o selo "Dono" no lugar do
  checkbox. O campo só é definido por script
  (`node scripts/set-admin.mjs email --owner`) ou direto no banco — a rota
  nunca lê `isOwner` do body. O próprio usuário também não altera o próprio
  `isAdmin` (evita se trancar fora).
- **`/admin` re-valida `isAdmin` no banco, não só no cookie.** Com sessão JWT
  (30 dias), o `isAdmin` do cookie pode estar velho depois de uma revogação.
  `requireAdmin()` já cobria a API; a página passou a consultar o banco
  também, senão um admin revogado ainda veria a lista de usuários.
- **Vagas `MONITORADA` ficam fora do dashboard principal.** Vagas coletadas
  pelo n8n entram com esse status e só aparecem em `/monitoradas`.
  "Tenho interesse" muda para `APLICADA` (com `appliedAt` = hoje) e a vaga
  passa ao dashboard; "Descartar" exclui. O funil do dashboard usa
  `DASHBOARD_STATUSES` (sem `MONITORADA`), então métricas como a taxa de
  conversão só consideram vagas realmente candidatadas.
- **Toda mutação de vaga passa por Server Action (`app/actions/jobs.ts`), não
  por `fetch` na API.** O dashboard usa `experimental.staleTimes.dynamic: 300`
  para que voltar a `/` seja instantâneo em vez de mostrar o skeleton a cada
  navegação (o padrão é 0s quando existe `loading.tsx`). O preço disso é que
  qualquer escrita precisa invalidar o Client Router Cache — e só Server
  Actions fazem isso: `revalidatePath()` chamado de um Route Handler marca
  apenas o Data Cache do servidor, então a página continuaria servindo a
  versão cacheada por até 5 minutos. Criar, editar, mudar status, excluir e
  "Tenho interesse" são todos Server Actions por esse motivo. Os Route
  Handlers em `app/api/jobs/` continuam existindo para consumo externo, mas
  nenhuma tela do app os usa para escrever.

## Identidade visual — sistema "vidro" (Sprint 9)

Trocada a identidade anterior (terminal, `font-mono` tipo `$ comando`) por
uma estética de vidro/água com refração de luz real, mantendo a mesma
paleta de cor (`#378ADD` e derivados) — não foi uma troca de marca, só de
tratamento visual.

- **`components/ui/Glass.tsx` (`GlassPanel`)** é a peça central: qualquer
  card/painel do app deveria envolver o conteúdo nele em vez de recriar
  `bg-[#1A1B23] border rounded-lg` na mão. Três camadas sempre juntas —
  moldura com gradiente de luz na borda (`.glass-rim`), o vidro em si com
  blur+distorção (`.glass-surface`), e uma "placa" quase opaca por dentro
  onde o texto mora (`.glass-plate`). O texto nunca fica direto sobre o
  vidro transparente — essa é a regra de contraste/acessibilidade do
  projeto, não negociável mesmo com o visual ficando mais "líquido".
- **Refração real via filtro SVG**, não só blur decorativo. Um único
  `<filter id="glass-distort">` (feTurbulence + feDisplacementMap) definido
  uma vez em `app/layout.tsx`, referenciado por `url(#glass-distort)` no
  `backdrop-filter` de todo elemento de vidro do app.
- **Decisão de performance, pedida explicitamente e documentada por ser um
  trade-off real**: o filtro de distorção é aplicado em TODO elemento de
  vidro, incluindo elementos pequenos e repetidos (badges de status,
  chips de tecnologia). Isso é mais caro de renderizar que blur simples,
  e o custo soma em telas com muitos elementos de vidro simultâneos — a
  aceitação consciente desse custo, em troca do efeito "iOS Liquid Glass",
  foi decisão do usuário do projeto, não uma escolha técnica silenciosa.
  Se algum dispositivo real pesar demais, o ajuste é remover
  `url(#glass-distort)` de `.glass-chip`/`.glass-input` (elementos
  pequenos/repetidos), mantendo a distorção só nos painéis grandes.
- **Compatibilidade Safari/iOS**: `feDisplacementMap` combinado com
  `backdrop-filter` tem suporte inconsistente no Safari — pode cair para
  só o blur, sem a distorção. Degrada bem (ainda parece vidro, só sem o
  efeito de "ondulação"), não quebra.
- **Tipografia trocada de Geist (Sans/Mono) para Outfit + Inter** — Geist
  Mono carregava a identidade de terminal que foi abandonada; Outfit
  (headings, wordmark, botões, labels) tem curvas mais suaves, coerentes
  com o visual fluido. `--font-mono` no `@theme` continua existindo só por
  compatibilidade com classes `font-mono` ainda não migradas nos arquivos
  que esta sprint não tocou — aponta pra Outfit agora, não mais um
  monoespaçado real, então nada quebra visualmente nesses arquivos.
- **Wordmark substitui o rótulo de terminal.** O antigo `$ vagasync
  --login` (e variações como `$ vagasync --dashboard`) foi trocado por um
  quadradinho com gradiente + "VagaSync" — mesmo padrão em toda tela
  convertida.
- **`globals.css` deixou de ter modo claro.** O app nunca teve alternância
  de tema de verdade; o bloco `@media (prefers-color-scheme: dark)` do
  boilerplate original do `create-next-app` nunca foi removido antes desta
  sprint, apesar de nunca ter sido usado (o tema escuro sempre vinha de
  classes Tailwind hardcoded, não das variáveis do `:root`).

### O que foi convertido (Sprint 9 + Sprint 10 — completo)

**Sprint 9:** `app/layout.tsx`, `app/globals.css`, `app/login/page.tsx`,
`app/page.tsx` (Dashboard), `app/nova-vaga/page.tsx`,
`app/vaga/[id]/page.tsx`, e todos os componentes que essas páginas usam
(`StatsBar`, `FilterBar`, `JobCard`, `JobTable`, `UserMenu`, `StatusBadge`,
`TechBadge`, `EmptyState`, `DetailSection`, `StatusSelect`,
`JobMetaEditor`, `SkillCompatibility`, `components/ui/Glass.tsx`).

**Sprint 10:** `app/perfil/page.tsx`, `app/admin/page.tsx`,
`app/privacidade/page.tsx`, `app/termos/page.tsx`, `app/not-found.tsx`,
`app/error.tsx`, `app/global-error.tsx`, `components/profile/ProfileForm.tsx`,
`components/admin/AppSettingsForm.tsx`, `components/admin/UsersTable.tsx`,
`components/job/DeleteJobButton.tsx`, `components/job/ChecklistItem.tsx`.

**Nenhum arquivo usa mais `bg-[#1A1B23]`, `border-[#2A2D3A]` ou rótulos
`font-mono $ comando`.** A identidade visual "vidro" está 100% aplicada.

**Sprint 14 — correção de bug:** o `NewJobFab` quebrava o render de páginas
de vaga porque tentava ler o header `x-pathname` que ainda não havia sido
injetado pelo `proxy.ts`. Corrigido adicionando a injeção no `proxy.ts` e
um `try/catch` no componente para degradar graciosamente caso o header não
exista (ex: builds estáticos ou testes).

**Sprint 12 — performance:** `.glass-chip`, `.glass-input` e `.glass-btn`
trocados de `blur + saturate + url(#glass-distort)` para apenas
`blur + saturate`. O filtro SVG de distorção foi mantido exclusivamente
em `.glass-surface` (painéis grandes). Impacto: telas com muitos badges ou
inputs (detalhes de vaga, formulários) deixam de recalcular pixels fora do
elemento a cada frame nessas instâncias pequenas. `will-change: transform`
adicionado em `.glass-rim` para promoção de camada GPU durante scroll.

**Sprint 11 — polish adicional pós-conversão:** `app/loading.tsx` refatorado
com skeletons que espelham o layout real do Dashboard; `UserMenu` simplificado
(foto+nome = link do perfil, link "Perfil" removido); `app/perfil/page.tsx`
com título único; `app/nova-vaga/page.tsx` sem label de etapa e sem
`font-mono` residual nos labels de formulário.

**Nota sobre `global-error.tsx`:** esse arquivo substitui o `layout.tsx`
inteiro quando há um erro crítico no layout raiz — por isso não pode importar
nem depender de `globals.css`. O filtro SVG `#glass-distort`, os glows e os
estilos do botão são declarados inline nele.

## Seguranca - auditoria Sprint 15

### Superficie analisada
Todas as rotas de API (app/api/**), helpers de auth (lib/apiAuth.ts,
lib/adminAuth.ts), rate limiting (lib/rateLimit.ts, lib/ipRateLimit.ts),
integracao com IA (lib/gemini.ts), proxy (proxy.ts), e configuracao
(next.config.ts, auth.ts).

### Resultado por categoria

| Categoria | Status | Detalhe |
|---|---|---|
| IDOR | OK | findOwnedJob cruza userId da sessao em 100% das queries |
| SQL Injection | OK | Prisma ORM, zero $queryRaw no codigo |
| XSS | OK | React escaping automatico; sem dangerouslySetInnerHTML |
| Mass Assignment | OK | Whitelist explicita em todas as rotas |
| Open Redirect | OK | callbackUrl.startsWith("/") bloqueia dominios externos |
| Race Condition / TOCTTOU | OK | Rate limit atomico via updateMany com condicao no WHERE |
| Timing Attack (webhook) | CORRIGIDO Sprint 15 | Trocado !== por crypto.timingSafeEqual |
| Security Headers | CORRIGIDO Sprint 15 | CSP, X-Frame-Options, etc. em next.config.ts |
| Prompt Injection | MITIGADO Sprint 15 | Delimitadores no prompt + validacao de schema no output |
| DDoS / Abuso de IA | OK | Rate limit duplo: por usuario (diario) + por IP (horario) |

### IMPORTANTE - JWT e isAdmin (fazer antes de migrar para JWT)
Quando strategy mudar para "jwt", isAdmin fica no cookie por 30 dias.
Revogar admin no /admin nao tera efeito imediato ate o token expirar.

Adicionar em lib/adminAuth.ts antes de qualquer operacao admin:

```ts
const freshUser = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { isAdmin: true },
});
if (!freshUser?.isAdmin) {
  return { user: null, response: NextResponse.json({ error: "Nao encontrado." }, { status: 404 }) };
}
```

### Nota sobre getClientIp
x-forwarded-for e confiavel apenas na Vercel. Se mudar de host, revisar
lib/ipRateLimit.ts antes de confiar no rate limit por IP.
