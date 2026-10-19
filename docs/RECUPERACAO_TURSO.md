# Recuperar o banco do Turso

Use quando uma migration errada apagou coluna, tabela ou dados em produção.

## 1. Diagnóstico (só leitura)

No dashboard do Turso → seu banco → **SQL console**, rode uma consulta por vez:

```sql
PRAGMA table_info("Job");
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;
SELECT count(*) FROM "Job";
PRAGMA table_info("User");
```

Como ler:

| Resultado | Significa |
|---|---|
| `Job` tem a coluna `userId` e não existe a tabela `new_Job` | banco íntegro |
| `Job` **sem** `userId` e/ou existe a tabela `new_Job` | a migration reescreveu a tabela: restaurar (abaixo) |
| `User` com a coluna `isOwner` | a migration do dono foi aplicada |

## 2. Restaurar (PITR)

O Turso cria um **banco novo** a partir de um instante anterior. No plano
**Free** a janela é de **24 horas**; planos pagos têm 10 a 30 dias. Quanto
antes, melhor. Escolha um horário **pouco antes** de ter rodado o script.

Precisa da CLI do Turso (no Windows, via WSL):

```bash
turso db create vagasync-restaurado --from-db <nome-do-banco-atual> --timestamp 2026-10-17T11:30:00-03:00
turso db show vagasync-restaurado --url
turso db tokens create vagasync-restaurado
```

Também dá para fazer pela API da plataforma (sem CLI):
https://docs.turso.tech/features/point-in-time-recovery

Pontos de atenção: o banco restaurado **não** tem o que foi gravado depois do
horário escolhido (até ~15 s de folga antes dele), e não se restaura sobre um
banco que já existe.

## 3. Conferir antes de trocar

Repita as consultas do passo 1 **no banco restaurado**. `Job` precisa ter
`userId`, e a contagem de vagas precisa bater com a que você esperava.

## 4. Apontar o app para o banco restaurado

1. Vercel → Settings → Environment Variables: troque `TURSO_DATABASE_URL` e
   `TURSO_AUTH_TOKEN` (Production) pelos valores do banco novo e faça **Redeploy**.
2. Faça o mesmo no `.env` local.
3. Se faltar a migration mais recente, aplique **sem reexecutar o histórico**:
   `npm run migrate:turso -- --baseline <pasta-da-ultima-migration-que-o-banco-ja-tem>`
   (use `--dry-run` primeiro).
4. Só apague o banco antigo depois de tudo funcionando.

## Se passou de 24 horas (plano Free)

Não há restauração automática. Dá para reconstruir `Job.userId` (a maioria das
vagas é da conta dona), mas `url`, `location`, `salary` e `appliedAt` de cada
vaga só voltam se existir outra cópia (por exemplo um CSV exportado em
`Perfil → Exportar CSV`).
