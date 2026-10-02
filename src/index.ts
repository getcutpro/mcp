#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import express, { type ErrorRequestHandler, type Request, type RequestHandler } from "express";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { CutproOAuthProvider } from "./oauth.js";
import { createMemoryKV, createRedisKV } from "./store.js";
import { z } from "zod";

const BASE_URL = process.env.CUTPRO_API_URL ?? "https://api.cut.pro/api/v1";

// Keep in sync with package.json and server.json on every release.
const SERVER_VERSION = "2.0.0";

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

const SCHEMA = z.record(z.string(), z.unknown());
const OPERATION = z.object({
	operationId: z.string().optional(),
	summary: z.string().optional(),
	description: z.string().optional(),
	parameters: z.array(z.object({ name: z.string(), in: z.string(), required: z.boolean().optional(), schema: SCHEMA })).optional(),
	requestBody: z
		.object({ content: z.record(z.string(), z.object({ schema: z.object({ properties: z.record(z.string(), SCHEMA).optional(), required: z.array(z.string()).optional() }) })) })
		.optional(),
	"x-mcp": z
		.object({
			annotations: z
				.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean(), idempotentHint: z.boolean(), openWorldHint: z.boolean() })
				.partial()
				.optional(),
			localFiles: z.boolean().optional(),
		})
		.optional(),
});
const SPEC = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) });

type Endpoint = { tool: Tool; method: string; path: string; queryParams: string[]; bodyKeys: string[] | null; localFiles: boolean };

const METHODS = ["get", "post", "put", "patch", "delete"];
// OpenAI and Claude count overwriting as destructive, not only deleting; a route that does more says so in its `x-mcp`.
const OVERWRITING_METHODS = ["put", "patch", "delete"];
const SPEC_TTL_MS = 10 * 60 * 1000;

// One tool per operation of the API's own spec, so the MCP cannot drift from the API: a new route, field or description shows up here on the next refresh.
function toEndpoints(spec: z.infer<typeof SPEC>): Map<string, Endpoint> {
	const endpoints = new Map<string, Endpoint>();
	for (const [path, item] of Object.entries(spec.paths)) {
		for (const [method, raw] of Object.entries(item)) {
			if (!METHODS.includes(method)) continue;
			const operation = OPERATION.parse(raw);
			if (!operation.operationId) continue;
			const parameters = operation.parameters ?? [];
			const body = operation.requestBody?.content["application/json"]?.schema;
			const properties: Record<string, Record<string, unknown>> = { ...body?.properties };
			const required = [...(body?.required ?? [])];
			for (const parameter of parameters) {
				properties[parameter.name] = parameter.schema;
				if (parameter.required) required.push(parameter.name);
			}

			const name = operation.operationId.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
			endpoints.set(name, {
				method: method.toUpperCase(),
				path,
				queryParams: parameters.filter((parameter) => parameter.in === "query").map((parameter) => parameter.name),
				bodyKeys: body ? Object.keys(body.properties ?? {}) : null,
				localFiles: operation["x-mcp"]?.localFiles ?? false,
				tool: {
					name,
					title: operation.summary,
					description: [operation.summary, operation.description].filter(Boolean).join("\n\n"),
					inputSchema: { type: "object", properties, required },
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

async function run(fetcher: () => Promise<unknown>): Promise<CallToolResult> {
	try {
		const out = (await fetcher()) ?? { ok: true };
		return { content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }], structuredContent: isRecord(out) ? out : undefined };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { content: [{ type: "text", text: message }], isError: true };
	}
}

const NPM_LATEST = z.object({ version: z.string() });

function isNewer(candidate: string, current: string): boolean {
	const parts = (version: string) => (version.split("-")[0] ?? "").split(".").map(Number);
	const [next, now] = [parts(candidate), parts(current)];
	for (let index = 0; index < 3; index++) {
		const difference = (next[index] ?? 0) - (now[index] ?? 0);
		if (difference !== 0) return difference > 0;
	}
	return false;
}

// The hosted server is always current, but a local install can lag for months behind renamed tools and new routes, so it says so instead of failing quietly.
async function updateNotice(): Promise<string | null> {
	try {
		const res = await fetch("https://registry.npmjs.org/@cutpro/mcp/latest", { signal: AbortSignal.timeout(1500) });
		const latest = NPM_LATEST.safeParse(await res.json());
		if (!latest.success || !isNewer(latest.data.version, SERVER_VERSION)) return null;
		return `CutPro MCP ${SERVER_VERSION} is outdated: version ${latest.data.version} is available. Tell the user to update: restart the AI app if its config runs "npx -y @cutpro/mcp@latest", or change the command to that.`;
	} catch {
		return null;
	}
}

// A remote client has no filesystem to upload from, so it never sees the routes that need one.
function buildServer(creds: Creds, { localFiles, notice = null }: { localFiles: boolean; notice?: string | null }): Server {
	const api = createApi(creds);
	const available = async () => new Map([...(await loadEndpoints())].filter(([, endpoint]) => localFiles || !endpoint.localFiles));
	const server = new Server({ name: "cutpro", version: SERVER_VERSION }, { capabilities: { tools: {} }, instructions: notice ?? undefined });
	let noticePending = notice !== null;

	server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...(await available()).values()].map((endpoint) => endpoint.tool) }));

	server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
		const endpoint = (await available()).get(params.name);
		if (!endpoint) return { content: [{ type: "text", text: `Unknown tool: ${params.name}` }], isError: true };
		const { path, body } = requestFor(endpoint, params.arguments ?? {});
		const result = await run(() => api(endpoint.method, path, body));
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
		res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, mcp-session-id, mcp-protocol-version");
		res.header("Access-Control-Expose-Headers", "mcp-session-id, WWW-Authenticate");
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
		description: "AI clips from long videos: analyze, clip, render and publish via the CutPro API.",
		version: SERVER_VERSION,
		websiteUrl: "https://cut.pro/docs/api-reference/mcp",
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
		res.type("application/json")
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

	const mcp: RequestHandler = (req, res) => {
		const apiKey = oauth ? authedKey(req) : bearerKey(req);
		if (!apiKey) {
			res.status(401).json({ error: "Missing API key" });
			return;
		}
		const server = buildServer({ apiKey, workspaceId: req.header("x-workspace-id") ?? process.env.CUTPRO_WORKSPACE_ID }, { localFiles: false });
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		res.on("close", () => {
			void transport.close();
			void server.close();
		});
		server
			.connect(transport)
			.then(() => transport.handleRequest(req, res, req.body))
			.catch((e: unknown) => {
				if (!res.headersSent) res.status(500).json({ error: e instanceof Error ? e.message : "error" });
			});
	};

	app.post("/", guard ? [express.json(), guard, mcp] : [express.json(), mcp]);

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
	const notice = await updateNotice();
	if (notice) process.stderr.write(`${notice}\n`);
	const server = buildServer({ apiKey, workspaceId: process.env.CUTPRO_WORKSPACE_ID }, { localFiles: true, notice });
	await server.connect(new StdioServerTransport());
}

if (process.env.MCP_TRANSPORT === "http" || process.env.API_MCP_PORT) {
	await startHttp(Number(process.env.API_MCP_PORT ?? process.env.PORT ?? 8787));
} else {
	await startStdio();
}
