import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Request, Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { KV } from "./store.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { z } from "zod";

const CLIENT_TTL_S = 90 * 24 * 3600;
const CODE_TTL_S = 600;
// Long enough to sign up and verify a phone on cut.pro before consenting.
const PENDING_TTL_S = 30 * 60;
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_S = 30 * 24 * 3600;
const CIMD_TTL_S = 3600;
const MAX_METADATA_BYTES = 20_000;
const PRIVATE_IPV4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^(22[4-9]|2[3-5]\d)\./];

function isPublicAddress(address: string): boolean {
	const normalized = address.toLowerCase();
	if (normalized.startsWith("::ffff:")) return isPublicAddress(normalized.slice(7));
	if (isIP(normalized) === 4) return !PRIVATE_IPV4.some((range) => range.test(normalized));
	return !(normalized === "::" || normalized === "::1" || /^f[cd]/.test(normalized) || normalized.startsWith("fe80"));
}

async function readLimited(res: globalThis.Response, maxBytes: number): Promise<string | null> {
	const reader = res.body?.getReader();
	if (!reader) return null;
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	return size === 0 ? null : Buffer.concat(chunks).toString("utf8");
}

const CLIENT_METADATA_DOCUMENT = z.object({
	client_id: z.string(),
	client_name: z.string().optional(),
	redirect_uris: z.array(z.string().url()).min(1),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	scope: z.string().optional(),
});

function token(): string {
	return randomBytes(32).toString("base64url");
}

type CodeEntry = { clientId: string; redirectUri: string; codeChallenge: string; scopes: string[]; apiKey: string; expiresAt: number };
type TokenEntry = { clientId: string; scopes: string[]; apiKey: string; expiresAt: number };
type Pending = { clientId: string; clientName: string; redirectUri: string; codeChallenge: string; scopes: string[]; state?: string; expiresAt: number };

export class CutproOAuthProvider implements OAuthServerProvider {
	constructor(
		private apiBase: string,
		private appUrl: string,
		private issuer: string,
		private kv: KV,
	) {}

	get clientsStore(): OAuthRegisteredClientsStore {
		return {
			getClient: async (id) => {
				if (id.startsWith("https://")) return this.metadataDocumentClient(id);
				const raw = await this.kv.get(`client:${id}`);
				if (!raw) return undefined;
				const client: OAuthClientInformationFull = JSON.parse(raw);
				// Sliding expiry: every token exchange reads the client, so a connection in use never loses its registration.
				await this.kv.set(`client:${id}`, raw, CLIENT_TTL_S);
				return client;
			},
			registerClient: async (client) => {
				const full: OAuthClientInformationFull = { ...client, client_id: token(), client_id_issued_at: Math.floor(Date.now() / 1000) };
				await this.kv.set(`client:${full.client_id}`, JSON.stringify(full), CLIENT_TTL_S);
				return full;
			},
		};
	}

	async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
		const pendingId = token();
		const pending: Pending = {
			clientId: client.client_id,
			// cut.pro stores it as the key's name, which holds 100 characters.
			clientName: (client.client_name ?? new URL(params.redirectUri).host).slice(0, 100),
			redirectUri: params.redirectUri,
			codeChallenge: params.codeChallenge,
			scopes: params.scopes ?? [],
			state: params.state,
			expiresAt: Date.now() + PENDING_TTL_S * 1000,
		};
		await this.kv.set(`pending:${pendingId}`, JSON.stringify(pending), PENDING_TTL_S);
		res.redirect(this.connectUrl(pendingId));
	}

	async describeRequest(req: Request, res: Response): Promise<void> {
		const pending = await this.readPending(String(req.params.id ?? ""));
		if (!pending) {
			res.status(404).json({ code: "REQUEST_NOT_FOUND" });
			return;
		}
		res.json({ client_name: pending.clientName, redirect_host: new URL(pending.redirectUri).host });
	}

	async handleConsent(req: Request, res: Response): Promise<void> {
		const body: Record<string, unknown> = req.body ?? {};
		const pendingId = typeof body.pending === "string" ? body.pending : "";
		const pending = await this.readPending(pendingId);
		// cut.pro owns every screen of this flow, so an expired or failed request goes back there to be explained in the user's language.
		if (!pending) {
			res.redirect(this.connectUrl(pendingId));
			return;
		}

		if (body.deny === "1") {
			await this.kv.del(`pending:${pendingId}`);
			res.redirect(this.callbackUrl(pending, { error: "access_denied" }));
			return;
		}

		const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
		if (!apiKey || !(await this.validateKey(apiKey))) {
			res.redirect(`${this.connectUrl(pendingId)}&failed=1`);
			return;
		}

		await this.kv.del(`pending:${pendingId}`);
		const code = token();
		const entry: CodeEntry = {
			clientId: pending.clientId,
			redirectUri: pending.redirectUri,
			codeChallenge: pending.codeChallenge,
			scopes: pending.scopes,
			apiKey,
			expiresAt: Date.now() + CODE_TTL_S * 1000,
		};
		await this.kv.set(`code:${code}`, JSON.stringify(entry), CODE_TTL_S);
		res.redirect(this.callbackUrl(pending, { code }));
	}

	async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
		const raw = await this.kv.get(`code:${authorizationCode}`);
		if (!raw) throw new InvalidGrantError("unknown or used grant");
		const entry: CodeEntry = JSON.parse(raw);
		return entry.codeChallenge;
	}

	async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens> {
		const raw = await this.kv.take(`code:${authorizationCode}`);
		if (!raw) throw new InvalidGrantError("unknown or used grant");
		const entry: CodeEntry = JSON.parse(raw);
		if (entry.clientId !== client.client_id || entry.expiresAt < Date.now()) throw new InvalidGrantError("grant does not belong to this client");
		return this.issueTokens(entry.clientId, entry.scopes, entry.apiKey);
	}

	async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
		const raw = await this.kv.take(`rt:${refreshToken}`);
		if (!raw) throw new InvalidGrantError("unknown or used grant");
		const entry: TokenEntry = JSON.parse(raw);
		if (entry.clientId !== client.client_id) throw new InvalidGrantError("grant does not belong to this client");
		// A key revoked on cut.pro ends the connection here, so the client asks the user to connect again instead of failing on every call.
		if ((await this.keyStatus(entry.apiKey)) === 401) throw new InvalidGrantError("access was revoked");
		return this.issueTokens(entry.clientId, scopes && scopes.length ? scopes : entry.scopes, entry.apiKey);
	}

	async verifyAccessToken(accessToken: string): Promise<AuthInfo> {
		const raw = await this.kv.get(`at:${accessToken}`);
		if (!raw) throw new InvalidTokenError("unknown token");
		const entry: TokenEntry = JSON.parse(raw);
		if (entry.expiresAt < Date.now()) throw new InvalidTokenError("token expired");
		return { token: accessToken, clientId: entry.clientId, scopes: entry.scopes, expiresAt: Math.floor(entry.expiresAt / 1000), extra: { apiKey: entry.apiKey } };
	}

	async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
		await this.kv.del(`at:${request.token}`);
		await this.kv.del(`rt:${request.token}`);
	}

	private async issueTokens(clientId: string, scopes: string[], apiKey: string): Promise<OAuthTokens> {
		const access = token();
		const refresh = token();
		const accessEntry: TokenEntry = { clientId, scopes, apiKey, expiresAt: Date.now() + ACCESS_TTL_S * 1000 };
		const refreshEntry: TokenEntry = { clientId, scopes, apiKey, expiresAt: Date.now() + REFRESH_TTL_S * 1000 };
		await this.kv.set(`at:${access}`, JSON.stringify(accessEntry), ACCESS_TTL_S);
		await this.kv.set(`rt:${refresh}`, JSON.stringify(refreshEntry), REFRESH_TTL_S);
		return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(" ") };
	}

	private async validateKey(apiKey: string): Promise<boolean> {
		return (await this.keyStatus(apiKey)) === 200;
	}

	// Null when the API could not be reached: an outage must not read as a revoked key.
	private async keyStatus(apiKey: string): Promise<number | null> {
		try {
			const res = await fetch(`${this.apiBase}/workspace`, { headers: { "X-Api-Key": apiKey } });
			return res.status;
		} catch {
			return null;
		}
	}

	// CIMD: the client_id is the URL of the client's own metadata, so ChatGPT and Claude never need to register.
	private async metadataDocumentClient(url: string): Promise<OAuthClientInformationFull | undefined> {
		const cached = await this.kv.get(`cimd:${url}`);
		if (cached) {
			const client: OAuthClientInformationFull = JSON.parse(cached);
			return client;
		}

		try {
			const host = new URL(url).hostname;
			// The client picks this URL, so never let it point the server at its own network.
			if (isIP(host) || !host.includes(".")) return undefined;
			const addresses = await lookup(host, { all: true });
			if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) return undefined;

			const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
			const text = res.ok ? await readLimited(res, MAX_METADATA_BYTES) : null;
			if (!text) return undefined;
			const document = CLIENT_METADATA_DOCUMENT.safeParse(JSON.parse(text));
			if (!document.success || document.data.client_id !== url) return undefined;
			const client: OAuthClientInformationFull = { ...document.data, token_endpoint_auth_method: "none" };
			await this.kv.set(`cimd:${url}`, JSON.stringify(client), CIMD_TTL_S);
			return client;
		} catch {
			return undefined;
		}
	}

	private connectUrl(pendingId: string): string {
		return `${this.appUrl}/studio/connect?request=${encodeURIComponent(pendingId)}`;
	}

	// RFC 9207: `iss` on every authorization response lets the client reject a code minted by another server.
	private callbackUrl(pending: Pending, params: Record<string, string>): string {
		const url = new URL(pending.redirectUri);
		for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
		if (pending.state) url.searchParams.set("state", pending.state);
		url.searchParams.set("iss", this.issuer);
		return url.toString();
	}

	private async readPending(pendingId: string): Promise<Pending | null> {
		const raw = pendingId ? await this.kv.get(`pending:${pendingId}`) : null;
		if (!raw) return null;
		const pending: Pending = JSON.parse(raw);
		return pending.expiresAt < Date.now() ? null : pending;
	}
}
