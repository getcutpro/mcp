# CutPro for Claude

CutPro turns long videos and live streams into short vertical clips with AI, then renders them and posts them to TikTok, Instagram and YouTube. It also transcribes audio and video into timed captions.

This plugin connects Claude to the hosted CutPro server at `https://mcp.cut.pro` and adds a skill that teaches Claude the CutPro workflows: previewing a video before clipping, following a job until it finishes, rendering clips, following a channel's live broadcasts and publishing with your confirmation.

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
