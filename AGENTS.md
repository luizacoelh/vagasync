<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Coordenação de agentes

- Em tarefas com frentes independentes, avaliar delegar partes a subagentes.
- Começar com no máximo duas frentes de implementação ao mesmo tempo.
- Definir para cada agente o escopo e os arquivos sob sua responsabilidade; um agente não altera arquivos de outra frente.
- Alterações em paralelo ficam em worktrees separados.
- Executar em sequência, sem delegar, quando houver dependência forte entre as partes ou a tarefa for pequena.
- O agente principal integra as entregas, revisa o resultado e executa as validações pertinentes (`npm run lint`, `npm test`, `npm run build` e as do próprio escopo).
- No relato final, informar quais tarefas foram delegadas e o resultado das validações.
