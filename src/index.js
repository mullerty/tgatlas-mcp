#!/usr/bin/env node
// tgAtlas MCP server — stdio, JSON-RPC, no dependencies.
//
// Tools call the REST endpoints directly. The upstream bills per request, so
// MCP handshakes are free here: you pay for Telegram lookups and nothing for
// initialize or tools/list.

import { idOf, fullChannel, recommendations, searchChannels, history, handleOf, GatewayError } from './client.js';
import { renderChannel, renderList, renderPosts, cadence } from './markdown.js';
import { TOOLS } from './tools.js';
import { HOST } from './config.js';

const PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, '2025-03-26', '2024-11-05']);
const SERVER_INFO = { name: 'tgatlas', title: 'tgAtlas — public Telegram channels', version: '0.1.2' };

// Enriching with exact counts costs one call per channel. The cap keeps a
// single tools/call within a predictable price.
const ENRICH_LIMIT = 12;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const result = (id, r) => send({ jsonrpc: '2.0', id, result: r });
const failure = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const text = (s, isError = false) => ({ content: [{ type: 'text', text: s }], isError });

const asJson = (v) => JSON.stringify(v, null, 2);

async function toolChannel(args) {
  const chat = await idOf(args.channel);
  const raw = await fullChannel(chat.id);
  const merged = { ...chat, ...(raw?.chats?.[0] ?? {}) };
  const full = raw?.full_chat ?? {};

  let pace = null;
  if (args.cadence !== false) {
    // Cadence is a bonus, not the point of the answer: if history is
    // unavailable the profile still comes back.
    try {
      pace = cadence((await history(chat.id))?.messages ?? []);
    } catch {
      pace = null;
    }
  }

  if (args.format === 'json') return text(asJson({ chat: merged, full_chat: full, cadence: pace }));
  return text(renderChannel(merged, full, pace));
}

async function toolSimilar(args) {
  const chat = await idOf(args.channel);
  const raw = await recommendations(chat.id);
  let chats = raw?.chats ?? [];

  if (args.enrich && chats.length) {
    chats = await Promise.all(
      chats.slice(0, ENRICH_LIMIT).map(async (c) => {
        try {
          const f = await fullChannel(c.id);
          return { ...c, participants_count: f?.full_chat?.participants_count ?? c.participants_count };
        } catch {
          return c;
        }
      })
    );
  }

  if (args.format === 'json') return text(asJson({ source: chat.username || chat.id, count: raw?.count ?? chats.length, chats }));

  const note = chats.length
    ? `Telegram reports ${raw?.count ?? chats.length} similar channels for @${chat.username || chat.id}.`
    : 'Telegram computes these only for channels with enough audience overlap; small or new channels return an empty list.';
  return text(renderList(`Channels similar to @${chat.username || chat.id}`, chats, note));
}

async function toolSearch(args) {
  const raw = await searchChannels(args.query);
  const chats = raw?.chats ?? [];
  if (args.format === 'json') return text(asJson({ query: args.query, chats }));
  return text(renderList(`Public channels matching “${args.query}”`, chats));
}

async function toolPosts(args) {
  const chat = await idOf(args.channel);
  const raw = await history(chat.id);
  const all = raw?.messages ?? [];
  // The gateway decides the page size; the limit is a ceiling on what the
  // model reads, not a request for more than one page.
  const limit = Number.isInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 100) : 20;
  const messages = all.slice(0, limit);

  if (args.format === 'json') return text(asJson({ channel: chat.username || chat.id, returned: messages.length, available: all.length, messages }));

  const note = all.length > messages.length ? `Showing ${messages.length} of ${all.length} posts on this page.` : '';
  return text(renderPosts(chat, messages, note));
}

const HANDLERS = {
  telegram_channel: { run: toolChannel, requires: 'channel' },
  telegram_similar_channels: { run: toolSimilar, requires: 'channel' },
  telegram_search_channels: { run: toolSearch, requires: 'query' },
  telegram_channel_posts: { run: toolPosts, requires: 'channel' },
};

async function callTool(name, args = {}) {
  const h = HANDLERS[name];
  if (!h) return text(`Unknown tool: ${name}`, true);

  const given = args[h.requires];
  if (typeof given !== 'string' || !given.trim()) {
    return text(`argument_required: ${h.requires} must not be empty`, true);
  }
  if (h.requires === 'channel' && !handleOf(given)) {
    return text('argument_invalid: channel must be a @handle or a t.me link', true);
  }

  try {
    return await h.run(args);
  } catch (e) {
    if (e instanceof GatewayError) {
      const retry = ['rate_limited', 'client_timeout', 'client_unreachable', 'upstream_error'];
      const hint = retry.includes(e.code) ? ' (transient — retrying may help)' : '';
      return text(`${e.code}: ${e.message}${hint}`, true);
    }
    return text(String(e?.message ?? e), true);
  }
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return result(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.has(asked) ? asked : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          'Public Telegram channels. telegram_channel for a profile and whether it is still alive, ' +
          'telegram_similar_channels to discover neighbours Telegram itself groups together, ' +
          'telegram_search_channels to find a starting point, telegram_channel_posts to read what a \n          channel actually publishes.',
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: TOOLS });
    case 'tools/call':
      return result(id, await callTool(params?.name, params?.arguments));
    default:
      if (isNotification) return;
      return failure(id, -32601, `Method not found: ${method}`);
  }
}

// Newline framing. The tail stays in the buffer: one message can arrive in
// several chunks, and several can arrive in one.
let buffer = '';
let inFlight = 0;
let draining = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const raw = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!raw) continue;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      failure(null, -32700, 'Parse error');
      continue;
    }
    inFlight++;
    dispatch(msg)
      .catch((e) => {
        if (msg.id !== undefined && msg.id !== null) failure(msg.id, -32603, String(e?.message ?? e));
      })
      .finally(() => {
        inFlight--;
        if (draining && inFlight === 0) process.exit(0);
      });
  }
});

// A closed stdin is the end of input, not an order to drop work in progress:
// `echo … | node src/index.js` would otherwise be cut off mid-answer, and that
// is exactly how the server gets checked by hand. Exit once everything already
// accepted has been answered.
process.stdin.on('end', () => {
  draining = true;
  if (inFlight === 0) process.exit(0);
});
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

process.stderr.write(`tgatlas-mcp ${SERVER_INFO.version} → ${HOST}\n`);
