"use client";

import { useState } from "react";
import { IMPORT_LIMITS, type ImportedJob, type ImportRequest, type ImportResponse } from "@/lib/jobImport/types";
import { MAX_DESCRIPTION_LENGTH } from "./ui";

// Estado da aba "Link da vaga". Fica na página (e não no painel) para o
// "Voltar" da prévia cair de novo na confirmação, com o texto editado.
export type LinkResult =
  | { kind: "idle" }
  // Link digitado não passou na validação do cliente.
  | { kind: "invalido"; error: string }
  // texto é a versão editável de vaga.texto.
  | { kind: "ok"; vaga: ImportedJob; texto: string }
  | { kind: "duplicada"; jobId: string }
  | { kind: "colar_texto"; mensagem: string; url: string }
  // 4xx da rota ou falha de rede; url é o link digitado.
  | { kind: "erro"; error: string; url: string };

// Validação leve; o servidor revalida tudo (inclusive SSRF e sites bloqueados).
export function validateImportUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Cole o link da vaga.";
  if (value.length > IMPORT_LIMITS.urlChars) {
    return `Link longo demais (${value.length}/${IMPORT_LIMITS.urlChars} caracteres).`;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Isso não parece um link. Copie o endereço completo, começando com https://";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Use um link que comece com http:// ou https://";
  }
  return null;
}

// Conteúdo do textarea que é só um link (vai para a aba Link, sem chamar a IA).
export function isOnlyLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export function okResult(vaga: ImportedJob): LinkResult {
  return { kind: "ok", vaga, texto: vaga.texto.slice(0, MAX_DESCRIPTION_LENGTH) };
}

export function useLinkImport() {
  const [link, setLink] = useState("");
  const [result, setResult] = useState<LinkResult>({ kind: "idle" });
  const [isFetching, setIsFetching] = useState(false);

  async function fetchJob(url: string) {
    setIsFetching(true);
    setResult({ kind: "idle" });
    try {
      const body: ImportRequest = { url };
      const res = await fetch("/api/vaga/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // corpo vazio ou não JSON: cai nas mensagens padrão abaixo
      }

      if (!res.ok) {
        const error = (data as { error?: unknown } | null)?.error;
        setResult({
          kind: "erro",
          error: typeof error === "string" && error ? error : "Não foi possível buscar a vaga.",
          url,
        });
        return;
      }

      const response = data as ImportResponse | null;
      switch (response?.status) {
        case "ok":
          setResult(okResult(response.vaga));
          return;
        case "duplicada":
          setResult({ kind: "duplicada", jobId: response.jobId });
          return;
        case "colar_texto":
          setResult({ kind: "colar_texto", mensagem: response.mensagem, url: response.url || url });
          return;
        default:
          setResult({ kind: "erro", error: "Não foi possível buscar a vaga.", url });
      }
    } catch {
      setResult({ kind: "erro", error: "Falha de conexão. Tente novamente.", url });
    } finally {
      setIsFetching(false);
    }
  }

  function setConfirmText(texto: string) {
    setResult((current) => (current.kind === "ok" ? { ...current, texto } : current));
  }

  return { link, setLink, result, setResult, isFetching, fetchJob, setConfirmText };
}
