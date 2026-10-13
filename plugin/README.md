# CutPro for Claude

CutPro puts the best AI image and video models in Claude, creates AI personas and turns long videos into short clips.

- **Images and videos with any model.** Veo, Kling, Seedance, Wan, Nano Banana, GPT Image and more: describe it, pick a model or let Claude pick the best one for the price, and animate any image into a video.
- **AI personas.** Realistic people that stay the same in every photo and video, from traits or ready-made characters, put into any video in place of the person in it. Made for UGC, ads and faceless channels.
- **Clips.** The best moments of a long video or a live stream as short captioned vertical clips, rendered and posted to TikTok, Instagram and YouTube. It also transcribes audio and video.

This plugin connects Claude to the hosted CutPro server at `https://mcp.cut.pro` and adds a skill that teaches Claude the CutPro workflows. Claude always tells you the price and asks before generating, starting a job or publishing.

## Install

```bash
claude plugin marketplace add getcutpro/mcp
claude plugin install cutpro@cutpro
```

The first time a CutPro tool runs, Claude opens cut.pro so you can sign in, pick the workspace Claude may use and approve the connection. No API key is needed, and you can disconnect at any time in CutPro under Settings, Connected apps.

## Links

- Documentation: https://cut.pro/docs/api-reference/mcp
- Privacy policy for AI apps: https://cut.pro/ai-privacy
- Terms: https://cut.pro/terms
- Support: https://cut.pro/en/help
