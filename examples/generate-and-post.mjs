import { randomUUID } from "node:crypto";
import { call, confirm, postTo } from "./api.mjs";

const [prompt, ...connectionIds] = process.argv.slice(2);
if (!prompt) {
	console.error('Usage: node examples/generate-and-post.mjs "a dog surfing at sunset" [connection_id ...]');
	process.exit(1);
}

const request = {
	kind: "video",
	model: process.env.MODEL ?? "auto",
	preset: "balanced",
	prompt,
	seconds: 8,
	aspect_ratio: "9:16",
};

const quote = await call("/generations/quote", { method: "POST", body: JSON.stringify(request) });
if (!(await confirm(`${quote.model}, ${quote.seconds}s ${quote.aspect_ratio}: ${quote.credits} credits. Generate?`))) process.exit(0);

let generation = await call("/generations?wait=60", {
	method: "POST",
	headers: { "Idempotency-Key": randomUUID() },
	body: JSON.stringify({ ...request, model: quote.model, resolution: quote.resolution, credits: quote.credits }),
});
while (generation.status === "processing") generation = await call(`/generations/${generation.id}?wait=60`);
if (generation.status !== "ready") throw new Error(`Generation ${generation.status}: ${generation.error_code}`);
console.log("Video:", generation.output.url);

if (connectionIds.length === 0) process.exit(0);

const { edit_id } = await call(`/generations/${generation.id}/edit`, { method: "POST" });
await postTo(connectionIds, edit_id, prompt);
