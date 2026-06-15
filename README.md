# telegram-voice-transcribe (plugin v2)

A Vellum plugin that turns Telegram voice notes into text **at the user-prompt-submit hook seam** — before the agent loop ever sees the audio. Voice becomes searchable, copyable text. Original audio stays attached for memory replay.

## How it works

When the assistant receives a Telegram voice note, the hook chain runs `user-prompt-submit` first. This plugin:

1. Walks `ctx.latestMessages` looking for Telegram voice/audio attachments.
2. Calls Telegram's `getFile` Bot API to resolve `file_id` → downloadable URL.
3. Pushes the bytes through the assistant's STT provider (host endpoint > ElevenLabs Scribe > OpenAI Whisper, in order).
4. Replaces the audio ContentBlock with a `[voice transcript, M:SS]` text block.
5. Keeps the original audio as a sidecar for memory replay.

## Install

```
assistant plugins install telegram-voice-transcribe
```

Or, before the marketplace merges, drop the plugin source at `<workspaceDir>/plugins/telegram-voice-transcribe/` and restart the daemon.

## Dependencies

- Bundled `telegram-setup` skill — provisions `telegram:bot_token` in the assistant's secure storage.
- Bundled `transcribe` skill OR a host STT endpoint at `http://localhost:7821/v1/stt/transcribe`.
  Falls back to env-gated `ELEVENLABS_API_KEY` / `OPENAI_API_KEY` for local development.

## Behavior notes

- Hard failures (revoked bot token) halt the hook chain so Marina sees the error instead of silent rewrites.
- Soft failures (file expired, STT returned empty, file too large) leave a `[voice attachment retained — reason]` placeholder so no message is silently lost.
- Only hand-rolled Telegram audio with audio-MIME + `file_id` gets transcribed. Caption text is untouched.

## Layout

```
hooks/
└── user-prompt-submit.ts    plugin hook at the seam
src/
├── telegram.ts              Bot API helpers (getSecureKeyAsync, download)
├── transcribe.ts            STT adapter with provider fallback
├── detect.ts                ContentBlock audio detector
└── format.ts                Message rewriter
skills/
└── telegram-voice-transcribe/   companion SKILL.md for direct skill-mode use
```

## Development

```
bun install
bun run typecheck    # tsc --noEmit
bun test             # bun test
```

Types come from the published `@vellumai/plugin-api` package; the host rebinds runtime singletons (`assistantEventHub`, `getSecureKeyAsync`) at module-load time so the plugin runs in the assistant's process.

## License

MIT.
