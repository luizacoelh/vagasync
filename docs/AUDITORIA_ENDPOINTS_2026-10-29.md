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
- Correções complementares neste commit: 51 testes, lint, TypeScript e build
  locais aprovados. CI e Vercel devem confirmar a publicação deste commit.

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
Não houve teste de carga/ataque em produção. Cotas por conta não são um teto
global do banco: múltiplas contas OAuth e retenção de histórico ainda exigem
monitoramento e controles de infraestrutura. Leituras e atualizações repetidas
também podem consumir recursos; WAF e orçamento global não foram verificados.
Isso não é uma garantia de inexistência de qualquer vulnerabilidade.
