// Contrato de POST /api/vaga/importar, compartilhado entre o servidor (frente A)
// e a interface de /nova-vaga (frente B). A rota exige login, nunca grava vaga e
// nunca chama a IA: a análise segue em /api/analyze, depois da confirmação.

export const IMPORT_LIMITS = {
  urlChars: 2000,
  // Mesmo teto de /api/analyze; o texto final é cortado aqui, com aviso.
  textChars: 8000,
  // HTML capturado pela extensão. Vai no hash de /nova-vaga#importar=<dados>,
  // então fica bem abaixo dos 2 MB que o servidor aceita ao baixar a página.
  capturedHtmlChars: 500_000,
} as const;

// "selecao" é o único tipo aceito nos sites de lib/jobImport/blockedSites.ts: lá o
// servidor recusa "pagina". Ele não prova que o texto foi selecionado à mão;
// garante só que é texto puro dentro do limite.
export type ImportCapture =
  | { tipo: "selecao"; texto: string }
  | { tipo: "pagina"; html: string };

// Sem canal nem userId: o usuário vem da sessão e o cadastro é sempre "manual".
export type ImportRequest = {
  url: string;
  captura?: ImportCapture;
};

export type ImportAviso = "texto_incompleto" | "texto_cortado" | "outro_idioma";

// Dados para a confirmação "É esta vaga?". O texto é editável na interface.
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

// Respostas HTTP 200. Erro de pedido (400, 401, 413, 429) responde { error: string },
// como as outras rotas, e a interface também abre "Colar texto" com o link.
export type ImportResponse =
  | { status: "ok"; vaga: ImportedJob }
  | { status: "duplicada"; jobId: string }
  // mensagem é texto para a tela: sem HTML da página e sem IP de destino.
  | { status: "colar_texto"; motivo: ImportFallbackReason; mensagem: string; url: string };
