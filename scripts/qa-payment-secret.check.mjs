import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadOrCreateQaPaymentSecret } from "./qa-payment-secret.mjs";

const qaData = "https://ep-qa-one.apirest.example.com/sigapro_db/rest/v1";
const qaOther = "https://ep-qa-two.apirest.example.com/sigapro_db/rest/v1";

function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), "sigapro-qa-payment-"));
  try { return fn(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("provisions an unpredictable 48-byte secret and reuses it on restart", () => fixture((directory) => {
  const first = loadOrCreateQaPaymentSecret({ dataApiUrl: qaData, directory });
  const second = loadOrCreateQaPaymentSecret({ dataApiUrl: qaData, directory });
  assert.match(first.secret, /^[0-9a-f]{96}$/);
  assert.equal(first.source, "created");
  assert.equal(second.source, "existing");
  assert.equal(first.secret, second.secret);
  assert.equal(readdirSync(directory).length, 1);
}));

test("different isolated Neon branches never reuse the same secret", () => fixture((directory) => {
  const first = loadOrCreateQaPaymentSecret({ dataApiUrl: qaData, directory });
  const second = loadOrCreateQaPaymentSecret({ dataApiUrl: qaOther, directory });
  assert.notEqual(first.secret, second.secret);
  assert.equal(readdirSync(directory).length, 2);
}));

test("refuses an invalid existing secret rather than silently rotating bank credentials", () => fixture((directory) => {
  loadOrCreateQaPaymentSecret({ dataApiUrl: qaData, directory });
  const [name] = readdirSync(directory);
  const file = join(directory, name);
  writeFileSync(file, "broken\n");
  assert.throws(() => loadOrCreateQaPaymentSecret({ dataApiUrl: qaData, directory }), /inválida/);
  assert.equal(readFileSync(file, "utf8"), "broken\n");
}));

test("refuses a non-Neon or non-TLS origin", () => fixture((directory) => {
  assert.throws(
    () => loadOrCreateQaPaymentSecret({ dataApiUrl: "http://localhost:8080", directory }),
    /Neon de homologação inválido/,
  );
  assert.equal(readdirSync(directory).length, 0);
}));
