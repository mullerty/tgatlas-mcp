// Tools take a @handle rather than a numeric id: what an agent has in hand is
// a t.me link, not an internal identifier. Resolution happens inside.

const CHANNEL = {
  channel: {
    type: 'string',
    description: 'Public channel: @handle, bare handle, or a t.me link. Private channels are not readable.',
  },
  format: {
    type: 'string',
    enum: ['markdown', 'json'],
    description: 'Output shape. "markdown" is compact prose for a model to read; "json" is the raw API response. Default "markdown".',
  },
};

const ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: false };

export const TOOLS = [
  {
    name: 'telegram_channel',
    title: 'Telegram channel profile',
    description:
      'Look up a public Telegram channel: title, description, exact subscriber count, creation date, ' +
      "verification and scam flags, and how often it posts. Use to check whether a channel is real, " +
      'how large it is, and whether it is still alive — a channel with 200k subscribers and nothing ' +
      'published this year is a common and invisible failure.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CHANNEL,
        cadence: { type: 'boolean', description: 'Include posting rate and date of the last post. Costs one extra API call. Default true.' },
      },
      required: ['channel'],
      additionalProperties: false,
    },
    annotations: ANNOTATIONS,
  },
  {
    name: 'telegram_similar_channels',
    title: 'Channels Telegram considers similar',
    description:
      "Return the channels Telegram itself recommends alongside a given channel — its own topical " +
      'judgement, not a keyword match, so it surfaces channels that share an audience without sharing ' +
      'vocabulary. The way to discover channels whose names you do not already know: start from one you ' +
      'do and walk outward. Large channels return roughly a dozen; small or very new ones return none.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CHANNEL,
        enrich: { type: 'boolean', description: 'Fetch each result’s exact subscriber count. Costs one API call per result. Default false.' },
      },
      required: ['channel'],
      additionalProperties: false,
    },
    annotations: ANNOTATIONS,
  },
  {
    name: 'telegram_search_channels',
    title: 'Search public Telegram channels',
    description:
      "Telegram's own global search over public channels and groups, by title and handle. Good for " +
      'seeding a topic; telegram_similar_channels is what expands a seed into a neighbourhood. ' +
      'Short topical words work better than sentences.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 100, description: 'Keyword to search for.' },
        format: CHANNEL.format,
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: ANNOTATIONS,
  },
  {
    name: 'telegram_channel_posts',
    title: 'Recent posts of a public channel',
    description:
      'Read the recent posts of a public Telegram channel: date, text, views and a t.me link per ' +
      'post. Reads through the gateway, so no Telegram account is involved and bulk reading carries ' +
      'no account risk. Returns whatever page the gateway serves — for a full archive or for search ' +
      'inside a channel, use an MTProto server instead.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CHANNEL,
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'How many of the most recent posts to return. Default 20.' },
      },
      required: ['channel'],
      additionalProperties: false,
    },
    annotations: ANNOTATIONS,
  },
];
