import { call, confirm, postTo, until } from "./api.mjs";

const CLIPPING = ["queued", "downloading", "transcribing", "video_analysis", "analyzing", "finalizing"];

const [url, ...connectionIds] = process.argv.slice(2);
if (!url) {
	console.error("Usage: node examples/clip-and-post.mjs https://www.youtube.com/watch?v=... [connection_id ...]");
	process.exit(1);
}

const video = await call("/clips/info", { method: "POST", body: JSON.stringify({ url }) });
if (!(await confirm(`${video.title}: ${video.credits_cost} credits to clip. Go?`))) process.exit(0);

const body = { video_id: video.id, ...(process.env.TEMPLATE_ID && { template_id: process.env.TEMPLATE_ID }) };
const submission = await call("/clips", { method: "POST", body: JSON.stringify(body) });

const base = `/clips/${video.id}/submissions/${submission.id}`;
const done = await until(() => call(base), CLIPPING, 15);
if (done.status === "failed") throw new Error(`Clipping failed: ${done.error_code}`);

const { clips } = await call(`${base}/clips?sort=rating&order=desc&limit=1`);
const best = clips[0];
console.log(`Best clip: ${best.title} (${best.rating}/10)`);

const render = await call(`${base}/clips/${best.id}/render`, { method: "POST" });
const finished = render.from_cache ? render : await until(() => call(`/renders/${render.id}`), ["waiting_quality", "queued", "active"], 10);
if (finished.status !== "completed") throw new Error(`Render ${finished.status}`);
console.log("MP4:", (await call(`/renders/${render.id}/download`)).url);

if (connectionIds.length > 0) await postTo(connectionIds, render.edit_id, best.title);
