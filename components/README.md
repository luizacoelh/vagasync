# Organização dos componentes

- **`ui/`** — componentes de apresentação genéricos, sem lógica de negócio,
  reutilizáveis em qualquer contexto: `StatusBadge`, `TechBadge`,
  `DetailSection`, `EmptyState`.
- **`job/`** — componentes específicos do domínio "vaga": `JobCard`,
  `JobTable`, `JobMetaEditor`, `StatusSelect`, `DeleteJobButton`,
  `SkillCompatibility`, `ChecklistItem`.
- **`dashboard/`** — componentes específicos da tela de Dashboard:
  `DashboardClient`, `FilterBar`, `StatsBar`.
- **`auth/`** — componentes ligados à sessão do usuário: `UserMenu` (avatar,
  nome, link de perfil e botão de sair, usado no cabeçalho do Dashboard),
  `LoginButtons` (Google/GitHub) e `LoginGate` (modo visitante: janela de
  login, `useLoginGate()` e o botão `LoginButton`).
- **`onboarding/`** — `OnboardingSteps` (os três passos, no convite do
  visitante e no dashboard vazio) e `DemoBanner`.
- **`profile/`** — `ProfileForm`, usado tanto na tela de onboarding quanto
  na edição posterior do perfil em `/perfil`.

Critério usado: se o componente poderia ser reaproveitado em qualquer projeto
sem saber o que é um "Job", vai em `ui/`. Se ele conhece o conceito de vaga
mas não é exclusivo do Dashboard, vai em `job/`. Se é específico da tela do
Dashboard, vai em `dashboard/`.
