# Examples

The same flows the MCP tools run, as plain scripts against the [CutPro API](https://cut.pro/docs/reference). Node.js 18 or newer, no dependencies.

```bash
export CUTPRO_API_KEY=<your-api-key>   # https://cut.pro/studio/me/api-keys
```

Every script shows the price and waits for your `y` before it spends credits.

## Generate a video with AI and post it

```bash
node examples/generate-and-post.mjs "a dog surfing at sunset, golden hour"
MODEL=google/veo-3.1 node examples/generate-and-post.mjs "a neon ramen shop in the rain" <connection_id>
```

It quotes the generation, generates an 8-second vertical video, prints its link and, when you pass connection ids, posts it to those accounts. Without `MODEL`, CutPro picks the cheapest model within 10 points of the best-rated one for that request. See every model with `GET /models`: Veo, Kling, Seedance, Wan, MiniMax, Grok Imagine and more.

## Clip a YouTube video and post the best moment

```bash
node examples/clip-and-post.mjs https://www.youtube.com/watch?v=... <connection_id>
```

It clips the video, picks the highest-rated clip, renders the MP4 and posts it. Set `TEMPLATE_ID` to get every clip with your template's captions and layout.

## Post a live stream's best moments as they happen

```bash
node examples/live-autopost.mjs <monitor_id> <connection_id> 8
```

It checks a monitored channel every minute and posts each new clip rated 8 or more. Create the monitor first with `POST /monitors`.

## Posting

Connection ids come from `GET /connections`. To connect a TikTok, Instagram, YouTube, Facebook, Threads, LinkedIn or Bluesky account, open the link from `GET /connections/link?platform=tiktok`: the account owner signs in on the network itself, and posts go out through its official API.

The examples post to TikTok as `SELF_ONLY` and to YouTube as `private`, so the first runs are only visible to you. Change `metadataFor` in [`api.mjs`](api.mjs) once you like the results.
