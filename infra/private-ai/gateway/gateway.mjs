import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_BODY_BYTES = 24_576;
const MAX_RESPONSE_BYTES = 65_536;
const MAX_MESSAGES = 9;
const MAX_OUTPUT_TOKENS = 550;

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(data));
}
function validToken(value, expected) {
  const match = /^Bearer ([^\s]+)$/.exec(String(value || ''));
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  const stored = Buffer.from(expected);
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}
function validBody(input, model) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.model !== model ||
    !Array.isArray(input.messages) || input.messages.length < 2 ||
    input.messages.length > MAX_MESSAGES || !Number.isInteger(input.max_tokens) ||
    input.max_tokens < 1 || input.max_tokens > MAX_OUTPUT_TOKENS ||
    typeof input.temperature !== 'number' || input.temperature < 0 || input.temperature > 1) return false;
  if (input.messages[0]?.role !== 'system') return false;
  if (input.messages.at(-1)?.role !== 'user') return false;
  return input.messages.every((message, index) =>
    message && typeof message === 'object' && !Array.isArray(message) &&
    ((index === 0 && message.role === 'system') || (index > 0 && ['user', 'assistant'].includes(message.role))) &&
    typeof message.content === 'string' && message.content.trim().length > 0 &&
    message.content.length <= (index === 0 ? 2000 : 1600),
  );
}
async function readBody(req) {
  const claimed = Number(req.headers['content-length']);
  if (Number.isFinite(claimed) && claimed > MAX_BODY_BYTES) throw new Error('TOO_LARGE');
  let bytes = 0;
  const parts = [];
  for await (const part of req) {
    bytes += part.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('TOO_LARGE');
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new Error('INVALID_JSON'); }
}
async function boundedResponse(response) {
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > MAX_RESPONSE_BYTES) throw new Error('UPSTREAM_TOO_LARGE');
  if (!response.body) throw new Error('EMPTY_UPSTREAM');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) throw new Error('UPSTREAM_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** In production the upstream is Docker-internal, never selected by clients. */
export function createGatewayServer({
  token, model, upstreamUrl = 'http://vllm:8000/v1/chat/completions',
  maxConcurrent = 2, maxPerMinute = 30, requestTimeoutMs = 18_000,
}) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 1024 ||
      !/^[\x21-\x7e]+$/.test(token)) throw new Error('Gateway service token missing or invalid');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model))
    throw new Error('Gateway model missing or invalid');
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 32 ||
    !Number.isInteger(maxPerMinute) || maxPerMinute < 1 || maxPerMinute > 10_000)
    throw new Error('Invalid limits');
  let active = 0;
  let windowStart = Date.now();
  let requests = 0;
  const server = createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET')
      return send(res, 200, { ok: true, service: 'sigapro-ai-gateway' });
    if (req.url !== '/v1/chat/completions') return send(res, 404, { error: 'Not found' });
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!validToken(req.headers.authorization, token)) return send(res, 401, { error: 'Unauthorized' });
    const now = Date.now();
    if (now - windowStart >= 60_000) { windowStart = now; requests = 0; }
    if (requests >= maxPerMinute || active >= maxConcurrent)
      return send(res, 429, { error: 'Capacity exceeded' }, { 'Retry-After': '3' });
    requests++;
    active++;
    try {
      let body;
      try { body = await readBody(req); }
      catch (error) {
        return send(res, error.message === 'TOO_LARGE' ? 413 : 400,
          { error: 'Invalid request' });
      }
      if (!validBody(body, model)) return send(res, 400, { error: 'Invalid request' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        // Never pass arbitrary provider flags, tools or file references.
        const safeBody = {
          model, temperature: body.temperature, max_tokens: body.max_tokens,
          messages: body.messages.map(({ role, content }) => ({ role, content })),
        };
        const response = await fetch(upstreamUrl, {
          method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(safeBody), signal: controller.signal,
        });
        if (!response.ok) return send(res, 502, { error: 'Model unavailable' });
        const data = await boundedResponse(response);
        const answer = data?.choices?.[0]?.message?.content;
        if (typeof answer !== 'string' || !answer.trim() || answer.length > 12_000)
          return send(res, 502, { error: 'Invalid model response' });
        return send(res, 200, {
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: answer.trim() }, finish_reason: 'stop' }],
        });
      } catch {
        return send(res, 504, { error: 'Model timeout or unavailable' });
      } finally { clearTimeout(timer); }
    } finally { active--; }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createGatewayServer({
    token: process.env.SIGAPRO_AI_GATEWAY_TOKEN,
    model: process.env.SIGAPRO_AI_MODEL,
  });
  server.listen(8080, '0.0.0.0');
}
