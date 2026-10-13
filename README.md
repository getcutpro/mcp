## CutPro MCP

[![npm version](https://img.shields.io/npm/v/@cutpro/mcp?style=flat-square&color=7C3AED)](https://www.npmjs.com/package/@cutpro/mcp)
[![npm downloads](https://img.shields.io/npm/dm/@cutpro/mcp?style=flat-square&color=7C3AED)](https://www.npmjs.com/package/@cutpro/mcp)
[![CI](https://img.shields.io/github/actions/workflow/status/getcutpro/mcp/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/getcutpro/mcp/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/getcutpro/mcp?style=flat-square&color=7C3AED)](https://github.com/getcutpro/mcp/releases)
[![MCP 2026-07-28](https://img.shields.io/badge/MCP-2026--07--28-7C3AED?style=flat-square)](https://modelcontextprotocol.io/specification/2026-07-28)
[![License: MIT](https://img.shields.io/badge/license-MIT-7C3AED?style=flat-square)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.getcutpro%2Fcutpro-7C3AED?style=flat-square)](https://registry.modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-contact--8lma%2Fcutpro-7C3AED?style=flat-square)](https://smithery.ai/servers/contact-8lma/cutpro)

A Model Context Protocol (MCP) server for AI images, videos, personas and clips. It exposes the full [CutPro API](https://cut.pro/docs/api-reference) as tools, so an LLM can:

- **Generate images and videos with any top model**: Veo, Kling, Seedance, Wan, MiniMax, Nano Banana, GPT Image, Seedream and more, from a prompt or from reference images, with each model's live price.
- **Create AI personas**: realistic people that stay consistent across photos and videos, then swap them into any video while scene, camera, motion and sound stay.
- **Clip long videos and live streams**: find the best moments and render the final MP4.
- **Post and schedule**: publish any clip, generated video or persona video to TikTok, Instagram, YouTube, Facebook, Threads, LinkedIn, Pinterest and Bluesky, now or at a set time.
- **Transcribe**: any audio or video into timed captions (SRT, VTT, text or JSON).

### Key features

- **Always in sync**. Every v1 endpoint is a tool, generated from the live API spec: image and video generation, personas, workspace, balance, videos and uploads, clipping, clips, channel and live monitoring, templates, renders, transcriptions, posts and connections.
- **Runs everywhere**. stdio for local clients (Claude Code, Cursor, Claude Desktop, Windsurf, VS Code, Cline, Zed) and a hosted Streamable HTTP endpoint with OAuth for ChatGPT and Claude.ai.
- **Latest protocol**. Speaks MCP [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) (stateless, `server/discover`, cacheable lists, multi round-trip requests) and every earlier revision, on the same endpoint.
- **Results you can watch**. Clients that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) show generated images and videos, personas, clips and renders as an inline player that follows a job until it is ready, with buttons to open it in CutPro, animate an image or schedule a post.
- **Asks before it spends**. On clients that support elicitation, every call that charges credits shows the price and waits for the user's confirmation before anything is charged.

## Getting started

### Requirements

- Node.js 18 or newer.
- A CutPro account (any plan) and an API key. Generate one at [cut.pro/studio/me/api-keys](https://cut.pro/studio/me/api-keys).
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

## Updates

Every install stays current on its own:

- **Hosted** (`https://mcp.cut.pro`, the Claude plugin and the ChatGPT app): always the latest release, nothing to do.
- **Local** (`npx -y @cutpro/mcp@latest`): on start the server checks npm and, when a newer release exists, hands the session to it. This works even for a pinned version or a stale `npx` cache. Set `CUTPRO_MCP_AUTO_UPDATE=0` to stay on the installed version; the server then tells the model an update is available.
- **Tools**: new API endpoints show up as tools within ten minutes, without any release.

Every release is listed with its notes in [Releases](https://github.com/getcutpro/mcp/releases) and [CHANGELOG.md](CHANGELOG.md).

## Configuration

The server is configured with environment variables.

| Variable                 | Description                                                                 | Required    |
| ------------------------ | --------------------------------------------------------------------------- | ----------- |
| `CUTPRO_API_KEY`         | Your CutPro API key.                                                        | Yes (stdio) |
| `CUTPRO_WORKSPACE_ID`    | Selects the workspace for multi-workspace keys.                             | No          |
| `CUTPRO_API_URL`         | Override the API base URL. Defaults to `https://api.cut.pro/api/v1`.        | No          |
| `CUTPRO_MCP_AUTO_UPDATE` | `0` keeps the installed version instead of switching to the newest release. | No          |

<details>
<summary>Self-hosting the remote (Streamable HTTP + OAuth)</summary>

| Variable                      | Description                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `MCP_TRANSPORT=http` / `PORT` | Serve Streamable HTTP at the root instead of stdio.                                                      |
| `MCP_OAUTH=1`                 | Enable the full OAuth 2.1 layer (discovery, DCR, PKCE) for browser clients.                              |
| `MCP_PUBLIC_URL`              | Public endpoint, e.g. `https://mcp.cut.pro`. Its origin becomes the OAuth issuer.                        |
| `MCP_REDIS_URL`               | Back OAuth state with Redis so it survives restarts and scales across instances.                         |
| `CUTPRO_APP_URL`              | Where the consent screen lives. Defaults to `https://cut.pro`.                                           |
| `OPENAI_APPS_CHALLENGE`       | Domain verification token from the OpenAI plugin portal, served at `/.well-known/openai-apps-challenge`. |

```bash
MCP_TRANSPORT=http PORT=8787 MCP_OAUTH=1 \
MCP_PUBLIC_URL=https://mcp.cut.pro MCP_REDIS_URL=redis://127.0.0.1:6379 \
npx -y @cutpro/mcp@latest
```

In OAuth mode the user signs in on cut.pro and approves the app there; cut.pro creates a key for that app and workspace, and the access token maps server side to it. Clients can register dynamically (DCR) or present a Client ID Metadata Document (CIMD). Without `MCP_REDIS_URL`, an in-memory store is used (single instance, state lost on restart).
</details>

## Tools

The tools are built from the API's own OpenAPI spec (`/api/v1/openapi.json`), so they always match the [API reference](https://cut.pro/docs/api-reference): one tool per endpoint, named after its `operationId` in snake case (`analyzeVideo` is `analyze_video`, `createSubmission` is `create_submission`), with the endpoint's own parameters, descriptions and responses. A new endpoint becomes a tool within ten minutes of reaching the API, with no new release of this package.

The usual flows:

- **Image or video**: `list_generation_models`, `create_generation` with the agreed price, `get_generation` until it is ready. Pass a ready image's `output.image_id` to animate it.
- **Persona**: `get_persona_catalog`, `create_persona`, `get_persona` until its photo is ready, `save_persona`, then `quote_persona_swap` and `create_persona_video` to put it in a video.
- **Clips**: `analyze_video`, `create_submission`, `get_submission` until it completes, `list_clips`, `render_clip`, `get_render` and `download_render`.

Annotations come from the spec too: `GET` is read-only, `PUT`, `PATCH` and `DELETE` are destructive, and a route declares more in its `x-mcp` extension (spending credits, publishing to a social network, reaching an arbitrary public URL). Routes that need a file uploaded from disk are listed only by the local (stdio) server, since a chat client cannot send bytes.

### All tools

<!-- tools:start -->

89 tools, generated from the live API spec.

#### Workspace

| Tool            | What it does          | Notes |
| --------------- | --------------------- | ----- |
| `get_workspace` | Get current workspace |       |

#### Balance

| Tool                  | What it does       | Notes |
| --------------------- | ------------------ | ----- |
| `get_balance`         | Get balance        |       |
| `get_balance_history` | Get credit history |       |

#### Videos

| Tool                              | What it does                | Notes             |
| --------------------------------- | --------------------------- | ----------------- |
| `create_video_upload`             | Start an upload             | local server only |
| `complete_video_multipart_upload` | Finalize a multipart upload | local server only |
| `abort_video_multipart_upload`    | Discard a multipart upload  | local server only |
| `complete_video_upload`           | Complete an upload          | local server only |
| `list_videos`                     | List videos                 |                   |
| `delete_video`                    | Delete a video              |                   |

#### Submissions

| Tool                | What it does                | Notes |
| ------------------- | --------------------------- | ----- |
| `create_submission` | Submit a video for clipping |       |
| `analyze_video`     | Analyze a video             |       |
| `list_submissions`  | List submissions            |       |
| `get_submission`    | Get submission              |       |
| `delete_submission` | Delete submission           |       |
| `retry_submission`  | Retry a failed submission   |       |

#### Clips

| Tool                      | What it does               | Notes                   |
| ------------------------- | -------------------------- | ----------------------- |
| `apply_template`          | Apply template to clips    |                         |
| `list_clips`              | List generated clips       | opens the CutPro player |
| `delete_clip`             | Delete a clip              |                         |
| `download_clip_subtitles` | Download a clip's captions |                         |

#### Renders

| Tool                    | What it does              | Notes                   |
| ----------------------- | ------------------------- | ----------------------- |
| `render_clip`           | Render a clip             | opens the CutPro player |
| `render_broadcast_clip` | Render a broadcast clip   |                         |
| `get_render_limits`     | Get render quota          |                         |
| `create_render`         | Render an edit            |                         |
| `list_renders`          | List renders              |                         |
| `create_bulk_download`  | Start a bulk download     |                         |
| `get_bulk_download`     | Get bulk download status  |                         |
| `get_render`            | Get render status         | opens the CutPro player |
| `delete_render`         | Cancel or delete a render |                         |
| `download_render`       | Get render download URL   | opens the CutPro player |

#### Connections

| Tool               | What it does     | Notes |
| ------------------ | ---------------- | ----- |
| `list_connections` | List connections |       |
| `get_connection`   | Get a connection |       |

#### Monitoring

| Tool                       | What it does                      | Notes |
| -------------------------- | --------------------------------- | ----- |
| `list_monitors`            | List monitored channels           |       |
| `create_monitor`           | Monitor a channel                 |       |
| `get_monitor`              | Get a monitored channel           |       |
| `update_monitor`           | Update a monitor                  |       |
| `delete_monitor`           | Stop watching a channel           |       |
| `start_monitor`            | Start monitoring                  |       |
| `stop_monitor`             | Stop monitoring                   |       |
| `list_broadcasts`          | List broadcasts of a live monitor |       |
| `list_broadcast_clips`     | List clips of a broadcast         |       |
| `apply_broadcast_template` | Apply template to broadcast clips |       |

#### Posts

| Tool               | What it does        | Notes |
| ------------------ | ------------------- | ----- |
| `create_post`      | Create a post       |       |
| `list_posts`       | List posts          |       |
| `get_post`         | Get a post          |       |
| `cancel_post`      | Cancel a post       |       |
| `update_post`      | Update a post       |       |
| `publish_post`     | Trigger publish     |       |
| `retry_post_item`  | Retry a failed item |       |
| `delete_post_item` | Delete a post item  |       |

#### Templates

| Tool             | What it does   | Notes |
| ---------------- | -------------- | ----- |
| `list_templates` | List templates |       |

#### Transcriptions

| Tool                          | What it does                               | Notes             |
| ----------------------------- | ------------------------------------------ | ----------------- |
| `create_transcription_upload` | Start an upload                            | local server only |
| `create_transcription`        | Transcribe a media file                    |                   |
| `list_transcriptions`         | List transcriptions                        |                   |
| `get_transcription`           | Get transcription status                   |                   |
| `delete_transcription`        | Delete a transcription                     |                   |
| `get_transcription_cues`      | Get the transcript as JSON                 |                   |
| `download_transcription`      | Download the transcript as a subtitle file |                   |

#### Personas

| Tool                             | What it does                                 | Notes                                               |
| -------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `get_persona_catalog`            | Get traits, prices and limits                |                                                     |
| `list_persona_presets`           | List ready-made characters                   |                                                     |
| `create_persona_from_preset`     | Create a persona from a ready-made character | opens the CutPro player                             |
| `favorite_persona_preset`        | Star a ready-made character                  |                                                     |
| `list_personas`                  | List personas                                | opens the CutPro player                             |
| `create_persona`                 | Create a persona                             | opens the CutPro player                             |
| `upload_persona_face`            | Upload a reference photo                     | local server only                                   |
| `quote_persona_swap`             | Price a swap video                           |                                                     |
| `create_persona_source_upload`   | Upload a source video                        | local server only                                   |
| `complete_persona_source_upload` | Complete a source video upload               | local server only                                   |
| `get_persona`                    | Get a persona                                | opens the CutPro player                             |
| `delete_persona`                 | Delete a persona                             |                                                     |
| `regenerate_persona`             | Regenerate or edit the persona photo         | opens the CutPro player                             |
| `restore_persona_version`        | Restore a persona version                    |                                                     |
| `rate_persona_version`           | Rate a persona photo                         |                                                     |
| `rate_persona_video`             | Rate a persona video                         |                                                     |
| `save_persona`                   | Save or rename a persona                     |                                                     |
| `create_persona_video`           | Create a persona video                       | spends credits, asks first, opens the CutPro player |
| `list_persona_videos`            | List a persona's videos                      | opens the CutPro player                             |
| `get_persona_video`              | Get a persona video                          | opens the CutPro player                             |
| `read_persona_shot_product`      | Read a product from its page link            |                                                     |
| `upload_persona_shot_photo`      | Upload a product photo                       | local server only                                   |
| `create_persona_shot`            | Create a persona photo                       | spends credits, asks first                          |
| `list_persona_shots`             | List a persona's photos                      |                                                     |
| `get_persona_shot`               | Get a persona photo                          |                                                     |

#### Generations

| Tool                      | What it does                                 | Notes                                               |
| ------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `list_generation_models`  | List image and video models and their prices |                                                     |
| `upload_generation_image` | Upload a reference image                     | local server only                                   |
| `create_generation`       | Generate an image or a video                 | spends credits, asks first, opens the CutPro player |
| `list_generations`        | List generations                             | opens the CutPro player                             |
| `get_generation`          | Get a generation                             | opens the CutPro player                             |
| `delete_generation`       | Delete a generation                          |                                                     |
| `download_generation`     | Get the download link of a generation        |                                                     |

<!-- tools:end -->

## Links

- Docs: [cut.pro/docs/api-reference/mcp](https://cut.pro/docs/api-reference/mcp)
- npm: [@cutpro/mcp](https://www.npmjs.com/package/@cutpro/mcp)
- MCP Registry: `io.github.getcutpro/cutpro`
- Releases: [github.com/getcutpro/mcp/releases](https://github.com/getcutpro/mcp/releases) · [CHANGELOG.md](CHANGELOG.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · Security: [SECURITY.md](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

## License

MIT
