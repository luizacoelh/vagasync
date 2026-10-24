import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Headers de segurança aplicados a todas as respostas do app.
// Referência: https://nextjs.org/docs/app/api-reference/config/next-config-js/headers
const securityHeaders = [
  // Impede que o app seja embutido num <iframe> em outro domínio (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },

  // Impede que o browser "adivinhe" o Content-Type de uma resposta
  // (MIME sniffing — pode fazer o browser executar texto como script).
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Controla quais informações da URL atual são enviadas no header Referer
  // quando o usuário clica num link externo. "strict-origin-when-cross-origin"
  // envia só a origem (sem path/querystring) para domínios externos —
  // evita vazar IDs de vagas ou parâmetros internos no Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Desativa APIs de hardware que o app não usa. Sem isso, scripts de terceiros
  // (se um dia existirem) poderiam pedir acesso à câmera, microfone ou GPS.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },

  // Content-Security-Policy: define de onde o browser pode carregar cada tipo de recurso.
  // Cada diretiva é uma linha separada para facilitar leitura e manutenção.
  //
  // IMPORTANTE — 'unsafe-inline' em script-src:
  // O Next.js injeta scripts inline no HTML durante o build (hydration, chunks).
  // Sem 'unsafe-inline' o app quebra. A mitigação real para XSS no Next.js é
  // o próprio React escaping automático + não usar dangerouslySetInnerHTML.
  // Se no futuro quiser remover 'unsafe-inline', a alternativa é usar nonces
  // (next.config: headers com nonce + middleware gerando nonce por request) —
  // complexidade alta, deixado como melhoria futura.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: próprio domínio + inline do Next.js (hydration/chunks).
      // 'unsafe-eval' só em dev: React usa eval() para reconstruir call stacks
      // no modo de desenvolvimento. Em produção nunca usa eval() — confirmado
      // pelo próprio aviso do React. Remover em prod mantém a CSP mais restrita.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      // Estilos: próprio domínio + inline (Tailwind/Next) + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fontes: próprio domínio + Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com",
      // Imagens: próprio domínio + data URIs + avatares do GitHub e Google
      "img-src 'self' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
      // Conexões fetch/XHR: próprio domínio + API do Gemini
      "connect-src 'self' https://generativelanguage.googleapis.com",
      // Frames: nenhum (mesmo efeito de X-Frame-Options: DENY, mas via CSP)
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // staleTimes.dynamic controla o TTL do cache do lado do cliente para rotas
    // dinâmicas com loading.tsx. O padrão é 0 (sem cache), o que faz o skeleton
    // aparecer em cada navegação ao dashboard. Com 300s, navegações repetidas
    // dentro desse janela são instantâneas. Mutações via Server Actions chamam
    // revalidatePath, que invalida também o Client Router Cache — garantindo
    // dados frescos após mudanças sem precisar aguardar o TTL expirar.
    staleTimes: {
      dynamic: 300,
    },
  },
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "@libsql/client",
    "@prisma/adapter-libsql",
  ],

  async headers() {
    return [
      {
        // Aplica os headers de segurança em TODAS as rotas do app.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
