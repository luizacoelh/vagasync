// node --test tests/ — as fontes ficam no repositório: o build não depende de
// baixar nada do Google (issue #35, falha intermitente no CI).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

test("o layout usa fontes locais, não next/font/google", () => {
  const layout = read("app/layout.tsx").toString();
  assert.match(layout, /from "next\/font\/local"/);
  assert.doesNotMatch(layout, /next\/font\/google/);
});

test("cada fonte existe em woff2 e vem com a licença OFL", () => {
  for (const [font, license] of [["inter-latin.woff2", "OFL-Inter.txt"], ["outfit-latin.woff2", "OFL-Outfit.txt"]]) {
    assert.equal(read(`app/fonts/${font}`).subarray(0, 4).toString("latin1"), "wOF2", font);
    assert.match(read(`app/fonts/${license}`).toString(), /SIL OPEN FONT LICENSE/, license);
  }
});

test("a CSP não libera mais os domínios do Google Fonts", () => {
  assert.doesNotMatch(read("next.config.ts").toString(), /fonts\.(googleapis|gstatic)\.com/);
});
