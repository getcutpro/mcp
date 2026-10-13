# Changelog

Every release of `@cutpro/mcp`. The tools themselves follow the [CutPro API](https://cut.pro/docs/api-reference) and change without a release: a new endpoint becomes a tool within ten minutes.

## 2.3.0 (2026-10-13)

- Local installs update themselves: when npm has a newer release, the server hands the session to it, even from a pinned version or a stale `npx` cache. `CUTPRO_MCP_AUTO_UPDATE=0` opts out and keeps the update notice.
- The README tool list is generated from the live API spec, on every release and once a day.
- Releases are cut by CI: npm with provenance, GitHub release with notes and the ChatGPT plugin bundle, and the MCP Registry.
- `package.json` holds the only version; the server and `server.json` read it from there.

## 2.2.0 (2026-10-13)

- Speaks MCP [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28): stateless requests, `server/discover`, cacheable `tools/list` and `resources/list`, `resultType` and server identity on every result. Clients on earlier revisions keep working on the same endpoint.
- Moves to the v2 TypeScript SDK (`@modelcontextprotocol/server`).
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) player: generations, personas, clips and renders open inline and follow a job until it is ready, with buttons to open it in CutPro, animate an image or schedule a post.
- Calls that charge credits ask the user to confirm the price first, on clients that support elicitation.

## 2.1.0 (2026-10-13)

- Image and video generation with any model (Veo, Kling, Seedance, Wan, Nano Banana, GPT Image and more): list models and prices, upload a reference image, generate, follow, download and delete.
- Generated and persona videos carry an `edit_id`, so they can be posted or scheduled right away.
- The server advertises the CutPro logo (`serverInfo.icons`, `server.json`, `/favicon.ico`).
- The Claude plugin and the ChatGPT app now feature personas, generation, scheduling, account connection and transcription.

## 2.0.1 (2026-10-02)

- Nullable fields of the API are valid JSON Schema for MCP clients.
- Tools declare an output schema taken from the endpoint's own responses.

## 2.0.0 (2026-10-02)

- Every tool is generated from the live API spec at runtime, one per endpoint and named after its `operationId`, so the server can no longer drift from the API.
- Hosted Streamable HTTP endpoint at `https://mcp.cut.pro` with OAuth: users sign in on cut.pro and pick a workspace, no API key needed.
- Tools that need a file from disk are listed only by the local server.
