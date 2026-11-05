// Clique no ícone: lê a vaga da aba ativa (activeTab, só quando a pessoa
// clica), guarda em chrome.storage.session e abre /nova-vaga. O bridge.js pede
// a captura por mensagem (o storage.session não é visível a content scripts) e a
// entrega à página. Contrato em lib/extensionCapture.ts.
//
// Para usar com o servidor local, troque SITE por "http://localhost:3000".
const SITE = "https://vagasync.vercel.app";
const MAX_TEXT = 8000;
const MAX_AGE = 10 * 60 * 1000;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url ?? "")) {
    return badge("!", "Abra a página da vaga antes de clicar.");
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureJob,
      args: [MAX_TEXT],
    });
    if (!result || !result.text) return badge("!", "Não achei o texto da vaga. Selecione o texto e clique de novo.");
    await chrome.storage.session.set({ captura: { ...result, at: Date.now() } });
    badge("", "Enviar esta vaga para o VagaSync");
    await chrome.tabs.create({ url: `${SITE}/nova-vaga` });
  } catch {
    badge("!", "Esta página não deixa a extensão ler. Copie e cole o texto no VagaSync.");
  }
});

// Pedidos do bridge.js: "pegar" devolve a captura (até 10 min), "apagar" limpa.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "pegar") {
    chrome.storage.session.get("captura").then(({ captura }) => {
      const fresh = captura && Date.now() - (captura.at ?? 0) <= MAX_AGE;
      if (captura && !fresh) chrome.storage.session.remove("captura");
      sendResponse(fresh ? { text: captura.text, url: captura.url } : null);
    });
    return true;
  }
  if (message?.type === "apagar") chrome.storage.session.remove("captura");
});

function badge(text, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#E5534B" });
  chrome.action.setTitle({ title });
}

// Roda dentro da página da vaga. Ordem: texto selecionado pela pessoa,
// JobPosting em JSON-LD, blocos conhecidos (LinkedIn, Indeed, Gupy...), <main>
// ou <article>, e por último o <body>. Título e empresa vão no topo do texto.
function captureJob(maxText) {
  const clean = (s) =>
    String(s ?? "")
      .replace(/ /g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .trim();
  // DOMParser não carrega imagens nem roda scripts do HTML da descrição.
  const htmlToText = (html) => {
    const marked = String(html ?? "").replace(/<(br|\/p|\/li|\/h\d|\/div)\b/gi, "\n<$1");
    return new DOMParser().parseFromString(marked, "text/html").body.textContent ?? "";
  };

  let title =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("h1")?.innerText ||
    document.title;
  let company = "";
  let text = clean(window.getSelection()?.toString());

  if (!text) {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const items = [JSON.parse(script.textContent)].flat().flatMap((d) => d?.["@graph"] ?? [d]);
        const job = items.find((d) => [d?.["@type"]].flat().includes("JobPosting"));
        if (job?.description) {
          title = job.title || title;
          company = job.hiringOrganization?.name || "";
          text = clean(htmlToText(job.description));
          break;
        }
      } catch {
        // JSON-LD inválido: tenta o próximo
      }
    }
  }

  if (!text) {
    const selectors = [
      "#job-details",
      ".jobs-description__content",
      ".jobs-box__html-content",
      "#jobDescriptionText",
      '[data-testid="text-section"]',
      '[class*="job-description" i]',
      '[class*="jobDescription"]',
      "main",
      "article",
    ];
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.innerText);
      if (value.length >= 200) {
        text = value;
        break;
      }
    }
  }
  if (!text) text = clean(document.body?.innerText);
  if (!company) company = document.querySelector('meta[property="og:site_name"]')?.content || "";

  const header = [clean(title), clean(company)].filter(Boolean).join("\n");
  const full = header && !text.startsWith(clean(title)) ? `${header}\n\n${text}` : text;
  return { text: full.slice(0, maxText), url: location.href.split("#")[0] };
}
