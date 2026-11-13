/**
 * Dedicated payment-encryption key for the isolated localhost:8081 Neon branch.
 * NEVER share with production, commit to Git or log the key material.
 * The key is persistent across QA restarts so saved test tokens remain readable.
 */
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function loadOrCreateQaPaymentSecret({
  dataApiUrl,
  directory = join(homedir(), ".sigapro", "isolated-qa-secrets"),
} = {}) {
  const endpoint = new URL(String(dataApiUrl || ""));
  if (endpoint.protocol !== "https:" || !endpoint.hostname.startsWith("ep-") ||
      !endpoint.hostname.includes(".apirest.")) {
    throw new Error("Neon de homologação inválido para gerar a chave local de pagamento.");
  }
  const id = createHash("sha256")
    .update(`${endpoint.host}${endpoint.pathname}`)
    .digest("hex")
    .slice(0, 20);
  // Always outside the repository and tied to the Neon QA branch identity.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `payment-${id}.key`);

  function readExisting() {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("Arquivo de chave QA inseguro. Não foi substituído.");
    }
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
      throw new Error("Permissões da chave QA muito abertas. Corrija para acesso exclusivo do usuário.");
    }
    const secret = readFileSync(file, "utf8").trim();
    if (!/^[0-9a-f]{96}$/.test(secret)) {
      throw new Error("A chave QA existente é inválida. Não foi recriada, para preservar as credenciais cifradas.");
    }
    return { secret, source: "existing" };
  }

  try {
    return readExisting();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const secret = randomBytes(48).toString("hex");
  try {
    writeFileSync(file, `${secret}\n`, { flag: "wx", mode: 0o600 });
    return { secret, source: "created" };
  } catch (error) {
    // Race-safe if two QA instances start together.
    if (error?.code === "EEXIST") return readExisting();
    throw error;
  }
}
