import { call, metadataFor } from "./api.mjs";

const [monitorId, connectionId, minRating = "8"] = process.argv.slice(2);
if (!monitorId || !connectionId) {
	console.error("Usage: node examples/live-autopost.mjs <monitor_id> <connection_id> [min_rating]");
	process.exit(1);
}

const { connections } = await call("/connections?limit=100");
const connection = connections.find((item) => item.id === connectionId);
if (!connection) throw new Error(`Connection ${connectionId} is not in this workspace.`);
if (!metadataFor(connection.platform, "")) throw new Error(`This example does not fill ${connection.platform} posts yet.`);

// Kept in memory: a restart posts again what was already posted, so store these ids somewhere durable in production.
const posted = new Set();

while (true) {
	const { broadcasts } = await call(`/monitors/${monitorId}/broadcasts?limit=1`);
	const live = broadcasts[0];

	if (live && !live.recording_expired) {
		const { clips } = await call(`/monitors/${monitorId}/broadcasts/${live.id}/clips?min_rating=${minRating}&limit=100`);
		for (const clip of clips.filter((item) => item.edit_id && !posted.has(item.id))) {
			const targets = [{ connection_id: connectionId, metadata: metadataFor(connection.platform, clip.title) }];
			const post = await call("/posts", { method: "POST", body: JSON.stringify({ videos: [{ edit_id: clip.edit_id, targets }] }) });
			posted.add(clip.id);
			console.log(`Posting "${clip.title}" (${clip.rating}/10): post ${post.id}`);
		}
	}

	await new Promise((resolve) => setTimeout(resolve, 60_000));
}
