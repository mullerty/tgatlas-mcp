// Drives the server as a real MCP client would: writes to stdin, reads stdout.
// Live calls run only when a key is present.
import { spawn } from 'node:child_process';
import { handleOf } from '../src/client.js';
import { cadence, channelLine } from '../src/markdown.js';

let failed = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
};

// --- pure functions, no network -------------------------------------------

check('handleOf strips @', handleOf('@durov') === 'durov');
check('handleOf strips a t.me link', handleOf('https://t.me/durov') === 'durov');
check('handleOf strips a trailing path', handleOf('t.me/durov/123') === 'durov');
check('handleOf returns empty on junk', handleOf('   ') === '');

const day = 86400;
const now = Math.floor(Date.now() / 1000);
const pace = cadence([{ date: now }, { date: now - day }, { date: now - 2 * day }]);
check('cadence computes the rate', pace.perDay === 1.5, `${pace.perDay} posts/day`);
check('cadence knows the last post date', pace.lastPost === new Date(now * 1000).toISOString().slice(0, 10));
check('cadence does not divide by zero on one message', cadence([{ date: now }]).perDay === null);
check('cadence survives empty history', cadence([]).posts === 0);

const flagged = channelLine({ username: 'x', title: 'X', participants_count: 1000, scam: true });
check('the scam flag shows in the row', flagged.includes('scam'));
check('subscriber counts are formatted', channelLine({ username: 'x', title: 'X', participants_count: 12345 }).includes('12,345'));

// --- protocol -------------------------------------------------------------

const child = spawn(process.execPath, ['src/index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let buf = '';

child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const raw = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!raw) continue;
    const msg = JSON.parse(raw);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  }
});

let seq = 0;
const rpc = (method, params) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
check('initialize responds', init.result?.serverInfo?.name === 'tgatlas');
check('declares capabilities.tools', !!init.result?.capabilities?.tools);

const old = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
check('an older protocol version is mirrored back', old.result?.protocolVersion === '2024-11-05');

child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await rpc('tools/list');
const names = (list.result?.tools ?? []).map((t) => t.name);
check('tools/list returns three tools', names.length === 3, names.join(', '));
check('schemas are closed', list.result.tools.every((t) => t.inputSchema.additionalProperties === false));
check('every tool is marked read-only', list.result.tools.every((t) => t.annotations?.readOnlyHint === true));

const empty = await rpc('tools/call', { name: 'telegram_channel', arguments: { channel: '' } });
check('an empty channel is a tool error', empty.result?.isError === true, empty.result?.content?.[0]?.text);

const junk = await rpc('tools/call', { name: 'telegram_channel', arguments: { channel: '@' } });
check('an invalid handle is a tool error', junk.result?.isError === true, junk.result?.content?.[0]?.text);

const nosuch = await rpc('tools/call', { name: 'telegram_nope', arguments: {} });
check('an unknown tool sets isError', nosuch.result?.isError === true);

const unknown = await rpc('nonexistent/method');
check('an unknown method returns -32601', unknown.error?.code === -32601);

const pong = await rpc('ping');
check('ping', JSON.stringify(pong.result) === '{}');

// --- live calls -----------------------------------------------------------

if (process.env.TELEGRAM_API_KEY || process.env.RAPIDAPI_KEY) {
  const md = await rpc('tools/call', { name: 'telegram_channel', arguments: { channel: '@durov' } });
  const body = md.result?.content?.[0]?.text ?? '';
  check('live profile, markdown', md.result?.isError === false && body.startsWith('# @durov'), body.slice(0, 120));
  check('the profile carries subscribers', /Subscribers/.test(body));

  const sim = await rpc('tools/call', { name: 'telegram_similar_channels', arguments: { channel: 'durov', format: 'json' } });
  const parsed = JSON.parse(sim.result.content[0].text);
  check('recommendations return a list', Array.isArray(parsed.chats), `${parsed.chats?.length} channels`);
} else {
  console.log('  — live calls skipped: no TELEGRAM_API_KEY');
}

child.kill();
console.log(failed ? `\n${failed} checks failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
