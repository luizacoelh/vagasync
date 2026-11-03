import { parse, type HTMLElement } from "node-html-parser";

// Tira da página o texto da vaga, sem IA. Ordem (plano, seção 3.2):
// 1. JSON-LD JobPosting (Gupy, Himalayas, Sólides, Programathor, Vagas.com...);
// 2. dados do Next.js (__NEXT_DATA__), onde Remotar e Gupy guardam a vaga;
// 3. último recurso: o maior bloco de texto da página, sem menu, rodapé e scripts.
// Salário, modalidade e local que vêm em campos à parte entram no texto, para a
// análise preencher esses campos também.

export type Extracted = {
  texto: string;
  titulo: string | null;
  empresa: string | null;
};

export type PageProblem = "desafio_ou_captcha" | "exige_login" | "pagina_so_javascript";

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav",
  "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);
// <form> fica: páginas ASP.NET guardam o conteúdo inteiro dentro de um.
const NOISE = "script, style, noscript, svg, template, iframe, nav, footer, header, aside, button, select";

function clean(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Itens de lista seguidos ficam um por linha, sem linha em branco no meio.
    .replace(/\n\n(?=- )/g, "\n")
    .trim();
}

function walk(node: HTMLElement, out: string[]) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out.push(child.text);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    const tag = el.rawTagName?.toLowerCase() ?? "";
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push("\n");
    if (tag === "li") out.push("- ");
    walk(el, out);
    if (block) out.push("\n");
  }
}

function elementText(el: HTMLElement): string {
  const out: string[] = [];
  walk(el, out);
  return clean(out.join(""));
}

// HTML de um campo (descrição da Gupy, do Remotar ou do JSON-LD) em texto com
// quebras de linha e listas.
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return clean(html);
  return elementText(parse(html, { blockTextElements: { pre: true } }));
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = clean(value);
  return text === "" ? null : text;
}

function short(value: unknown, max = 200): string | null {
  const text = str(value);
  if (!text) return null;
  const plain = htmlToText(text).replace(/\s+/g, " ");
  return plain === "" ? null : plain.slice(0, max);
}

function join(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p && p.trim() !== "").join("\n\n");
}

// ---------- 1. JSON-LD ----------

function* jsonLdNodes(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* jsonLdNodes(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  yield node;
  if (node["@graph"]) yield* jsonLdNodes(node["@graph"]);
}

function isJobPosting(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

function salaryText(value: unknown): string | null {
  if (!value || typeof value !== "object") return short(value, 120);
  const salary = value as Record<string, unknown>;
  const currency = str(salary.currency) ?? "";
  const unit: Record<string, string> = { HOUR: "hora", DAY: "dia", WEEK: "semana", MONTH: "mês", YEAR: "ano" };
  const inner = (salary.value && typeof salary.value === "object" ? salary.value : salary) as Record<string, unknown>;
  const min = inner.minValue ?? inner.value;
  const max = inner.maxValue;
  const period = unit[String(inner.unitText ?? salary.unitText ?? "").toUpperCase()];
  if (typeof min !== "number" && typeof min !== "string") return null;
  if (Number(min) === 0 && !max) return null;
  const range = max && max !== min ? `${min} a ${max}` : `${min}`;
  return `${currency} ${range}${period ? ` por ${period}` : ""}`.trim();
}

function placeText(node: Record<string, unknown>): string | null {
  if (node.jobLocationType === "TELECOMMUTE") return "Remoto";
  const places = Array.isArray(node.jobLocation) ? node.jobLocation : [node.jobLocation];
  for (const place of places) {
    const address = (place as Record<string, unknown> | undefined)?.address as Record<string, unknown> | undefined;
    if (!address || typeof address !== "object") continue;
    const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
      .map((part) => (typeof part === "string" ? part : (part as Record<string, unknown> | undefined)?.name))
      .filter((part): part is string => typeof part === "string" && part.trim() !== "");
    if (parts.length) return parts.join(", ");
  }
  return null;
}

function fromJsonLd(root: HTMLElement): Extracted | null {
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.text);
    } catch {
      continue;
    }
    for (const node of jsonLdNodes(data)) {
      if (!isJobPosting(node)) continue;
      const description = str(node.description);
      if (!description) continue;
      const org = node.hiringOrganization as Record<string, unknown> | string | undefined;
      const empresa = short(typeof org === "string" ? org : org?.name);
      const titulo = short(node.title);
      const salario = salaryText(node.baseSalary);
      const local = placeText(node);
      const tipo = short(Array.isArray(node.employmentType) ? node.employmentType.join(", ") : node.employmentType, 80);
      const texto = join([
        titulo,
        empresa ? `Empresa: ${empresa}` : null,
        htmlToText(description),
        salario ? `Salário: ${salario}` : null,
        local ? `Local: ${local}` : null,
        tipo ? `Tipo de contrato: ${tipo}` : null,
      ]);
      return { texto, titulo, empresa };
    }
  }
  return null;
}

// ---------- 2. __NEXT_DATA__ ----------

// Campos com HTML ou texto longo que costumam trazer partes da vaga.
const SECTION_FIELDS: [string, string][] = [
  ["responsibilities", "Responsabilidades"],
  ["prerequisites", "Requisitos"],
  ["requirements", "Requisitos"],
  ["relevantExperiences", "Diferenciais"],
  ["differentials", "Diferenciais"],
  ["benefits", "Benefícios"],
  ["additionalInformation", "Informações adicionais"],
  ["moreInfos", "Informações adicionais"],
];
const COMPANY_KEYS = ["companyDisplayName", "companyName", "careerPageName"];
const COMPANY_OBJECTS = ["company", "careerPage", "hiringOrganization", "organization"];

function companyOf(job: Record<string, unknown>, parents: Record<string, unknown>[]): string | null {
  for (const source of [job, ...parents]) {
    for (const key of COMPANY_KEYS) {
      const name = short(source[key]);
      if (name) return name;
    }
    for (const key of COMPANY_OBJECTS) {
      const value = source[key];
      if (value && typeof value === "object") {
        const name = short((value as Record<string, unknown>).name);
        if (name) return name;
      }
    }
  }
  return null;
}

function remotarSalary(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const salary = value as Record<string, unknown>;
  const from = Number(salary.from);
  const to = Number(salary.to);
  if (!(from > 0) && !(to > 0)) return null;
  const currency = str(salary.currency) ?? "";
  return `${currency} ${from > 0 ? from : ""}${from > 0 && to > 0 ? " a " : ""}${to > 0 ? to : ""}`.trim();
}

function tagNames(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const names = value
    .map((item) => (item as Record<string, unknown>)?.tag ?? item)
    .map((tag) => short((tag as Record<string, unknown>)?.name ?? tag, 60))
    .filter((name): name is string => !!name)
    // Os rótulos do Remotar vêm com emoji ("😎 Pleno").
    .map((name) => name.replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .filter(Boolean);
  return names.length ? [...new Set(names)].join(", ") : null;
}

const WORKPLACE: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  "on-site": "Presencial",
  onsite: "Presencial",
  presential: "Presencial",
};

// Procura no JSON um objeto com cara de vaga: título (title ou name) e uma
// descrição longa. Fica com a de descrição mais longa.
function findJob(
  value: unknown,
  parents: Record<string, unknown>[] = [],
  depth = 0,
  best: { job: Record<string, unknown>; parents: Record<string, unknown>[]; size: number } | null = null,
) {
  if (depth > 12 || !value || typeof value !== "object") return best;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 200)) best = findJob(item, parents, depth + 1, best);
    return best;
  }
  const node = value as Record<string, unknown>;
  const description = node.description;
  const title = node.title ?? node.name;
  if (typeof description === "string" && typeof title === "string" && description.length >= 200) {
    const size = description.length;
    if (!best || size > best.size) best = { job: node, parents, size };
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "similarJobs" || key === "relatedJobs") continue;
    best = findJob(child, [node, ...parents].slice(0, 4), depth + 1, best);
  }
  return best;
}

function fromNextData(root: HTMLElement): Extracted | null {
  const script = root.querySelector("script#__NEXT_DATA__");
  if (!script) return null;
  let data: unknown;
  try {
    data = JSON.parse(script.text);
  } catch {
    return null;
  }
  const found = findJob((data as Record<string, unknown>)?.props ?? data);
  if (!found) return null;
  const { job, parents } = found;
  const titulo = short(job.title ?? job.name);
  const empresa = companyOf(job, parents);
  const seen = new Set<string>();
  const sections = SECTION_FIELDS.map(([key, label]) => {
    const text = str(job[key]);
    if (!text || seen.has(text)) return null;
    seen.add(text);
    return `${label}:\n${htmlToText(text)}`;
  });
  const salario = remotarSalary(job.jobSalary) ?? short(job.salary, 120);
  const modalidade = typeof job.type === "string" ? WORKPLACE[job.type.toLowerCase()] : undefined;
  const workplace = typeof job.workplaceType === "string" ? WORKPLACE[job.workplaceType.toLowerCase()] : undefined;
  const local = [short(job.city, 80), short(job.state, 80)].filter(Boolean).join(", ");
  const texto = join([
    titulo,
    empresa ? `Empresa: ${empresa}` : null,
    short(job.subtitle, 300),
    htmlToText(String(job.description)),
    ...sections,
    salario ? `Salário: ${salario}` : null,
    modalidade || workplace ? `Modalidade: ${modalidade ?? workplace}` : null,
    local ? `Local: ${local}` : null,
    tagNames(job.jobTags) ? `Etiquetas: ${tagNames(job.jobTags)}` : null,
  ]);
  return { texto, titulo, empresa };
}

// ---------- 3. Último recurso ----------

function meta(root: HTMLElement, name: string): string | null {
  const el = root.querySelector(`meta[property="${name}"]`) ?? root.querySelector(`meta[name="${name}"]`);
  return short(el?.getAttribute("content"));
}

function fromMainText(root: HTMLElement): Extracted {
  const titulo = meta(root, "og:title") ?? short(root.querySelector("h1")?.text) ?? short(root.querySelector("title")?.text);
  const empresa = meta(root, "og:site_name");
  const body = root.querySelector("body") ?? root;
  for (const el of body.querySelectorAll(NOISE)) el.remove();
  // Menu, rodapé e scripts já saíram; se houver <main> ou <article> com texto
  // suficiente, fica só com ele.
  const main = body.querySelector("main, article, [role=main]");
  const mainText = main ? elementText(main) : "";
  const texto = mainText.length >= 300 ? mainText : elementText(body);
  return { texto, titulo, empresa };
}

// ---------- Problemas da página ----------

// Só decide quando a página quase não tem texto: com a vaga lida, um script da
// Cloudflare ou um reCAPTCHA no formulário de candidatura não atrapalham, e texto
// curto aparece com o aviso "texto_incompleto" em vez de ser descartado.
export function pageProblem(html: string, textLength: number): PageProblem | null {
  if (textLength >= 300) return null;
  const head = html.slice(0, 200_000).toLowerCase();
  if (
    /cf-chl|challenge-platform|just a moment\.\.\.|attention required|g-recaptcha|h-captcha|hcaptcha\.com|captcha-delivery|px-captcha/.test(head)
  ) {
    return "desafio_ou_captcha";
  }
  if (/type=["']?password/.test(head)) return "exige_login";
  if (textLength < 80) return "pagina_so_javascript";
  return null;
}

export function extractFromHtml(html: string): Extracted {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const fromData = fromJsonLd(root) ?? fromNextData(root);
  if (fromData && fromData.texto.length >= 200) return fromData;
  const fallback = fromMainText(root);
  if (fromData && fromData.texto.length >= fallback.texto.length) return fromData;
  return {
    texto: fallback.texto,
    titulo: fromData?.titulo ?? fallback.titulo,
    empresa: fromData?.empresa ?? fallback.empresa,
  };
}

// ---------- GitHub (issues dos repositórios de vagas) ----------

// github.com/dono/repo/issues/123 → API pública, que devolve título e corpo.
export function githubIssueApi(url: URL): string | null {
  if (url.hostname.toLowerCase() !== "github.com") return null;
  const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\/?$/);
  return match ? `https://api.github.com/repos/${match[1]}/${match[2]}/issues/${match[3]}` : null;
}

export function extractFromGithubIssue(json: string): Extracted | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const titulo = short(data.title);
  const body = str(data.body);
  if (!titulo || !body) return null;
  const labels = Array.isArray(data.labels)
    ? data.labels.map((label) => short((label as Record<string, unknown>)?.name, 60)).filter(Boolean)
    : [];
  const texto = join([titulo, body, labels.length ? `Etiquetas: ${labels.join(", ")}` : null]);
  return { texto, titulo, empresa: null };
}
