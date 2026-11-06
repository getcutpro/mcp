import { createInterface } from "node:readline/promises";

const API = process.env.CUTPRO_API_URL ?? "https://api.cut.pro/api/v1";

if (!process.env.CUTPRO_API_KEY) {
	console.error("Set CUTPRO_API_KEY first. Create a key at https://cut.pro/studio/me/api-keys");
	process.exit(1);
}

export async function call(path, init = {}) {
	const response = await fetch(`${API}${path}`, {
		...init,
		headers: { "X-Api-Key": process.env.CUTPRO_API_KEY, "Content-Type": "application/json", ...init.headers },
	});
	const body = await response.json();
	if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${body.code}`);
	return body;
}

export async function until(read, working, everySeconds) {
	let state = await read();
	while (working.includes(state.status)) {
		await new Promise((resolve) => setTimeout(resolve, everySeconds * 1000));
		state = await read();
	}
	return state;
}

export async function confirm(question) {
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await prompt.question(`${question} [y/N] `);
	prompt.close();
	return answer.trim().toLowerCase() === "y";
}

// Each network takes its own fields; SELF_ONLY and private keep the first runs visible only to you.
export function metadataFor(platform, text) {
	switch (platform) {
		case "tiktok":
			return { tiktok: { title: text, privacyLevel: "SELF_ONLY", isAigc: true } };
		case "youtube":
			return { youtube: { title: text.slice(0, 100), categoryId: "22", privacyStatus: "private" } };
		case "instagram":
			return { instagram: { caption: text } };
		case "facebook":
			return { facebook: { description: text, postType: "reel" } };
		case "threads":
			return { threads: { text } };
		case "linkedin":
			return { linkedin: { text } };
		case "bluesky":
			return { bluesky: { text } };
		default:
			return null;
	}
}

export async function postTo(connectionIds, editId, text) {
	const { connections } = await call("/connections?limit=100");
	const targets = connectionIds.map((id) => {
		const connection = connections.find((item) => item.id === id);
		if (!connection) throw new Error(`Connection ${id} is not in this workspace. List them with GET /connections.`);
		const metadata = metadataFor(connection.platform, text);
		if (!metadata) throw new Error(`This example does not fill ${connection.platform} posts yet.`);
		return { connection_id: id, metadata };
	});

	const post = await call("/posts", { method: "POST", body: JSON.stringify({ videos: [{ edit_id: editId, targets }] }) });
	const done = await until(() => call(`/posts/${post.id}`), ["pending", "processing"], 15);
	for (const item of done.items) console.log(item.platform, item.status, item.published_url ?? item.error_code ?? "");
	return done;
}
