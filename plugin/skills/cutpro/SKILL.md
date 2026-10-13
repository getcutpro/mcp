---
name: cutpro
description: Generate AI images and videos with any top model (Veo, Kling, Seedance, Wan, Nano Banana, GPT Image and more), create realistic AI personas and swap them into videos, and turn long videos and live streams into short clips with CutPro, then render and publish them. Use when the user wants to generate or animate an image or a video, make an AI person or character, put a persona into a video, clip a YouTube, Twitch, Kick or TikTok video, follow a channel's lives, render or download a clip, post or schedule posts to TikTok, Instagram, YouTube and other connected accounts, connect a social account, or transcribe audio and video into captions.
license: MIT
---

# CutPro

Every CutPro tool maps to one endpoint of the CutPro API and answers with the API's own JSON. In clients that show MCP Apps, generations, personas, clips and renders open in a CutPro player that follows the job until it is ready, so there is no need to poll or paste links when the player is on screen. Errors come back as `{ "code": "...", "extra": { ... } }`: switch on `code`, never on wording. Talk to the user in their language.

## Spend and publish only after the user agrees

Tools that spend credits or publish (`create_generation`, `create_persona`, `regenerate_persona`, `create_persona_video`, `create_submission`, `retry_submission`, `create_transcription`, `create_monitor`, `start_monitor`, `create_post`, `publish_post`, `retry_post_item`) are marked destructive. Before calling one, say what it will do and what it costs, and wait for a yes. The price is always free to read first: `list_generation_models` for images and videos, `get_persona_catalog` and `quote_persona_swap` for personas, `analyze_video` for clipping.

## Generate images and videos with any model

1. `list_generation_models` lists every image and video model available right now, with the modes, resolutions, durations, aspect ratios and price of each. When the user names no model, pick from `presets` (`fast`, `balanced`, `best`); when they name one ("make it with Veo", "use Kling"), match it by `name`.
2. Work out the total: the model's `credits` for the mode and resolution, times `seconds` for a video (`silent_credits` when `audio` is `false`). Tell the user the model, what will be made and the total, and wait for a yes.
3. `create_generation` with `kind`, `model`, `mode`, `prompt`, `aspect_ratio` (`9:16` for TikTok, Reels and Shorts), `seconds` for a video, and `credits` set to that total. `PRICE_CHANGED` charges nothing and brings the new total in `extra.credits`: tell the user and ask again.
4. Poll `get_generation` every 10 seconds until `status` is `ready` or `failed`. `expected_seconds` says how long the model usually takes. A failed generation gives its credits back on its own. A ready video has an `edit_id`, so it can be posted or scheduled right away (see Publish and schedule).
5. Show `output.url`. `download_generation` gives the full-quality file, but once taken the credits can no longer be asked back, so only call it when the user wants the file.

To animate an image the user just generated, call `create_generation` again with `kind: "video"`, `mode: "image"` and its `output.image_id` in `image_ids`. `mode: "frames"` goes from a first to a last image, and `mode: "references"` borrows a person, product or style from images (or edits them, for an image). Pictures from the user's disk go up with `upload_generation_image`, available on the local server only. Check `refuses`: some models turn down real faces, minors or public figures.

## AI personas

A persona is a realistic AI person that stays the same across photos and videos, for UGC, ads and faceless channels.

1. `get_persona_catalog` has every trait, the defaults and the prices. `list_persona_presets` offers ready-made characters, and `create_persona_from_preset` starts from one.
2. `create_persona` with the traits the user describes (`chips`). A persona of the user's own face needs `upload_persona_face` first (local server only, and only their own face, as an adult).
3. Poll `get_persona` until the photo is ready and show it. `regenerate_persona` makes a new photo or applies a one-line edit (`note`); every photo is kept in `versions`.
4. `save_persona` keeps it, with a name.
5. To put the persona in a video, the video has to be in the library: `create_persona_source_upload` and `complete_persona_source_upload` (local server only), or a `media_id` already there. `quote_persona_swap` gives the price, and `create_persona_video` with that price replaces the main person while the scene, camera, motion and sound stay. Poll `get_persona_video` until `download_url` is set.

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

## Publish and schedule

Anything with an `edit_id` can be posted: a rendered clip, a broadcast clip, a generated video or a persona video.

1. `list_connections` shows the social accounts connected to the workspace. When the account the user wants is missing, call `get_connection_link` with that network and give the user the link: it opens that network's sign-in on cut.pro, in this workspace, in one click. Then call `list_connections` again and carry on: the user never has to start over.
2. `create_post` with the `edit_id`s and the chosen `connection_id`s, and per-network `metadata` (title, caption). Pass `scheduled_at` (ISO 8601, in the future, in the user's time zone converted to UTC) to schedule it; leave it out to publish now. Publishing is public and cannot be taken back, so confirm the caption, the accounts and the time first.
3. `list_posts` shows what is scheduled and what went out. `update_post` moves a scheduled post or changes its text, and `cancel_post` cancels it before it goes out.
4. Poll `get_post`. A failed item is retried with `retry_post_item` without touching the ones already published.

## Transcribe

Turns the speech of any video or audio into timed captions, with optional speaker labels, without clipping or rendering anything.

1. A file from the user's disk goes up with `create_transcription_upload` (local server only); a video already in the library is used by its `media_id`.
2. `create_transcription`, then poll `get_transcription` until it is ready.
3. `get_transcription_cues` gives the timed text as JSON, good for summarizing, quoting or translating it in the chat. `download_transcription` gives an SRT, VTT or TXT file to hand over.

## When something fails

- `INSUFFICIENT_CREDITS`: tell the user the job needs `extra.credits_needed` credits. When `extra.top_up_url` is set, hand it over: it is where credits are bought. Otherwise credits are managed on cut.pro.
- `TOO_MANY_RUNNING`: the workspace already has the most generations running at once. Wait for one to finish.
- `RATE_LIMIT_EXCEEDED`: wait `extra.retry_after` seconds before calling again.
- `409` codes such as `VIDEO_ALREADY_PROCESSING` or `RENDER_ALREADY_IN_PROGRESS`: the work is already running, so poll it instead of starting it again.
- `410` codes such as `SUBMISSION_EXPIRED` or `RECORDING_EXPIRED`: the material is gone. Offer to submit the video again; an existing `edit_id` still renders with `create_render`.
