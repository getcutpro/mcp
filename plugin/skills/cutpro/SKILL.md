---
name: cutpro
description: Turn long videos and live streams into short clips with CutPro, then render and publish them. Use when the user wants to clip a YouTube, Twitch, Kick or TikTok video, follow a channel's lives, render or download a clip, post clips to TikTok, Instagram or YouTube, or transcribe audio and video.
license: MIT
---

# CutPro

Every CutPro tool maps to one endpoint of the CutPro API and answers with the API's own JSON. Errors come back as `{ "code": "...", "extra": { ... } }`: switch on `code`, never on wording. Talk to the user in their language.

## Spend and publish only after the user agrees

Tools that spend credits or publish (`create_submission`, `retry_submission`, `create_transcription`, `create_monitor`, `start_monitor`, `create_post`, `publish_post`, `retry_post_item`) are marked destructive. Before calling one, say what it will do and what it costs, and wait for a yes. `analyze_video` is free and gives the exact cost: call it first.

## Clip a video

1. `analyze_video` with the public URL. Show the title, duration and `credits_cost`. When `credits_unlimited` is true the job is not billed.
2. After the user agrees, `create_submission` with the `id` from step 1 as `video_id`. Pass `template_id` (from `list_templates`) to style every clip, and `translate_to` to translate the captions.
3. Poll `get_submission` about every 10 seconds until `status` is `completed` or `failed`. A set `waiting_reason` is not an error: the source is a premiere, a live still on air, or a recording the platform is still publishing, and the job resumes on its own. Tell the user instead of polling for hours.
4. `list_clips` returns the clips best rated first. Present titles, `rating` and the start and end times.
5. `render_clip` makes the final MP4. Poll `get_render` until `completed`, then `download_render` gives a signed link to hand to the user.

A failed submission runs again with `retry_submission`, with the same settings.

## Follow a channel's lives

1. `create_monitor` with the channel URL and `type: "live"`. CutPro clips each broadcast while it airs, a batch every 10 minutes, charged per batch that produced clips.
2. `list_broadcasts` shows the channel's broadcasts; `ended_at: null` means it is on air.
3. `list_broadcast_clips` lists the clips of one broadcast, and `render_broadcast_clip` renders one.
4. `stop_monitor` stops it. Monitoring has to stay on for at least 10 minutes first; earlier, `extra.remaining_seconds` says how long to wait.

A `type: "video"` monitor clips each new upload instead, and those clips arrive as regular submissions in `list_videos`.

## Publish

1. `list_connections` shows the accounts connected on cut.pro. Connecting a new account happens on cut.pro, not here.
2. `create_post` with the clips' `edit_id` and the chosen `connection_id`s, now or scheduled. Publishing is public and cannot be taken back, so confirm the caption, the accounts and the time first.
3. Poll `get_post`. A failed item is retried with `retry_post_item` without touching the ones already published.

## Transcribe

`create_transcription` with a `media_id` already in the library, then `get_transcription` until it is ready, and `get_transcription_cues` (timed JSON) or `download_transcription` (SRT, VTT or TXT).

## When something fails

- `INSUFFICIENT_CREDITS`: tell the user the job needs `extra.credits_needed` credits and the workspace has `extra.current_balance`. Credits are managed on cut.pro.
- `RATE_LIMIT_EXCEEDED`: wait `extra.retry_after` seconds before calling again.
- `409` codes such as `VIDEO_ALREADY_PROCESSING` or `RENDER_ALREADY_IN_PROGRESS`: the work is already running, so poll it instead of starting it again.
- `410` codes such as `SUBMISSION_EXPIRED` or `RECORDING_EXPIRED`: the material is gone. Offer to submit the video again; an existing `edit_id` still renders with `create_render`.
