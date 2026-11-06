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

Se o ícone mostrar "!", passe o mouse para ver o motivo. A vaga vai só para a
aba que a extensão abre e fica guardada por até 10 minutos. Se você não estava
logado, entre no VagaSync e clique no ícone de novo na página da vaga. Se já
houver texto em `/nova-vaga`, ele é mantido e aparece o botão "Usar a vaga da
extensão".

## Como funciona
- `background.js`: no clique, roda `captureJob` na aba (permissão `activeTab`,
  só naquele momento) e abre `/nova-vaga`. Ordem de leitura: texto selecionado,
  JSON-LD `JobPosting`, blocos conhecidos (LinkedIn, Indeed, Gupy), bloco abaixo
  de "Sobre a vaga"/"Descrição", bloco com mais texto corrido (sem links, menus,
  rodapés, propagandas laterais) e, por último, a página toda. Até 8.000
  caracteres. O aviso em `/nova-vaga` diz de onde veio o texto, quantos
  caracteres tem e se foi cortado.
- Depois de mudar `background.js`, clique em "Recarregar" (seta circular) no
  card da extensão em `chrome://extensions`.
- `bridge.js`: content script só em `/nova-vaga` do VagaSync; troca mensagens
  com a página por `window.postMessage`. Contrato em `lib/extensionCapture.ts`.
- Servidor local: troque `SITE` em `background.js` por `http://localhost:3000`
  e acrescente `http://localhost:3000/nova-vaga*` em `matches` no `manifest.json`.
