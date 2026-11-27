/**
 * Server-side Cloudflare Workers AI configuration.
 * Only direct, account-scoped Cloudflare REST Chat Completions is supported.
 * This never uses a tenant-selected URL or dynamically selected paid model.
 */
export const CLOUDFLARE_FREE_MODELS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/meta/llama-3.1-8b-instruct",
] as const;
export const CLOUDFLARE_DEFAULT_MODEL = CLOUDFLARE_FREE_MODELS[0];

export type CloudflareAiConfig = {
  endpoint: string;
  token: string;
  model: typeof CLOUDFLARE_FREE_MODELS[number];
};

export function resolveCloudflareAiConfig(input: {
  accountId: string;
  token: string;
  model?: string;
}): CloudflareAiConfig | null {
  const accountId = input.accountId.trim();
  const token = input.token.trim();
  const model = input.model?.trim() || CLOUDFLARE_DEFAULT_MODEL;
  if (!/^[0-9a-f]{32}$/i.test(accountId)) return null;
  if (token.length < 20 || token.length > 512 || !/^[\x21-\x7e]+$/.test(token)) return null;
  if (!CLOUDFLARE_FREE_MODELS.some((candidate) => candidate === model)) return null;
  return {
    endpoint: "https://api.cloudflare.com/client/v4/accounts/" + accountId +
      "/ai/v1/chat/completions",
    token,
    model: model as CloudflareAiConfig["model"],
  };
}
