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
    // O id vai no fragmento da URL aberta: só essa aba recebe a captura (outra
    // aba /nova-vaga aberta não pega a vaga de outro clique). O fragmento não
    // vai ao servidor.
    const id = crypto.randomUUID();
    await chrome.storage.session.set({ captura: { ...result, id, at: Date.now() } });
    badge("", "Enviar esta vaga para o VagaSync");
    await chrome.tabs.create({ url: `${SITE}/nova-vaga#captura=${id}` });
  } catch {
    badge("!", "Esta página não deixa a extensão ler. Copie e cole o texto no VagaSync.");
  }
});

// Pedidos do bridge.js: "pegar" devolve a captura do id pedido (até 10 min),
// "apagar" limpa. Cada clique novo substitui a captura anterior.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "pegar") {
    chrome.storage.session
      .get("captura")
      .then(({ captura }) => {
        const fresh = captura && Date.now() - (captura.at ?? 0) <= MAX_AGE;
        if (captura && !fresh) chrome.storage.session.remove("captura");
        const mine = fresh && typeof message.id === "string" && message.id === captura.id;
        sendResponse(mine ? { text: captura.text, url: captura.url, method: captura.method, truncated: captura.truncated } : null);
      })
      .catch(() => sendResponse(null));
    return true;
  }
  if (message?.type === "apagar") {
    chrome.storage.session.get("captura").then(({ captura }) => {
      if (captura?.id === message.id) chrome.storage.session.remove("captura");
    });
  }
});

function badge(text, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#E5534B" });
  chrome.action.setTitle({ title });
}

// Roda dentro da página da vaga. Ordem: texto selecionado pela pessoa,
// JobPosting em JSON-LD, blocos conhecidos (LinkedIn, Indeed, Gupy...), o bloco
// abaixo de um título "Sobre a vaga"/"Descrição", o bloco com mais texto corrido
// (fora de menus, rodapés, barras laterais e links) e, por último, a página toda.
// Devolve também como achou o texto (method) e se passou do teto (truncated).
function captureJob(maxText) {
  const NOISE =
    "nav, header, footer, aside, form, dialog, [role=navigation], [role=banner], [role=contentinfo], " +
    "[role=complementary], [role=dialog], [aria-hidden=true], script, style, noscript, template, iframe, button, select";
  const JUNK_LINE = /^(ver mais|exibir mais|mostrar mais|mostrar menos|see more|show more|show less|ver menos|…\s*mais|\.\.\.\s*mais|promovida|promoted)$/i;
  const clean = (s) =>
    String(s ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !JUNK_LINE.test(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  // DOMParser não carrega imagens nem roda scripts do HTML da descrição.
  const htmlToText = (html) => {
    const marked = String(html ?? "").replace(/<(br|\/p|\/li|\/h\d|\/div)\b/gi, "\n<$1");
    return new DOMParser().parseFromString(marked, "text/html").body.textContent ?? "";
  };
  const visible = (el) => el.getClientRects().length > 0;
  const textOf = (el) => (el && visible(el) ? clean(el.innerText) : "");

  let title =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("h1")?.innerText ||
    document.title;
  let company = "";
  let method = "selecao";
  let text = clean(window.getSelection()?.toString());

  if (!text) {
    method = "dados";
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

  // Blocos conhecidos. Junta todas as ocorrências do seletor (a Gupy divide a
  // vaga em várias seções iguais), sem repetir bloco que está dentro de outro.
  if (!text) {
    method = "bloco";
    const selectors = [
      ".jobs-description__content",
      ".jobs-description-content__text",
      "#job-details",
      ".jobs-box__html-content",
      ".show-more-less-html__markup",
      ".description__text",
      "#jobDescriptionText",
      '[data-testid="text-section"]',
      '[data-qa="job-description"]',
      ".job__description",
      '[class*="JobDetails_jobDescription"]',
      '[class*="job-description" i]',
      '[class*="jobDescription"]',
    ];
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)].filter((el) => !el.closest(NOISE));
      const tops = found.filter((el) => !found.some((other) => other !== el && other.contains(el)));
      const value = clean(tops.map(textOf).filter(Boolean).join("\n\n"));
      if (value.length >= 200) {
        text = value;
        break;
      }
    }
  }

  // Título de seção ("Sobre a vaga", "Descrição"...): sobe até o bloco que o
  // contém com texto suficiente, desde que não seja a página inteira.
  if (!text) {
    const HEADING =
      /^(sobre a vaga|sobre o cargo|sobre a oportunidade|about the job|about the role|job description|descri[cç][aã]o( da vaga| do cargo)?|descripci[oó]n( del (puesto|empleo|trabajo))?|acerca del empleo)\s*:?$/i;
    const bodyLength = textOf(document.body).length;
    for (const el of document.querySelectorAll("h1, h2, h3, h4, strong, b, span, p, div")) {
      if (el.childElementCount > 1 || el.closest(NOISE)) continue;
      if (!HEADING.test(clean(el.textContent))) continue;
      let box = el.parentElement;
      while (box && box !== document.body && textOf(box).length < 300) box = box.parentElement;
      const value = box && box !== document.body ? textOf(box) : "";
      if (value.length >= 300 && value.length < bodyLength * 0.8) {
        text = value;
        break;
      }
    }
  }

  // Texto corrido: cada trecho fora de link conta para o bloco pai (inteiro) e
  // o avô (metade), como no modo leitura dos navegadores. Fica o bloco com mais
  // pontos; sobe enquanto o pai só acrescenta pouco (um título, um invólucro).
  if (!text) {
    const own = new Map();
    const score = new Map();
    const add = (map, el, n) => el && map.set(el, (map.get(el) ?? 0) + n);
    const BLOCK = "p, li, dd, td, pre, blockquote, h1, h2, h3, h4, h5, h6, div, section, article";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const length = node.textContent.trim().length;
      if (!parent || length < 2 || parent.closest("a") || parent.closest(NOISE)) continue;
      for (let el = parent; el; el = el.parentElement) add(own, el, length);
      const block = parent.closest(BLOCK);
      add(score, block?.parentElement, length);
      add(score, block?.parentElement?.parentElement, length / 2);
    }
    let best = null;
    for (const [el, points] of score) {
      if (el === document.body || el === document.documentElement || !visible(el)) continue;
      if (!best || points > score.get(best)) best = el;
    }
    while (best?.parentElement && best.parentElement !== document.body && (own.get(best.parentElement) ?? 0) <= (own.get(best) ?? 0) * 1.25) {
      best = best.parentElement;
    }
    const value = textOf(best);
    if (value.length >= 200) text = value;
  }

  if (!text) {
    method = "pagina";
    text = textOf(document.querySelector("main")) || textOf(document.querySelector("article")) || textOf(document.body);
  }
  if (!company) company = document.querySelector('meta[property="og:site_name"]')?.content || "";

  const header = [clean(title), clean(company)].filter(Boolean).join("\n");
  const full = header && !text.startsWith(clean(title)) ? `${header}\n\n${text}` : text;
  return { text: full.slice(0, maxText), url: location.href.split("#")[0], method, truncated: full.length > maxText };
}
