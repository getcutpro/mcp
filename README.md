## CutPro MCP

[![npm version](https://img.shields.io/npm/v/@cutpro/mcp?style=flat-square&color=7C3AED)](https://www.npmjs.com/package/@cutpro/mcp)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.getcutpro%2Fcutpro-7C3AED?style=flat-square)](https://registry.modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-contact--8lma%2Fcutpro-7C3AED?style=flat-square)](https://smithery.ai/servers/contact-8lma/cutpro)

A Model Context Protocol (MCP) server that turns long videos into viral clips with AI. It exposes the full [CutPro API](https://cut.pro/docs/api-reference) as tools, so an LLM can run the whole flow: analyze a video, clip the best moments, render the final MP4, and publish to TikTok, Instagram and YouTube.

### Key features

- **Always in sync**. Every v1 endpoint is a tool, generated from the live API spec: workspace, balance, videos and uploads, clipping, clips, channel and live monitoring, templates, renders, transcriptions, posts and connections.
- **Runs everywhere**. stdio for local clients (Claude Code, Cursor, Claude Desktop, Windsurf, VS Code, Cline, Zed) and a hosted Streamable HTTP endpoint with OAuth for ChatGPT and Claude.ai.

## Getting started

### Requirements

- Node.js 18 or newer.
- A CutPro account on the **Pro** plan and an API key. Generate one at [cut.pro/studio/me/api-keys](https://cut.pro/studio/me/api-keys).
- An MCP-compatible client.

### Standard config

Most clients use the same JSON. Add your API key under `env`:

```json
{
  "mcpServers": {
    "cutpro": {
      "command": "npx",
      "args": ["-y", "@cutpro/mcp@latest"],
      "env": { "CUTPRO_API_KEY": "<your-api-key>" }
    }
  }
}
```

### Install

[<img src="https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522cutpro%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540cutpro%252Fmcp%2540latest%2522%255D%257D)
[<img src="https://img.shields.io/badge/Cursor-Install_Server-000000?style=flat-square&logo=cursor&logoColor=white" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=cutpro&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjdXRwcm8vbWNwQGxhdGVzdCJdfQ)
[<img src="https://img.shields.io/badge/LM_Studio-Install_Server-4A26C9?style=flat-square" alt="Install in LM Studio">](https://lmstudio.ai/install-mcp?name=cutpro&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjdXRwcm8vbWNwQGxhdGVzdCJdfQ)
[<img src="https://img.shields.io/badge/Goose-Install_Server-1A1A1A?style=flat-square" alt="Install in Goose">](goose://extension?cmd=npx&arg=-y&arg=%40cutpro%2Fmcp%40latest&id=cutpro&name=CutPro&description=AI%20video%20clipping%20via%20the%20CutPro%20API)

After installing via a button, add your `CUTPRO_API_KEY` to the server's `env`.

<details>
<summary>Claude Code</summary>

```bash
claude mcp add cutpro --env CUTPRO_API_KEY=<your-api-key> -- npx -y @cutpro/mcp@latest
```
</details>

<details>
<summary>Claude Desktop</summary>

Add to `claude_desktop_config.json` (Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "cutpro": {
      "command": "npx",
      "args": ["-y", "@cutpro/mcp@latest"],
      "env": { "CUTPRO_API_KEY": "<your-api-key>" }
    }
  }
}
```
</details>

<details>
<summary>Cursor / Windsurf / VS Code (manual)</summary>

Add the standard config above to the client's MCP settings (`mcp.json` / `mcpServers`).
</details>

<details>
<summary>Cline</summary>

Open the MCP Servers panel, choose Configure, and add the standard config above.
</details>

<details>
<summary>Gemini CLI</summary>

```bash
gemini mcp add cutpro npx -y @cutpro/mcp@latest -e CUTPRO_API_KEY=<your-api-key>
```
</details>

<details>
<summary>Codex</summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.cutpro]
command = "npx"
args = ["-y", "@cutpro/mcp@latest"]
env = { "CUTPRO_API_KEY" = "<your-api-key>" }
```
</details>

<details>
<summary>ChatGPT and Claude.ai (hosted, no install)</summary>

Use the hosted server. Add a custom connector pointing to:

```
https://mcp.cut.pro
```

You sign in to cut.pro, pick the workspace and approve the connection, so no API key and no local setup are needed. Any CutPro plan can connect; jobs use the workspace's credits. Disconnect at any time in Settings, under Connected apps.
</details>

<details>
<summary>Claude Code plugin</summary>

The plugin bundles the hosted server with a skill that teaches Claude the CutPro workflows:

```bash
claude plugin marketplace add getcutpro/mcp
claude plugin install cutpro@cutpro
```
</details>

## Configuration

The server is configured with environment variables.

| Variable | Description | Required |
| --- | --- | --- |
| `CUTPRO_API_KEY` | Your CutPro API key. | Yes (stdio) |
| `CUTPRO_WORKSPACE_ID` | Selects the workspace for multi-workspace keys. | No |
| `CUTPRO_API_URL` | Override the API base URL. Defaults to `https://api.cut.pro/api/v1`. | No |

<details>
<summary>Self-hosting the remote (Streamable HTTP + OAuth)</summary>

| Variable | Description |
| --- | --- |
| `MCP_TRANSPORT=http` / `PORT` | Serve Streamable HTTP at the root instead of stdio. |
| `MCP_OAUTH=1` | Enable the full OAuth 2.1 layer (discovery, DCR, PKCE) for browser clients. |
| `MCP_PUBLIC_URL` | Public endpoint, e.g. `https://mcp.cut.pro`. Its origin becomes the OAuth issuer. |
| `MCP_REDIS_URL` | Back OAuth state with Redis so it survives restarts and scales across instances. |
| `CUTPRO_APP_URL` | Where the consent screen lives. Defaults to `https://cut.pro`. |
| `OPENAI_APPS_CHALLENGE` | Domain verification token from the OpenAI plugin portal, served at `/.well-known/openai-apps-challenge`. |

```bash
MCP_TRANSPORT=http PORT=8787 MCP_OAUTH=1 \
MCP_PUBLIC_URL=https://mcp.cut.pro MCP_REDIS_URL=redis://127.0.0.1:6379 \
npx -y @cutpro/mcp@latest
```

In OAuth mode the user signs in on cut.pro and approves the app there; cut.pro creates a key for that app and workspace, and the access token maps server side to it. Clients can register dynamically (DCR) or present a Client ID Metadata Document (CIMD). Without `MCP_REDIS_URL`, an in-memory store is used (single instance, state lost on restart).
</details>

## Tools

The tools are built from the API's own OpenAPI spec (`/api/v1/openapi.json`), so they always match the [API reference](https://cut.pro/docs/api-reference): one tool per endpoint, named after its `operationId` in snake case (`analyzeVideo` is `analyze_video`, `createSubmission` is `create_submission`), with the endpoint's own parameters, descriptions and responses. A new endpoint becomes a tool within ten minutes of reaching the API, with no new release of this package.

The usual flow: `analyze_video`, `create_submission`, `get_submission` until it completes, `list_clips`, `render_clip`, `get_render` and `download_render`.

Annotations come from the spec too: `GET` is read-only, `PUT`, `PATCH` and `DELETE` are destructive, and a route declares more in its `x-mcp` extension (spending credits, publishing to a social network, reaching an arbitrary public URL). Routes that need a file uploaded from disk are listed only by the local (stdio) server, since a chat client cannot send bytes.

## Links

- Docs: [cut.pro/docs/api-reference/mcp](https://cut.pro/docs/api-reference/mcp)
- npm: [@cutpro/mcp](https://www.npmjs.com/package/@cutpro/mcp)
- MCP Registry: `io.github.getcutpro/cutpro`

## License

MIT
