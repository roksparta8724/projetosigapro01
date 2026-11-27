import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { inspectLoginEntryBundle, MAX_LOGIN_ENTRY_GZIP_BYTES } from "./qa-login-bundle-budget.mjs";

function withBuild({ script = "/assets/index-qa.js", bytes = Buffer.from("console.log('QA')"), extra = "" }, check) {
  const directory = mkdtempSync(join(tmpdir(), "sigapro-bundle-budget-"));
  try {
    mkdirSync(join(directory, "assets"));
    writeFileSync(join(directory, "index.html"),
      '<!doctype html><html><head>' + extra + '</head><body><script type="module" crossorigin src="' + script + '"></script></body></html>');
    writeFileSync(join(directory, "assets", "index-qa.js"), bytes);
    return check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("budget de entrada do SIGAPRO está definido e o bundle compacto é aceito", () => {
  assert.equal(MAX_LOGIN_ENTRY_GZIP_BYTES, 750 * 1024);
  withBuild({}, directory => {
    const result = inspectLoginEntryBundle(directory);
    assert.equal(result.entry, "/assets/index-qa.js");
    assert.ok(result.gzipBytes > 0);
    assert.ok(result.gzipBytes < result.limitBytes);
  });
});

test("bloqueia aumento do JavaScript inicial acima do orçamento", () => {
  const bytes = randomBytes(8192);
  withBuild({bytes}, directory => {
    assert.throws(
      () => inspectLoginEntryBundle(directory, 4096),
      /SIGAPRO_LOGIN_BUNDLE_OVER_BUDGET/,
    );
    assert.ok(inspectLoginEntryBundle(directory, 16000).gzipBytes > 4096);
  });
});

test("recusa script inseguro ou ausente, sem tocar em outro caminho do servidor", () => {
  withBuild({script: "/assets/../other.js"}, directory => {
    assert.throws(() => inspectLoginEntryBundle(directory), /SIGAPRO_LOGIN_ENTRY_INVALID/);
  });
  withBuild({script: "https://outside.invalid/index.js"}, directory => {
    assert.throws(() => inspectLoginEntryBundle(directory), /SIGAPRO_LOGIN_ENTRY_INVALID/);
  });
  withBuild({script: "/assets/index-qa.js",extra: '<script type="module" src="/assets/index-two.js"></script>'},
    directory => {
      assert.throws(() => inspectLoginEntryBundle(directory), /SIGAPRO_LOGIN_ENTRY_MISSING/);
    });
});

test("aceita atributos HTML do script module em qualquer ordem", () => {
  withBuild({}, directory => {
    const result = inspectLoginEntryBundle(directory);
    assert.ok(result.rawBytes > 0);
  });
});
