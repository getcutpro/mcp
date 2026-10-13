#!/usr/bin/env node
import {
	acceptedContent,
	createMcpHandler,
	inputRequired,
	ProtocolError,
	ProtocolErrorCode,
	ResourceNotFoundError,
	Server,
	type CallToolResult,
	type McpRequestContext,
	type Tool,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter, requireBearerAuth } from "@modelcontextprotocol/server-legacy/auth";
import express, { type ErrorRequestHandler, type Request, type RequestHandler } from "express";
import { CutproOAuthProvider } from "./oauth.js";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };
import { createMemoryKV, createRedisKV } from "./store.js";
import { z } from "zod";

const BASE_URL = process.env.CUTPRO_API_URL ?? "https://api.cut.pro/api/v1";

const SERVER_VERSION = pkg.version;
const SERVER_DESCRIPTION = "AI images and videos with any model, AI personas, and AI clips from long videos.";
const SERVER_WEBSITE = "https://cut.pro/docs/api-reference/mcp";
// Hosted on cut.pro so every client, local or remote, shows the same logo without the server serving files.
const SERVER_ICONS = [
	{ src: "https://cut.pro/icons/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
	{ src: "https://cut.pro/icons/icon-192.png", mimeType: "image/png", sizes: ["192x192"] },
];

type Creds = { apiKey: string; workspaceId?: string };

function createApi({ apiKey, workspaceId }: Creds) {
	return async function api(method: string, path: string, body?: unknown): Promise<unknown> {
		const headers: Record<string, string> = { "X-Api-Key": apiKey };
		if (body !== undefined) headers["Content-Type"] = "application/json";
		if (workspaceId) headers["X-Workspace-Id"] = workspaceId;

		const res = await fetch(`${BASE_URL}${path}`, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});

		const text = await res.text();
		let data: unknown = null;
		if (text) {
			try {
				data = JSON.parse(text);
			} catch {
				data = text;
			}
		}
		if (!res.ok) {
			const detail = typeof data === "string" ? data : JSON.stringify(data);
			throw new Error(`CutPro API ${res.status} on ${method} ${path}: ${detail}`);
		}
		return data;
	};
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

const SCHEMA = z.record(z.string(), z.json());
type JsonSchema = z.infer<typeof SCHEMA>;
const OPERATION = z.object({
	operationId: z.string().optional(),
	tags: z.array(z.string()).optional(),
	summary: z.string().optional(),
	description: z.string().optional(),
	parameters: z.array(z.object({ name: z.string(), in: z.string(), required: z.boolean().optional(), schema: SCHEMA })).optional(),
	requestBody: z
		.object({ content: z.record(z.string(), z.object({ schema: z.object({ properties: z.record(z.string(), SCHEMA).optional(), required: z.array(z.string()).optional() }) })) })
		.optional(),
	responses: z.record(z.string(), z.object({ content: z.record(z.string(), z.object({ schema: SCHEMA })).optional() })).optional(),
	"x-mcp": z
		.object({
			annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean(), idempotentHint: z.boolean(), openWorldHint: z.boolean() }).partial().optional(),
			localFiles: z.boolean().optional(),
			ui: z.boolean().optional(),
		})
		.optional(),
});
const SPEC = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) });

type Endpoint = { tool: Tool; tag: string; method: string; path: string; queryParams: string[]; bodyKeys: string[] | null; localFiles: boolean; charges: boolean };

const UI_EXTENSION = "io.modelcontextprotocol/ui";
const WIDGET_URI = "ui://cutpro/media";
const WIDGET_MIME = "text/html;profile=mcp-app";
// Signed media comes from the CDN; nothing else is fetched, so the sandbox stays closed to every other origin.
const WIDGET_UI = { csp: { resourceDomains: ["https://cdn.cut.pro"] }, prefersBorder: false };
const CONFIRM_SCHEMA = z.object({ confirm: z.boolean() });
// Sits next to the bundle (the build copies it into dist), and in src when run from source.
const WIDGET_HTML = readFileSync(new URL("./widget.html", import.meta.url), "utf8");

const METHODS = ["get", "post", "put", "patch", "delete"];
// OpenAI and Claude count overwriting as destructive, not only deleting; a route that does more says so in its `x-mcp`.
const OVERWRITING_METHODS = ["put", "patch", "delete"];
const SPEC_TTL_MS = 10 * 60 * 1000;

// The API spec is OpenAPI 3.0, which marks a nullable field with `nullable: true`; JSON Schema, what MCP clients validate with, needs "null" in the type instead.
function nullableToJsonSchema(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(nullableToJsonSchema);
	if (!isRecord(node)) return node;
	const { nullable, ...rest } = node;
	const schema: Record<string, unknown> = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, nullableToJsonSchema(value)]));
	if (nullable !== true) return schema;
	if (typeof schema.type === "string") schema.type = [schema.type, "null"];
	if (Array.isArray(schema.enum)) schema.enum = [...schema.enum, null];
	if (Array.isArray(schema.anyOf)) schema.anyOf = [...schema.anyOf, { type: "null" }];
	return schema;
}

// The route's own success responses become the output schema, so structured results are as described as the inputs.
function outputSchemaOf(responses: z.infer<typeof OPERATION>["responses"]): Tool["outputSchema"] {
	const success = Object.entries(responses ?? {})
		.filter(([status]) => /^2\d\d$/.test(status))
		.map(([, response]) => response.content?.["application/json"]?.schema);
	const schemas = success.filter((schema): schema is JsonSchema => schema?.type === "object");
	if (schemas.length === 0 || schemas.length !== success.length) return undefined;
	const distinct = [...new Map(schemas.map((schema) => [JSON.stringify(schema), schema])).values()];
	const [only] = distinct;
	return distinct.length === 1 && only ? { ...only, type: "object" } : { type: "object", anyOf: distinct };
}

// One tool per operation of the API's own spec, so the MCP cannot drift from the API: a new route, field or description shows up here on the next refresh.
function toEndpoints(spec: z.infer<typeof SPEC>): Map<string, Endpoint> {
	const endpoints = new Map<string, Endpoint>();
	for (const [path, item] of Object.entries(spec.paths)) {
		for (const [method, raw] of Object.entries(item)) {
			if (!METHODS.includes(method)) continue;
			const operation = OPERATION.parse(nullableToJsonSchema(raw));
			if (!operation.operationId) continue;
			const parameters = operation.parameters ?? [];
			const body = operation.requestBody?.content["application/json"]?.schema;
			const properties: Record<string, JsonSchema> = { ...body?.properties };
			const required = [...(body?.required ?? [])];
			for (const parameter of parameters) {
				properties[parameter.name] = parameter.schema;
				if (parameter.required) required.push(parameter.name);
			}

			const name = operation.operationId.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
			endpoints.set(name, {
				tag: operation.tags?.[0] ?? "Other",
				method: method.toUpperCase(),
				path,
				queryParams: parameters.filter((parameter) => parameter.in === "query").map((parameter) => parameter.name),
				bodyKeys: body ? Object.keys(body.properties ?? {}) : null,
				localFiles: operation["x-mcp"]?.localFiles ?? false,
				// A route that takes the agreed `credits` spends them; the user confirms that price in the client itself where it can ask.
				charges: method === "post" && typeof body?.properties?.credits === "object",
				tool: {
					name,
					title: operation.summary,
					description: [operation.summary, operation.description].filter(Boolean).join("\n\n"),
					inputSchema: { type: "object", properties, required },
					outputSchema: outputSchemaOf(operation.responses),
					...(operation["x-mcp"]?.ui ? { _meta: { ui: { resourceUri: WIDGET_URI } } } : {}),
					annotations: {
						title: operation.summary,
						readOnlyHint: method === "get",
						destructiveHint: OVERWRITING_METHODS.includes(method),
						openWorldHint: false,
						...operation["x-mcp"]?.annotations,
					},
				},
			});
		}
	}
	return endpoints;
}

let spec: { fetchedAt: number; endpoints: Promise<Map<string, Endpoint>> } | undefined;

function loadEndpoints(): Promise<Map<string, Endpoint>> {
	if (spec && Date.now() - spec.fetchedAt < SPEC_TTL_MS) return spec.endpoints;
	const stale = spec?.endpoints;
	const endpoints = fetch(`${BASE_URL}/openapi.json`)
		.then(async (res) => {
			if (!res.ok) throw new Error(`CutPro API ${res.status} on GET /openapi.json`);
			return toEndpoints(SPEC.parse(await res.json()));
		})
		// A failed refresh keeps serving the last good spec, and a failed first load is retried on the next call.
		.catch((error: unknown) => {
			if (stale) return stale;
			spec = undefined;
			throw error;
		});
	spec = { fetchedAt: Date.now(), endpoints };
	return endpoints;
}

function requestFor(endpoint: Endpoint, args: Record<string, unknown>): { path: string; body: Record<string, unknown> | undefined } {
	const path = endpoint.path.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(String(args[name] ?? "")));
	const query = new URLSearchParams();
	for (const name of endpoint.queryParams) {
		const value = args[name];
		if (value === undefined || value === null) continue;
		for (const item of Array.isArray(value) ? value : [value]) query.append(name, String(item));
	}
	const search = query.toString();
	const body = endpoint.bodyKeys ? Object.fromEntries(endpoint.bodyKeys.filter((key) => args[key] !== undefined).map((key) => [key, args[key]])) : undefined;
	return { path: search ? `${path}?${search}` : path, body };
}

async function run(fetcher: () => Promise<unknown>, structured: boolean): Promise<CallToolResult> {
	try {
		const out = (await fetcher()) ?? { ok: true };
		return { content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }], structuredContent: structured && isRecord(out) ? out : undefined };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { content: [{ type: "text", text: message }], isError: true };
	}
}

// Only a plain release number reaches the npx command line, which runs through a shell on Windows.
const NPM_LATEST = z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) });

function isNewer(candidate: string, current: string): boolean {
	const parts = (version: string) => (version.split("-")[0] ?? "").split(".").map(Number);
	const [next, now] = [parts(candidate), parts(current)];
	for (let index = 0; index < 3; index++) {
		const difference = (next[index] ?? 0) - (now[index] ?? 0);
		if (difference !== 0) return difference > 0;
	}
	return false;
}

async function latestVersion(): Promise<string | null> {
	try {
		const res = await fetch("https://registry.npmjs.org/@cutpro/mcp/latest", { signal: AbortSignal.timeout(1500) });
		const latest = NPM_LATEST.safeParse(await res.json());
		return latest.success && isNewer(latest.data.version, SERVER_VERSION) ? latest.data.version : null;
	} catch {
		return null;
	}
}

// The hosted server is always current; a local install hands the session to the newest release, so a pinned or cached copy never serves stale code. The child is told not to look again.
async function handOverToLatest(latest: string): Promise<boolean> {
	if (process.env.CUTPRO_MCP_AUTO_UPDATE === "0") return false;
	const child = spawn("npx", ["-y", `@cutpro/mcp@${latest}`], { stdio: "inherit", env: { ...process.env, CUTPRO_MCP_AUTO_UPDATE: "0" }, shell: process.platform === "win32" });
	const started = await new Promise<boolean>((resolve) => {
		child.once("spawn", () => resolve(true));
		child.once("error", () => resolve(false));
	});
	if (!started) return false;
	for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
	child.on("exit", (code) => process.exit(code ?? 0));
	return true;
}

const README_START = "<!-- tools:start -->";
const README_END = "<!-- tools:end -->";

// Rewrites the tool list of the README from the live spec, so the docs list exactly what the server serves.
async function writeReadme(path: string): Promise<void> {
	const endpoints = [...(await loadEndpoints()).values()];
	const tags = [...new Set(endpoints.map((endpoint) => endpoint.tag))];
	const sections = tags.map((tag) => {
		const rows = endpoints
			.filter((endpoint) => endpoint.tag === tag)
			.map((endpoint) => {
				const notes = [endpoint.charges ? "spends credits, asks first" : null, endpoint.tool._meta ? "opens the CutPro player" : null, endpoint.localFiles ? "local server only" : null]
					.filter(Boolean)
					.join(", ");
				return `| \`${endpoint.tool.name}\` | ${(endpoint.tool.title ?? "").replaceAll("|", "\\|")} | ${notes} |`;
			});
		return [`#### ${tag}`, "", "| Tool | What it does | Notes |", "| --- | --- | --- |", ...rows].join("\n");
	});
	const prompts = [
		"#### Prompts",
		"",
		"Ready-made requests your client offers as shortcuts (the `/` menu in Claude).",
		"",
		"| Prompt | What it does |",
		"| --- | --- |",
		...PROMPTS.map((prompt) => `| \`${prompt.name}\` | ${prompt.description} |`),
	].join("\n");
	const block = [
		README_START,
		`${endpoints.length} tools and ${PROMPTS.length} prompts, generated from the live API spec and the server.`,
		"",
		prompts,
		"",
		...sections.flatMap((section) => [section, ""]),
		README_END,
	].join("\n");
	const readme = readFileSync(path, "utf8");
	const begin = readme.indexOf(README_START);
	const finish = readme.indexOf(README_END);
	if (begin === -1 || finish === -1) throw new Error(`${path} has no ${README_START} ... ${README_END} block`);
	writeFileSync(path, readme.slice(0, begin) + block + readme.slice(finish + README_END.length));
}

type PromptRecipe = { name: string; title: string; description: string; arguments: { name: string; description: string; required: boolean }[]; text: (args: Record<string, string>) => string };

// Ready-made requests that clients offer as shortcuts (the "/" menu in Claude), for people who do not know what to ask yet.
const PROMPTS: PromptRecipe[] = [
	{
		name: "generate_video",
		title: "Generate a video with AI",
		description: "Turn an idea into a video with Veo, Kling, Seedance, Wan or any other model.",
		arguments: [
			{ name: "idea", description: "What the video shows", required: true },
			{ name: "model", description: "A model name, like Veo or Kling; the best value for the price when left out", required: false },
		],
		text: (args) =>
			`Generate a vertical (9:16) video with CutPro of: ${args.idea}. ${args.model ? `Use ${args.model}.` : "Pick the balanced preset."} Read the models and prices with list_generation_models, tell me the model, the length and the total in credits, and wait for my yes before create_generation. Then follow it until it is ready and show it.`,
	},
	{
		name: "product_ad",
		title: "Ad for a product",
		description: "An ad image of your product, animated into a vertical video ready to post.",
		arguments: [{ name: "product", description: "The product, described in a few words", required: true }],
		text: (args) =>
			`Make an ad with CutPro for: ${args.product}. First generate a striking product image (image generation, references mode if I share a photo of the product), show it, then animate it into a 9:16 video passing its output.image_id. Tell me the price of each step and wait for my yes before each one. When the video is ready, offer to schedule it on my connected accounts.`,
	},
	{
		name: "create_persona",
		title: "Create an AI persona",
		description: "A realistic person that stays the same in every photo and video.",
		arguments: [{ name: "description", description: "Who the persona is: age, look, style", required: true }],
		text: (args) =>
			`Create a CutPro AI persona: ${args.description}. Read the traits and prices with get_persona_catalog and offer the ready-made characters from list_persona_presets if one fits. Tell me the price, wait for my yes, create it and follow it until the photo is ready, then ask whether to save it.`,
	},
	{
		name: "clip_and_schedule",
		title: "Clip a video and schedule the week",
		description: "The best moments of a long video, rendered and scheduled one per day.",
		arguments: [
			{ name: "url", description: "Link of a YouTube, Twitch, Kick or TikTok video", required: true },
			{ name: "accounts", description: "Where to post, like TikTok and Instagram; every connected account when left out", required: false },
		],
		text: (args) =>
			`Clip this video with CutPro: ${args.url}. Show me the cost with analyze_video and wait for my yes. When the clips are ready, pick the 5 best rated, render them and schedule one per day at 6 pm my time on ${args.accounts ?? "my connected accounts"}. If an account I want is not connected, give me its link from get_connection_link and continue once I connect it. Confirm the captions, accounts and times before scheduling.`,
	},
	{
		name: "transcribe",
		title: "Transcribe and summarize",
		description: "Timed captions of a video or audio, plus a short summary.",
		arguments: [{ name: "media", description: "Which video or audio; the latest one in the library when left out", required: false }],
		text: (args) =>
			`Transcribe with CutPro ${args.media ?? "my latest video in the library"}. Follow the transcription until it is ready, then give me a short summary with the key moments and their times, and the SRT file link.`,
	},
];

const DECLINED: CallToolResult = { content: [{ type: "text", text: "The user did not confirm the charge, so nothing was started and no credits were spent." }], isError: true };

// The list never varies per caller and follows the API spec, so clients and shared caches may keep it as long as the spec refresh.
const CACHE_HINTS = {
	"tools/list": { ttlMs: SPEC_TTL_MS, cacheScope: "public" },
	"resources/list": { ttlMs: SPEC_TTL_MS, cacheScope: "public" },
	"prompts/list": { ttlMs: SPEC_TTL_MS, cacheScope: "public" },
	"resources/read": { ttlMs: SPEC_TTL_MS, cacheScope: "public" },
	"server/discover": { ttlMs: SPEC_TTL_MS, cacheScope: "public" },
} as const;

// A remote client has no filesystem to upload from, so it never sees the routes that need one.
function buildServer(creds: Creds, { localFiles, notice = null }: { localFiles: boolean; notice?: string | null }): Server {
	const api = createApi(creds);
	const available = async () => new Map([...(await loadEndpoints())].filter(([, endpoint]) => localFiles || !endpoint.localFiles));
	const server = new Server(
		{ name: "cutpro", title: "CutPro", version: SERVER_VERSION, description: SERVER_DESCRIPTION, websiteUrl: SERVER_WEBSITE, icons: SERVER_ICONS },
		{ capabilities: { tools: {}, resources: {}, prompts: {}, extensions: { [UI_EXTENSION]: {} } }, instructions: notice ?? undefined, cacheHints: CACHE_HINTS },
	);
	let noticePending = notice !== null;

	server.setRequestHandler("tools/list", async () => ({ tools: [...(await available()).values()].map((endpoint) => endpoint.tool) }));

	server.setRequestHandler("resources/list", async () => ({
		resources: [
			{
				uri: WIDGET_URI,
				name: "cutpro_media",
				title: "CutPro media",
				description: "Plays generated images and videos, personas, clips and renders, and follows them until they are ready.",
				mimeType: WIDGET_MIME,
				_meta: { ui: WIDGET_UI },
			},
		],
	}));

	server.setRequestHandler("resources/templates/list", async () => ({ resourceTemplates: [] }));

	server.setRequestHandler("prompts/list", async () => ({ prompts: PROMPTS.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })) }));

	server.setRequestHandler("prompts/get", async (request) => {
		const prompt = PROMPTS.find((candidate) => candidate.name === request.params.name);
		if (!prompt) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown prompt: ${request.params.name}`);
		const args = request.params.arguments ?? {};
		const missing = prompt.arguments.find((argument) => argument.required && !args[argument.name]);
		if (missing) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Missing argument: ${missing.name}`);
		return { description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.text(args) } }] };
	});

	server.setRequestHandler("resources/read", async (request) => {
		if (request.params.uri !== WIDGET_URI) throw new ResourceNotFoundError(request.params.uri);
		return { contents: [{ uri: WIDGET_URI, mimeType: WIDGET_MIME, text: WIDGET_HTML, _meta: { ui: WIDGET_UI } }] };
	});

	server.setRequestHandler("tools/call", async (request, ctx) => {
		const endpoint = (await available()).get(request.params.name);
		if (!endpoint) return { content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }], isError: true };
		const args = request.params.arguments ?? {};

		// Filled per request on 2026-07-28 and by the handshake on stdio; a stateless 2025 HTTP request has nowhere to ask, so it is never set there.
		if (endpoint.charges && typeof args.credits === "number" && server.getClientCapabilities()?.elicitation) {
			const answer = acceptedContent(ctx.mcpReq.inputResponses, "confirm", CONFIRM_SCHEMA);
			if (!answer && !ctx.mcpReq.inputResponses?.confirm) {
				return inputRequired({
					inputRequests: {
						confirm: inputRequired.elicit({ message: `${endpoint.tool.title ?? endpoint.tool.name}: ${args.credits} CutPro credits will be charged now.`, requestedSchema: CONFIRM_SCHEMA }),
					},
				});
			}
			if (!answer?.confirm) return DECLINED;
		}

		const { path, body } = requestFor(endpoint, args);
		const result = await run(() => api(endpoint.method, path, body), endpoint.tool.outputSchema !== undefined);
		// Instructions alone are easy to miss, so the first tool result of the session also carries the notice for the model to relay.
		if (notice && noticePending) {
			noticePending = false;
			result.content.push({ type: "text", text: notice });
		}
		return result;
	});

	return server;
}

function bearerKey(req: Request): string | undefined {
	const auth = req.header("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
	// No fallback to CUTPRO_API_KEY: on a reachable HTTP server it would hand the owner's account to anyone who calls without a key.
	return req.header("x-api-key");
}

function authedKey(req: Request): string | undefined {
	const extra = req.auth?.extra;
	return typeof extra?.apiKey === "string" ? extra.apiKey : undefined;
}

function cors(): RequestHandler {
	return (req, res, next) => {
		res.header("Access-Control-Allow-Origin", req.header("origin") ?? "*");
		res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
		res.header("Access-Control-Allow-Headers", "*");
		res.header("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
		if (req.method === "OPTIONS") {
			res.sendStatus(204);
			return;
		}
		next();
	};
}

// The SDK router omits these: RFC 9728 requires bearer_methods_supported, and agent_auth must sit in the authorization server metadata, where clients land after following protected-resource.
const AUTH_METADATA_EXTRAS: Record<string, Record<string, unknown>> = {
	"/.well-known/oauth-protected-resource": {
		bearer_methods_supported: ["header"],
		resource_documentation: "https://cut.pro/auth.md",
	},
	"/.well-known/oauth-authorization-server": {
		authorization_response_iss_parameter_supported: true,
		client_id_metadata_document_supported: true,
		service_documentation: "https://cut.pro/auth.md",
		agent_auth: {
			skill: "https://cut.pro/auth.md",
			skill_document: "https://cut.pro/.well-known/agent-skills/cutpro-auth/SKILL.md",
			register_uri: "https://mcp.cut.pro/register",
			// Registration is open (RFC 7591 with token_endpoint_auth_method "none"), so the agent gets a credential without presenting any identity.
			identity_types_supported: ["anonymous"],
			anonymous: {
				credential_types_supported: ["oauth2_access_token"],
				claim_uri: "https://mcp.cut.pro/register",
				revocation_uri: "https://mcp.cut.pro/revoke",
			},
			credential_types_supported: ["oauth2_access_token", "api_key"],
			claim_uri: "https://mcp.cut.pro/register",
			revocation_uri: "https://mcp.cut.pro/revoke",
			events_supported: ["revocation"],
			methods: [
				{
					type: "oauth2_dynamic_client_registration",
					register_uri: "https://mcp.cut.pro/register",
					authorization_endpoint: "https://mcp.cut.pro/authorize",
					token_endpoint: "https://mcp.cut.pro/token",
					revocation_uri: "https://mcp.cut.pro/revoke",
					grant_types: ["authorization_code", "refresh_token"],
					code_challenge_methods: ["S256"],
					scopes: ["cutpro"],
					credential_types_supported: ["oauth2_access_token"],
					self_service: true,
				},
				{
					type: "api_key",
					claim_uri: "https://cut.pro/studio/me/api-keys",
					revocation_uri: "https://cut.pro/studio/me/api-keys",
					header: "X-Api-Key",
					credential_types_supported: ["api_key"],
					self_service: false,
				},
			],
		},
	},
};

// The SDK publishes `resource` as URL.href, with a trailing slash; Claude compares it to the URL the user typed, which is the canonical form without one.
function authMetadataExtras(resource: string): RequestHandler {
	return (req, res, next) => {
		const extra = req.path === "/.well-known/oauth-protected-resource" ? { ...AUTH_METADATA_EXTRAS[req.path], resource } : AUTH_METADATA_EXTRAS[req.path];
		if (extra) {
			const sendJson = res.json.bind(res);
			res.json = (body: unknown) => (body && typeof body === "object" ? sendJson({ ...body, ...extra }) : sendJson(body));
		}
		next();
	};
}

// The Server Card (SEP-1649) describes only the remote: npm install metadata belongs to server.json, owned by the MCP Registry, and the url comes from MCP_PUBLIC_URL so a self-host advertises itself.
function serverCard(publicUrl: string): Record<string, unknown> {
	return {
		$schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
		name: "io.github.getcutpro/cutpro",
		title: "CutPro",
		description: SERVER_DESCRIPTION,
		version: SERVER_VERSION,
		websiteUrl: SERVER_WEBSITE,
		icons: SERVER_ICONS,
		repository: { url: "https://github.com/getcutpro/mcp", source: "github" },
		remotes: [{ type: "streamable-http", url: publicUrl }],
	};
}

async function startHttp(port: number): Promise<void> {
	const app = express();
	// The hosted server sits behind two proxies: fewer makes the auth rate limit see every caller as the proxy, more lets a forged X-Forwarded-For pick the limit key.
	app.set("trust proxy", 2);
	app.use(cors());

	const publicUrl = (process.env.MCP_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
	const card = serverCard(publicUrl);
	// Connector lists that show the domain's favicon get the CutPro logo instead of a blank square.
	app.get("/favicon.ico", (_req, res) => res.redirect(301, "https://cut.pro/icons/favicon.ico"));
	// The canonical place is <streamable-http-url>/server-card; the .well-known alias serves clients that only look there.
	const sendCard: RequestHandler = (_req, res) => {
		res.type("application/mcp-server-card+json").set("Cache-Control", "public, max-age=3600").json(card);
	};
	app.get("/server-card", sendCard);
	app.get("/.well-known/mcp/server-card.json", sendCard);

	// OpenAI proves domain ownership by fetching the token its portal issues for this plugin.
	const openaiChallenge = process.env.OPENAI_APPS_CHALLENGE;
	if (openaiChallenge) app.get("/.well-known/openai-apps-challenge", (_req, res) => void res.type("text/plain").send(openaiChallenge));

	app.get("/.well-known/mcp/catalog.json", (_req, res) => {
		res
			.type("application/json")
			.set("Cache-Control", "public, max-age=3600")
			.json({
				specVersion: "draft",
				entries: [{ identifier: "urn:air:cut.pro:cutpro", type: "application/mcp-server-card+json", url: `${publicUrl}/server-card` }],
			});
	});

	const oauth = process.env.MCP_OAUTH === "1";
	let guard: RequestHandler | undefined;
	if (oauth) {
		// The resource server is the full MCP_PUBLIC_URL; the authorization server is only its origin.
		const resourceServerUrl = new URL(process.env.MCP_PUBLIC_URL ?? `http://localhost:${port}`);
		const issuerUrl = new URL(resourceServerUrl.origin);
		const redisUrl = process.env.MCP_REDIS_URL;
		const kv = redisUrl ? await createRedisKV(redisUrl, "mcp:oauth:") : createMemoryKV();
		process.stdout.write(`CutPro MCP OAuth store: ${redisUrl ? "redis" : "in-memory"}\n`);
		const provider = new CutproOAuthProvider(BASE_URL, process.env.CUTPRO_APP_URL ?? "https://cut.pro", issuerUrl.href, kv);
		app.use(authMetadataExtras(publicUrl));
		// Every ChatGPT and Claude user reaches /register, /token and /revoke from the same few platform IPs, so the SDK's per-IP defaults would turn them away.
		const platformLimit = (windowMs: number, max: number) => ({ rateLimit: { windowMs, max } });
		app.use(
			mcpAuthRouter({
				provider,
				issuerUrl,
				resourceServerUrl,
				resourceName: "CutPro",
				scopesSupported: ["cutpro"],
				clientRegistrationOptions: platformLimit(60 * 60 * 1000, 2000),
				tokenOptions: platformLimit(15 * 60 * 1000, 5000),
				revocationOptions: platformLimit(15 * 60 * 1000, 2000),
			}),
		);
		app.get("/oauth/requests/:id", (req, res) => void provider.describeRequest(req, res));
		app.post("/oauth/consent", express.urlencoded({ extended: false }), (req, res) => void provider.handleConsent(req, res));
		guard = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl) });
	}

	// Without OAuth the key travels in a header; either way the factory reads it from the same pass-through auth info.
	const withKey: RequestHandler = (req, res, next) => {
		const apiKey = oauth ? authedKey(req) : bearerKey(req);
		if (!apiKey) {
			res.status(401).json({ error: "Missing API key" });
			return;
		}
		if (!oauth) req.auth = { token: apiKey, clientId: "api-key", scopes: [], extra: { apiKey } };
		next();
	};
	const handler = createMcpHandler(({ authInfo, requestInfo }: McpRequestContext) => {
		const apiKey = typeof authInfo?.extra?.apiKey === "string" ? authInfo.extra.apiKey : "";
		return buildServer({ apiKey, workspaceId: requestInfo?.headers.get("x-workspace-id") ?? process.env.CUTPRO_WORKSPACE_ID }, { localFiles: false });
	});
	const mcp = toNodeHandler(handler);
	app.all("/", express.json({ limit: "1mb" }), ...(guard ? [guard] : []), withKey, (req, res) => void mcp(req, res, req.body));

	// Registered last so it also catches the SDK auth routes' own body parsers: otherwise express answers an HTML 400 carrying the SyntaxError stack and logs it.
	const badBody: ErrorRequestHandler = (err, req, res, next) => {
		if (!isRecord(err) || err.type !== "entity.parse.failed") {
			next(err);
			return;
		}
		if (req.path === "/") res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
		else res.status(400).json({ error: "invalid_request" });
	};
	app.use(badBody);

	app.listen(port, () => process.stdout.write(`CutPro MCP (HTTP${oauth ? " + OAuth" : ""}) on http://localhost:${port}/\n`));
}

async function startStdio(): Promise<void> {
	const apiKey = process.env.CUTPRO_API_KEY;
	if (!apiKey) {
		process.stderr.write("CUTPRO_API_KEY is not set. Generate one at https://cut.pro/studio/me/api-keys\n");
		process.exit(1);
	}
	const latest = await latestVersion();
	if (latest && (await handOverToLatest(latest))) return;
	const notice = latest
		? `CutPro MCP ${SERVER_VERSION} is outdated: version ${latest} is available. Tell the user to update: restart the AI app if its config runs "npx -y @cutpro/mcp@latest", or change the command to that.`
		: null;
	if (notice) process.stderr.write(`${notice}\n`);
	serveStdio(() => buildServer({ apiKey, workspaceId: process.env.CUTPRO_WORKSPACE_ID }, { localFiles: true, notice }));
}

if (process.argv[2] === "readme") {
	await writeReadme(process.argv[3] ?? "README.md");
} else if (process.env.MCP_TRANSPORT === "http" || process.env.API_MCP_PORT) {
	await startHttp(Number(process.env.API_MCP_PORT ?? process.env.PORT ?? 8787));
} else {
	await startStdio();
}
