Adds `telegram-voice-transcribe` to the curated plugin marketplace.

The plugin transcribes Telegram voice notes and audio attachments
**at the `user-prompt-submit` hook seam**, so the model sees text
instead of opaque audio. Depends on the bundled `telegram-setup`
and `transcribe` skills; uses the assistant's STT provider via
`/v1/stt/transcribe` (or env-gated ElevenLabs / OpenAI fallback).

Layout matches `level-up` / `simple-memory` (peerDeps
`@vellumai/plugin-api ^0.8.0`, hook file under `hooks/<name>.ts`,
companion skill under `skills/<name>/`).

- Repo: github.com/marinatrajk/telegram-voice-transcribe
- Pinned ref: full commit SHA (per /docs/extensibility/distribution)
- Category: `channels`
- Author: marinatrajk (Vellum employee, GTM Engineer)
