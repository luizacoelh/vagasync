import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedHost } from "../lib/jobImport/blockedSites.ts";

test("bloqueia os domínios da lista e seus subdomínios", () => {
  for (const host of [
    "linkedin.com",
    "www.linkedin.com",
    "br.linkedin.com",
    "lnkd.in",
    "br.indeed.com",
    "indeed.com.br",
    "www.glassdoor.com.br",
    "www.catho.com.br",
  ]) {
    assert.equal(isBlockedHost(host), true, host);
  }
});

test("ignora maiúsculas e o ponto final do hostname", () => {
  assert.equal(isBlockedHost("WWW.LinkedIn.COM"), true);
  assert.equal(isBlockedHost("linkedin.com."), true);
});

test("não confunde domínio parecido com domínio bloqueado", () => {
  for (const host of [
    "notlinkedin.com",
    "linkedin.com.exemplo.com",
    "indeed.com.exemplo.br",
    "empresa.gupy.io",
    "",
  ]) {
    assert.equal(isBlockedHost(host), false, host);
  }
});
