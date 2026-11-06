import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./support/ts-loader.mjs", import.meta.url);
const { parseExtensionCapture, CAPTURE_LIMITS } = await import("@/lib/extensionCapture");

const msg = (captura, type = "vagasync:captura") => ({ type, captura });

test("aceita texto e link http(s)", () => {
  assert.deepEqual(parseExtensionCapture(msg({ text: "  Vaga de estágio  ", url: "https://vagas.dev/1" })), {
    text: "Vaga de estágio",
    url: "https://vagas.dev/1",
    method: null,
    truncated: false,
  });
});

test("link inválido ou de outro protocolo vira null, o texto continua", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "não é link", 42, "https://x.dev/" + "a".repeat(2100)]) {
    assert.deepEqual(parseExtensionCapture(msg({ text: "Vaga", url })), { text: "Vaga", url: null, method: null, truncated: false });
  }
});

test("recusa mensagem de outro tipo, sem texto ou malformada", () => {
  for (const data of [null, "x", {}, msg({ text: "Vaga" }, "outro"), msg(null), msg({ text: "   " }), msg({ text: 1 })]) {
    assert.equal(parseExtensionCapture(data), null);
  }
});

test("corta o texto no limite", () => {
  const capture = parseExtensionCapture(msg({ text: "a".repeat(CAPTURE_LIMITS.textChars + 50) }));
  assert.equal(capture.text.length, CAPTURE_LIMITS.textChars);
  assert.equal(capture.truncated, true);
});

test("aceita só método conhecido e marca o corte avisado pela extensão", () => {
  assert.equal(parseExtensionCapture(msg({ text: "Vaga", method: "bloco" })).method, "bloco");
  assert.equal(parseExtensionCapture(msg({ text: "Vaga", method: "pagina", truncated: true })).truncated, true);
  for (const method of ["outro", 1, null, "<b>"]) {
    assert.equal(parseExtensionCapture(msg({ text: "Vaga", method })).method, null);
  }
  assert.equal(parseExtensionCapture(msg({ text: "Vaga", truncated: "sim" })).truncated, false);
});
