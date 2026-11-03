// Contrato de POST /api/vaga/importar, compartilhado entre o servidor
// (app/api/vaga/importar/route.ts) e a interface de /nova-vaga. A rota exige
// login, nunca grava vaga e nunca chama a IA: a análise segue em /api/analyze,
// depois da confirmação "É esta vaga?".
//
// A captura enviada pela extensão do navegador fica para a etapa da extensão:
// por enquanto o pedido traz só o link.

export const IMPORT_LIMITS = {
  urlChars: 2000,
  // Teto do texto devolvido. A rota usa o menor entre este valor e o
  // maxDescriptionLength de /admin, o mesmo limite de /api/analyze; o texto
  // maior é cortado, com o aviso "texto_cortado".
  textChars: 8000,
  // Abaixo disso o texto aparece com o aviso "texto_incompleto", nunca é descartado.
  minTextChars: 300,
} as const;

// Pedidos por conta e por IP, contados em AiUsage com a ação "import_url", que
// fica fora das contas de IA. Cada link buscado conta, inclusive os que caem em
// "colar_texto"; link já cadastrado e site bloqueado não contam, porque não
// baixam nada.
export const IMPORT_USAGE_ACTION = "import_url";

export const IMPORT_QUOTA = {
  perHour: 20,
  perDay: 60,
  perIpHour: 40,
} as const;

// Sem canal nem userId: o usuário vem da sessão e o cadastro é sempre "manual".
export type ImportRequest = {
  url: string;
};

export type ImportAviso = "texto_incompleto" | "texto_cortado";

// Dados para a confirmação "É esta vaga?". O texto é editável na interface.
// urlFinal é o endereço depois dos redirecionamentos, sem fragmento (#...): é o
// link que vai para o campo "Link da vaga".
export type ImportedJob = {
  texto: string;
  titulo: string | null;
  empresa: string | null;
  urlFinal: string;
  site: string;
  avisos: ImportAviso[];
};

export type ImportFallbackReason =
  | "site_bloqueado"
  | "url_recusada"
  | "acesso_negado"
  | "desafio_ou_captcha"
  | "exige_login"
  | "pagina_so_javascript"
  | "tempo_esgotado"
  | "pagina_grande_demais"
  | "formato_nao_suportado"
  | "leitura_falhou";

// Fronteira entre 200 e 4xx:
// - 200: o pedido foi entendido e o resultado é um destes três casos, inclusive
//   quando a página não pôde ser lida ("colar_texto").
// - 400 (corpo inválido, link ausente ou longo demais), 401 (sem login) e
//   429 (limite de importações) respondem { error: string }, como as outras
//   rotas. A interface mostra o erro e oferece "Colar texto" com o link.
export type ImportResponse =
  | { status: "ok"; vaga: ImportedJob }
  // Conferido no link enviado e, depois dos redirecionamentos, no urlFinal.
  | { status: "duplicada"; jobId: string }
  // mensagem é texto para a tela, sem HTML da página e sem IP de destino. url é
  // o link a preencher na aba "Colar texto" (o final, se houve redirecionamento).
  | { status: "colar_texto"; motivo: ImportFallbackReason; mensagem: string; url: string };
