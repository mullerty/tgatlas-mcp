# Security Policy

## Reporting a vulnerability

If you find a security problem in this MCP server, the tgAtlas API behind it, or tgatlas.org, email
**starnikovoleg@gmail.com**. The same contact is published in
[security.txt](https://tgatlas.org/.well-known/security.txt).

Please include what you found, the version of `tgatlas-mcp` you used, and the steps to reproduce it.
We will confirm that we received your report, keep you updated while we work on it, and credit you
if you want the credit.

Please do not open a public issue for a vulnerability before it is fixed. Do not run automated scans
that degrade the service for other subscribers, and do not access or modify data that is not yours.

## Supported versions

Fixes go into the latest published version of
[`tgatlas-mcp` on npm](https://www.npmjs.com/package/tgatlas-mcp) (currently the 0.1.x line).

## Scope

- This repository: the stdio MCP server published as `tgatlas-mcp`.
- The tgAtlas API it calls and the tgatlas.org site ([disclosure policy](https://tgatlas.org/security)).

Your `TELEGRAM_API_KEY` stays on your machine. The server sends it only over HTTPS, as the
`x-rapidapi-key` header, to the RapidAPI gateway of the tgAtlas API: `telegram155.p.rapidapi.com`,
or the host you set in `TELEGRAM_API_HOST`.
