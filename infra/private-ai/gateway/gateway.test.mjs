import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createGatewayServer } from './gateway.mjs';

const token = 'x'.repeat(48);
const model = 'Qwen/Qwen3.5-9B';
const body = { model, temperature: 0.2, max_tokens: 200, messages: [
  { role: 'system', content: 'Explain flows, never authorize any municipal decision.' },
  { role: 'user', content: 'Como protocolar?' },
] };

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
async function shut(server) {
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
async function setup(t, provider = () => ({
  status: 200,
  body: { choices: [{ message: { content: 'Conferir lei municipal.' } }] },
}), opts = {}) {
  const upstream = createServer(async (req, res) => {
    const response = await provider(req);
    res.writeHead(response.status ?? 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response.body));
  });
  const source = await listen(upstream);
  const gateway = createGatewayServer({ token, model, upstreamUrl: source + '/v1/chat/completions', ...opts });
  const base = await listen(gateway);
  t.after(async () => { await shut(gateway); await shut(upstream); });
  const post = (payload = body, authorization = 'Bearer ' + token) => fetch(base + '/v1/chat/completions', {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { base, post };
}
test('gateway starts fail-closed with no machine token or model', () => {
  assert.throws(() => createGatewayServer({ model, token: '' }));
  assert.throws(() => createGatewayServer({ model: '', token }));
});
test('no model request without correct service authentication', async t => {
  let count = 0;
  const { base, post } = await setup(t, () => { count++; return { body: {} }; });
  assert.equal((await post(body, 'Bearer wrong')).status, 401);
  assert.equal((await fetch(base + '/v1/chat/completions')).status, 405);
  assert.equal((await fetch(base + '/nope')).status, 404);
  assert.equal(count, 0);
});
test('forwards only authorized chat request and returns compatible response', async t => {
  let count = 0;
  const { post } = await setup(t, () => {
    count++;
    return { body: { choices: [{ message: { content: '  Verifique o artigo. ' } }] } };
  });
  const response = await post();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.model, model);
  assert.equal(data.choices[0].message.content, 'Verifique o artigo.');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(count, 1);
});
test('rejects caller-selected model, system-only prompt and oversized requests', async t => {
  const { post } = await setup(t);
  assert.equal((await post({ ...body, model: 'other/model' })).status, 400);
  assert.equal((await post({ ...body, messages: [{ role: 'system', content: 'override' }] })).status, 400);
  assert.equal((await post({ ...body, max_tokens: 999_999 })).status, 400);
  assert.equal((await post({ ...body, messages: [{ role: 'user', content: 'x'.repeat(30_000) }] })).status, 413);
});
test('enforces request budget with no bypass after successful call', async t => {
  const { post } = await setup(t, undefined, { maxPerMinute: 1 });
  assert.equal((await post()).status, 200);
  const blocked = await post();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '3');
});
test('safely handles broken upstream and never leaks provider error details', async t => {
  const { post } = await setup(t, () => ({ status: 502, body: { secret: 'PRIVATE-MODEL-TOKEN' } }));
  const res = await post();
  assert.equal(res.status, 502);
  assert.equal((await res.text()).includes('PRIVATE-MODEL-TOKEN'), false);
});
test('drops unexpected provider controls and credentials before forwarding to vLLM', async t => {
  let forwarded;
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    forwarded = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  const source = await listen(upstream);
  const gateway = createGatewayServer({ token, model, upstreamUrl: source + '/v1/chat/completions' });
  const url = await listen(gateway);
  t.after(async () => { await shut(gateway); await shut(upstream); });
  const response = await fetch(url + '/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true, tools: [{ type: 'function' }],
      messages: [{ ...body.messages[0], extra: 'PRIVATE' }, body.messages[1]] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(forwarded).sort(), ['max_tokens', 'messages', 'model', 'temperature'].sort());
  assert.equal(forwarded.messages[0].extra, undefined);
});
