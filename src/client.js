import { BASE, HOST, API_KEY, TIMEOUT_MS, assertKey } from './config.js';

// Carries error.code so callers branch on a code rather than on prose.
export class GatewayError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.status = status;
  }
}

async function call(path, params = {}) {
  assertKey();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': API_KEY, accept: 'application/json' },
      signal: ctl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new GatewayError('client_timeout', `No response in ${TIMEOUT_MS} ms`, 0);
    }
    throw new GatewayError('client_unreachable', e.message, 0);
  } finally {
    clearTimeout(timer);
  }

  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new GatewayError('client_unparseable', `Non-JSON response (HTTP ${res.status})`, res.status);
  }

  if (!res.ok) {
    // A 429 carries Retry-After, which is more use to an agent than the message.
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? `${ra}s` : 'a minute';
      throw new GatewayError('rate_limited', `Plan rate limit reached — retry in ${wait}`, 429);
    }
    const err = parsed?.error ?? {};
    throw new GatewayError(err.code || 'unknown_error', err.message || `HTTP ${res.status}`, res.status);
  }
  return parsed;
}

export const resolveUsername = (u) => call(`/usernames/${encodeURIComponent(u)}`);
export const fullChannel = (id) => call(`/channels/${encodeURIComponent(id)}`);
export const recommendations = (id) => call('/channels/recommendations', { peer_id: id });
export const searchChannels = (q) => call('/contacts/search', { q });
export const history = (id) => call(`/peers/${encodeURIComponent(id)}/history`);

/** @handle or a t.me link -> a bare handle. */
export const handleOf = (s) =>
  String(s || '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');

/** Handle -> numeric id. Every id-keyed endpoint starts here. */
export async function idOf(handle) {
  const raw = await resolveUsername(handleOf(handle));
  const chat = raw?.chats?.[0];
  if (!chat?.id) throw new GatewayError('not_found', `No public channel @${handleOf(handle)}`, 404);
  return chat;
}
