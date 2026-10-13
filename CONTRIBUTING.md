# Contributing

Thanks for helping make CutPro MCP better.

## How this repository works

This repository is published from CutPro's internal monorepo, so every release replaces its contents. Pull requests are welcome all the same: we review them here and carry the change over, crediting you.

The tools are not written by hand. Each one is generated from the [CutPro API](https://cut.pro/docs/api-reference) spec, so a missing parameter, a wrong description or a missing endpoint is fixed in the API, and the server picks it up within ten minutes. Open an issue for those.

## Run it locally

```bash
bun install
CUTPRO_API_KEY=<your-api-key> bun run dev          # stdio
MCP_TRANSPORT=http PORT=8787 bun run dev           # Streamable HTTP, key in X-Api-Key
bun x tsc --noEmit                                 # type check
bun run format                                     # Prettier
bun run build                                      # dist/
bun run src/index.ts readme                        # regenerate the README tool list
```

Generate an API key at [cut.pro/studio/me/api-keys](https://cut.pro/studio/me/api-keys). Any MCP client works for testing; the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is the quickest.

## Reporting bugs

Open an [issue](https://github.com/getcutpro/mcp/issues/new/choose) with the client you use, the tool name and the error `code` it returned. Never paste an API key or an OAuth token. Security problems go through [SECURITY.md](SECURITY.md), not public issues.
