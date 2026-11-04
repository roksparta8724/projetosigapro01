import { isIP } from "node:net";

export type PrivateAiConfig = {
  endpoint: string;
  token: string;
  model: string;
};

/**
 * SIGAPRO only connects to an administrator-configured HTTPS gateway.
 * This URL is NEVER accepted from a browser request or tenant configuration.
 * IP addresses, loopback/private hostnames, redirects and URL credentials
 * are not permitted. The gateway itself must authenticate, rate-limit and
 * authorize traffic to its private model server.
 */
export function resolvePrivateAiConfig(input: {
  gatewayUrl: string;
  gatewayToken: string;
  model: string;
}): PrivateAiConfig | null {
  const token = input.gatewayToken.trim();
  const model = input.model.trim();
  if (token.length < 32 || token.length > 1024 || !/^[\x21-\x7e]+$/.test(token)) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model)) return null;
  try {
    const base = new URL(input.gatewayUrl.trim());
    const hostname = base.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (base.protocol !== "https:" || base.username || base.password ||
      base.search || base.hash || (base.pathname && base.pathname !== "/") ||
      (base.port && base.port !== "443")) return null;
    if (!hostname || isIP(hostname) || hostname === "localhost" ||
      hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
      hostname.endsWith(".internal") || hostname.endsWith(".test") ||
      hostname.endsWith(".example") || !hostname.includes(".")) return null;
    return {
      endpoint: base.origin + "/v1/chat/completions",
      token,
      model,
    };
  } catch { return null; }
}
