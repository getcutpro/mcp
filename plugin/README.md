# CutPro for Claude

CutPro puts every top AI model in Claude (images, videos, voices, music, sound and 3D), creates AI characters and turns long videos into short clips.

- **Generate with any model.** Images and videos with Veo, Kling, Seedance, Wan, Nano Banana and GPT Image; voices with ElevenLabs and Gemini; songs and soundtracks with Suno, Eleven Music and MiniMax; sound effects; talking avatars; 3D models with Rodin, Hunyuan3D and TRELLIS; and image and video tools that upscale, remove backgrounds and edit. Claude tells you the exact price first.
- **AI characters.** Realistic people that stay the same in every photo and video, from traits or ready-made characters, put into any video in place of the person in it. Made for UGC, ads and faceless channels.
- **Clips.** The best moments of a long video or a live stream as short captioned vertical clips, rendered and ready to post.
- **Posts and scheduling.** Any clip, generated video or persona video goes to TikTok, Instagram, YouTube, Facebook, Threads, LinkedIn, Pinterest or Bluesky, now or scheduled. Missing an account? Claude gives you the link to connect it and carries on.
- **Transcription.** Any audio or video into timed captions (SRT, VTT, text or JSON), ready to summarize or translate.

Ask in any language: "make a product ad with Veo", "create a lo-fi track for my videos", "make this photo talk", "remove the background of this image", "turn this video into shorts and schedule them".

This plugin connects Claude to the hosted CutPro server at `https://mcp.cut.pro` and adds a skill that teaches Claude the CutPro workflows. Claude always tells you the price and asks before generating, starting a job or publishing.

## Install

```bash
claude plugin marketplace add getcutpro/mcp
claude plugin install cutpro@cutpro
```

The first time a CutPro tool runs, Claude opens cut.pro so you can sign in, pick the workspace Claude may use and approve the connection. No API key is needed, and you can disconnect at any time in CutPro under Settings, Connected apps.

## Links

- Documentation: https://cut.pro/docs/mcp
- Privacy policy for AI apps: https://cut.pro/ai-privacy
- Terms: https://cut.pro/terms
- Support: https://cut.pro/en/help
