import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";

// Baixa uma página pública a pedido da usuária, sem abrir caminho para a rede
// interna (SSRF). Regras em docs/PLANO_N8N_IMPORTACAO_URL.md, seção 3.5:
// - só http/https, portas 80 e 443, sem usuário:senha@ e até 2000 caracteres;
// - o DNS é resolvido aqui e todo endereço interno ou reservado é recusado;
// - a conexão usa o IP validado, então o endereço não muda entre a checagem e a
//   conexão (DNS rebinding);
// - redirecionamentos são seguidos à mão, no máximo 3, validando cada destino;
// - 8 s no total, 2 MB de corpo (já descomprimido), só HTML ou JSON, sem cookies
//   e sem executar JavaScript.

export type SafeFetchErrorCode =
  | "url_recusada"
  | "site_bloqueado"
  | "tempo_esgotado"
  | "pagina_grande_demais"
  | "formato_nao_suportado"
  | "leitura_falhou";

export class SafeFetchError extends Error {
  constructor(
    readonly code: SafeFetchErrorCode,
    // Último endereço tentado, para a interface preencher o link.
    readonly url?: string,
  ) {
    super(code);
  }
}

export type SafeFetchResult = {
  status: number;
  url: string;
  contentType: string;
  body: string;
};

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  // Chamado com o hostname de cada destino, inclusive depois de redirecionar.
  isBlockedHost?: (hostname: string) => boolean;
  // Só para os testes: servidor local em outra porta.
  allowedPorts?: readonly number[];
  allowAddress?: (address: string) => boolean;
  resolve?: (hostname: string) => Promise<string[]>;
};

export const SAFE_FETCH_LIMITS = {
  urlChars: 2000,
  timeoutMs: 8000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
} as const;

const ACCEPTED_TYPES = ["text/html", "application/xhtml+xml", "application/json", "application/ld+json"];
const USER_AGENT = "VagaSync/1.0 (+https://vagasync.vercel.app; leitura de vaga a pedido da usuaria)";

// Listas separadas: o BlockList compara IPv4 também com as faixas IPv6 de
// IPv4 mapeado, e ::ffff:0:0/96 recusaria todo IPv4.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  // ::/96 cobre :: e ::1; ::ffff:0:0/96 é o IPv4 mapeado em IPv6.
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !blockedV4.check(address, "ipv4");
  if (version !== 6) return false;
  return !blockedV6.check(address, "ipv6");
}

// Confere o formato do link. Devolve a URL sem o fragmento (#...).
export function parsePublicUrl(raw: string, allowedPorts: readonly number[] = [80, 443]): URL {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > SAFE_FETCH_LIMITS.urlChars) {
    throw new SafeFetchError("url_recusada");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("url_recusada");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SafeFetchError("url_recusada");
  if (url.username || url.password) throw new SafeFetchError("url_recusada");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!allowedPorts.includes(port)) throw new SafeFetchError("url_recusada");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SafeFetchError("url_recusada");
  }
  // IP escrito no link: recusa já aqui, sem esperar o DNS.
  if (isIP(host) && !isPublicAddress(host)) throw new SafeFetchError("url_recusada");
  url.hash = "";
  return url;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

// Todos os endereços do nome precisam ser públicos: se um só for interno, recusa.
async function resolvePublic(url: URL, options: SafeFetchOptions): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const allow = options.allowAddress ?? isPublicAddress;
  const addresses = isIP(host) ? [host] : await (options.resolve ?? defaultResolve)(host).catch(() => {
    throw new SafeFetchError("leitura_falhou", url.href);
  });
  if (addresses.length === 0 || !addresses.every(allow)) throw new SafeFetchError("url_recusada", url.href);
  return addresses[0];
}

type RawResponse = { status: number; location: string | null; contentType: string; body: Buffer };

function decoder(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

function requestOnce(url: URL, address: string, maxBytes: number, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const family = isIP(address);
    const req = client.request(
      url,
      {
        method: "GET",
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
        },
        // Conecta no IP já validado; o certificado continua sendo conferido
        // contra o nome do site (servername vem da URL).
        lookup: (_hostname, options, callback) => {
          if ((options as { all?: boolean }).all) {
            (callback as unknown as (err: null, list: { address: string; family: number }[]) => void)(null, [{ address, family }]);
          } else {
            callback(null, address, family);
          }
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400 && location) {
          res.resume();
          resolve({ status, location, contentType, body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          reject(new SafeFetchError("pagina_grande_demais", url.href));
          return;
        }

        const unzip = decoder(res.headers["content-encoding"]);
        const stream = unzip ? res.pipe(unzip) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const fail = (error: unknown) => {
          if (done) return;
          done = true;
          res.destroy();
          unzip?.destroy();
          reject(error);
        };
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            fail(new SafeFetchError("pagina_grande_demais", url.href));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => {
          if (done) return;
          done = true;
          resolve({ status, location: null, contentType, body: Buffer.concat(chunks) });
        });
        stream.on("error", fail);
        res.on("error", fail);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function charsetOf(contentType: string): string {
  const match = contentType.match(/charset=["']?([\w-]+)/i);
  return match ? match[1].toLowerCase() : "utf-8";
}

function decodeBody(body: Buffer, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? SAFE_FETCH_LIMITS.timeoutMs;
  const maxBytes = options.maxBytes ?? SAFE_FETCH_LIMITS.maxBytes;
  const maxRedirects = options.maxRedirects ?? SAFE_FETCH_LIMITS.maxRedirects;
  const allowedPorts = options.allowedPorts ?? [80, 443];

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // O DNS não aceita cancelamento: a corrida garante o tempo total.
  const deadline = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new SafeFetchError("tempo_esgotado")), { once: true });
  });
  // O finally também aborta: sem isso a rejeição ficaria sem tratamento.
  deadline.catch(() => {});

  let url = parsePublicUrl(rawUrl, allowedPorts);
  try {
    for (let hop = 0; ; hop++) {
      if (options.isBlockedHost?.(url.hostname)) throw new SafeFetchError("site_bloqueado", url.href);
      const address = await Promise.race([resolvePublic(url, options), deadline]);
      let res: RawResponse;
      try {
        res = await Promise.race([requestOnce(url, address, maxBytes, controller.signal), deadline]);
      } catch (error) {
        if (error instanceof SafeFetchError) throw error;
        if (timedOut) throw new SafeFetchError("tempo_esgotado", url.href);
        throw new SafeFetchError("leitura_falhou", url.href);
      }

      if (res.location) {
        if (hop >= maxRedirects) throw new SafeFetchError("leitura_falhou", url.href);
        let next: string;
        try {
          next = new URL(res.location, url).href;
        } catch {
          throw new SafeFetchError("leitura_falhou", url.href);
        }
        try {
          url = parsePublicUrl(next, allowedPorts);
        } catch {
          throw new SafeFetchError("url_recusada", url.href);
        }
        continue;
      }

      const mediaType = res.contentType.split(";")[0].trim();
      // Página de erro também volta (sem conferir o tipo): quem chama decide pelo status.
      if (res.status < 400 && !ACCEPTED_TYPES.includes(mediaType)) {
        throw new SafeFetchError("formato_nao_suportado", url.href);
      }
      return { status: res.status, url: url.href, contentType: mediaType, body: decodeBody(res.body, res.contentType) };
    }
  } catch (error) {
    if (timedOut && !(error instanceof SafeFetchError && error.code !== "tempo_esgotado")) {
      throw new SafeFetchError("tempo_esgotado", url.href);
    }
    if (error instanceof SafeFetchError) {
      throw error.url ? error : new SafeFetchError(error.code, url.href);
    }
    throw new SafeFetchError("leitura_falhou", url.href);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
