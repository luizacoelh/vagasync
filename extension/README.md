# Extensão VagaSync (uso pessoal)

Leva a vaga da aba aberta para `/nova-vaga`, já na aba "Colar texto". A extensão
não fala com o servidor nem guarda login: só lê a página quando você clica no
ícone e entrega o texto ao site, onde você confere e clica em Analisar.

## Instalar (Chrome ou Edge, modo desenvolvedor)
1. Abra `chrome://extensions` (no Edge, `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha esta pasta `extension/`.
4. Fixe o ícone na barra (ícone de quebra-cabeça → alfinete).

## Usar
1. Entre no VagaSync uma vez no mesmo navegador.
2. Abra a vaga (LinkedIn, Indeed, Gupy, site da empresa...).
3. Clique no ícone. Se a página tiver muita coisa além da vaga, selecione só o
   texto da vaga antes de clicar: a seleção tem prioridade.
4. O `/nova-vaga` abre com o texto e o link. Confira e clique em Analisar.

Se o ícone mostrar "!", passe o mouse para ver o motivo. A captura fica guardada
por 10 minutos; se você não estava logado, entre e abra `/nova-vaga` de novo.

## Como funciona
- `background.js`: no clique, roda `captureJob` na aba (permissão `activeTab`,
  só naquele momento) e abre `/nova-vaga`. Ordem de leitura: texto selecionado,
  JSON-LD `JobPosting`, blocos conhecidos (LinkedIn, Indeed, Gupy), `<main>`,
  `<article>`, `<body>`. Até 8.000 caracteres.
- `bridge.js`: content script só em `/nova-vaga` do VagaSync; troca mensagens
  com a página por `window.postMessage`. Contrato em `lib/extensionCapture.ts`.
- Servidor local: troque `SITE` em `background.js` por `http://localhost:3000`.
