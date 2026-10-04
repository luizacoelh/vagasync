# Como aplicar a migration do status MONITORADA

## Por que não precisa de SQL manual

O Turso usa libSQL (SQLite por baixo). Diferente do Postgres, SQLite não tem
`ALTER TYPE` para enums — o Prisma valida os valores do enum no nível do client
TypeScript, não no banco. O banco salva o status como texto simples.

Isso significa que adicionar `MONITORADA` ao schema só requer atualizar o
Prisma client, sem migration de banco.

## Passos

**1. Atualizar o Prisma client (obrigatório)**

```bash
npx prisma generate
```

Isso gera o TypeScript atualizado com `MONITORADA` disponível como valor válido.

**2. Sincronizar o schema com o banco (só se necessário)**

```bash
npx prisma db push
```

No Turso/libSQL isso é seguro — não apaga dados existentes.

**3. Verificar no Turso**

Vagas existentes no banco com status `APLICADA`, `ENTREVISTA` etc. continuam
funcionando normalmente. O novo status `MONITORADA` só aparecerá em vagas
criadas pelo webhook do n8n a partir de agora.

## Não precisa fazer rollback de dados

Vagas antigas não são afetadas. O `MONITORADA` é adicionado, não substitui nada.
