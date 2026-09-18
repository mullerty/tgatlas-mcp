// Markdown rendering — what an agent reads without parsing JSON.

const esc = (s) => String(s ?? '').replace(/([[\]])/g, '\\$1');
const line = (s) => (s ? [s] : []);

const num = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : null);
const day = (unix) => (Number.isFinite(unix) ? new Date(unix * 1000).toISOString().slice(0, 10) : null);

/** Telegram's own flags. Silence here is a signal too. */
function flags(chat) {
  const out = [];
  if (chat.verified) out.push('verified');
  if (chat.scam) out.push('**flagged as scam by Telegram**');
  if (chat.fake) out.push('**flagged as fake by Telegram**');
  if (chat.restricted) out.push('restricted in some regions');
  return out;
}

const kindOf = (chat) => (chat.broadcast ? 'channel' : chat.megagroup ? 'group' : 'peer');

/** One list row: @handle, title, subscribers, flags. */
export function channelLine(chat) {
  const subs = num(chat.participants_count);
  const meta = [subs && `${subs} subscribers`, ...flags(chat)].filter(Boolean).join(' · ');
  const head = `- **[@${esc(chat.username || chat.id)}](https://t.me/${chat.username || ''})** — ${esc(chat.title)}`;
  return meta ? `${head}\n  ${meta}` : head;
}

/** Posting rate from message timestamps. Only dates are read from history. */
export function cadence(messages = []) {
  const dates = messages.map((m) => m?.date).filter(Number.isFinite).sort((a, b) => b - a);
  if (dates.length < 2) return { posts: dates.length, perDay: null, lastPost: day(dates[0]) };
  const spanDays = Math.max(1, (dates[0] - dates[dates.length - 1]) / 86400);
  return { posts: dates.length, perDay: Number((dates.length / spanDays).toFixed(2)), lastPost: day(dates[0]) };
}

export function renderChannel(chat, full = {}, pace = null) {
  const out = [`# @${esc(chat.username || chat.id)} — ${esc(chat.title)}`, ''];
  out.push(...line(full.about));
  if (full.about) out.push('');

  const facts = [
    [`Type`, kindOf(chat)],
    [`Subscribers`, num(full.participants_count ?? chat.participants_count)],
    [`Created`, day(chat.date)],
    [`Telegram id`, chat.id],
  ];
  if (pace) {
    facts.push([`Last post`, pace.lastPost]);
    if (pace.perDay != null) facts.push([`Posting rate`, `${pace.perDay} posts/day over the last ${pace.posts}`]);
  }
  if (full.linked_chat_id) facts.push([`Discussion group`, `linked (id ${full.linked_chat_id})`]);

  out.push('| | |', '|---|---|');
  for (const [k, v] of facts) if (v != null && v !== '') out.push(`| ${k} | ${v} |`);

  const f = flags(chat);
  if (f.length) out.push('', `Flags: ${f.join(', ')}`);
  return out.join('\n');
}

export function renderList(heading, chats = [], note = '') {
  const out = [`# ${heading}`, ''];
  if (!chats.length) {
    out.push('_None returned._');
    if (note) out.push('', note);
    return out.join('\n');
  }
  for (const c of chats) if (c?.username || c?.id) out.push(channelLine(c));
  if (note) out.push('', note);
  return out.join('\n');
}

/**
 * Post bodies. Upstream reads history only for dates (see `cadence`); this
 * renders the text as well, which is the whole point of reading a channel
 * without an account. Field names are defensive: the gateway mirrors MTProto,
 * where the body lives in `message`, but a wrapper may call it `text`.
 */
export function renderPosts(chat, messages = [], note = '') {
  const handle = chat.username || chat.id;
  const out = [`# @${esc(handle)} — posts`, ''];
  if (!messages.length) {
    out.push('_No posts returned._', '', note || 'The channel may be empty, or history may be closed to non-members.');
    return out.join('\n');
  }
  for (const m of messages) {
    const body = String(m?.message ?? m?.text ?? '').trim();
    const stamp = day(m?.date) ?? '????-??-??';
    const meta = [
      Number.isFinite(m?.views) && `${num(m.views)} views`,
      Number.isFinite(m?.forwards) && `${num(m.forwards)} forwards`,
    ].filter(Boolean).join(' · ');
    const link = m?.id ? ` — [link](https://t.me/${chat.username || ''}/${m.id})` : '';
    out.push(`## ${stamp}${meta ? ` · ${meta}` : ''}${link}`);
    // A media-only post has no body; saying so beats an empty section.
    out.push(body || '_(no text — media or service message)_', '');
  }
  if (note) out.push(note);
  return out.join('\n');
}
