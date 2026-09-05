# channelindex-mcp

MCP server for public Telegram channels. Gives an agent a channel's real
profile — subscribers, description, creation date, verification and scam
flags, how often it posts — and the channels Telegram itself considers
similar to it.

No phone number, no session file, no MTProto client to keep alive. An API
key and a Node runtime.

## Install

```bash
npx channelindex-mcp
```

Claude Desktop / Claude Code / any MCP client:

```json
{
  "mcpServers": {
    "channelindex": {
      "command": "npx",
      "args": ["-y", "channelindex-mcp"],
      "env": { "TELEGRAM_API_KEY": "your-rapidapi-key" }
    }
  }
}
```

Get a key at [rapidapi.com/starnikovoleg/api/telegram155](https://rapidapi.com/starnikovoleg/api/telegram155).
There is a free tier and no card.

## Tools

### `telegram_channel`

A channel's profile: title, description, exact subscriber count, creation
date, Telegram's own verification and scam flags, and posting cadence.

The cadence is the part most directories leave out, and it is usually the
answer to the question being asked. A channel with 200,000 subscribers and
nothing published in fourteen months looks identical to a live one in every
listing that reports only follower counts.

```
@durov — Du rov's Channel
Subscribers   1,400,000
Created       2017-02-15
Last post     2026-08-29
Posting rate  0.4 posts/day over the last 30
```

### `telegram_similar_channels`

The channels Telegram recommends alongside a given one — its own topical
judgement rather than a keyword match, so it returns channels that share an
audience without sharing vocabulary.

This is how you find channels whose names you do not already know: start
from one you do and walk outward. Two rounds of expansion from a few dozen
seeds reaches several thousand channels.

Set `enrich: true` to fetch exact subscriber counts for each result.

### `telegram_search_channels`

Telegram's global search over public channels and groups. Use it to find a
starting point; use `telegram_similar_channels` to expand it.

## Output

Markdown by default — what a model reads without a parsing step. Pass
`format: "json"` for the raw API response when you are piping into code.

## Scope

Public channel metadata only. Message contents, member lists, and private
groups are outside what this reads and outside what it will return.

## Cost

Tools call the REST endpoints directly rather than proxying a remote MCP
endpoint. RapidAPI bills per request, so this arrangement means `initialize`
and `tools/list` are free: you pay for lookups, not handshakes.

`telegram_channel` costs three calls with cadence on, two with
`cadence: false`. `telegram_similar_channels` costs two, plus one per result
when `enrich: true` (capped at 12).

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `TELEGRAM_API_KEY` | — | RapidAPI key. `RAPIDAPI_KEY` also works. |
| `TELEGRAM_API_HOST` | `telegram155.p.rapidapi.com` | Upstream host. |
| `TELEGRAM_TIMEOUT_MS` | `30000` | Per-request timeout. |

## Related

[ChannelIndex](https://channelindex.org) publishes a weekly measured corpus
built on the same API: channel directories by topic, the recommendation
graph inverted into "who recommends this channel", and how those numbers
move week to week.

MIT.
