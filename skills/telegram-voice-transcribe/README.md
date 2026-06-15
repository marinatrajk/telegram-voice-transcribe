# telegram-voice-transcribe

A Vellum community plugin that turns Telegram voice notes into searchable conversation text. The agent sees `[voice transcript]` blocks instead of opaque audio, while the original audio stays attached for memory replay.

## Why

Voice notes are how Marina thinks out loud. They should be searchable like messages, not trapped as audio blobs the agent can't quote back.

## What it does

When a Telegram inbound has `voice` or `audio` (with `file_id`), the skill:

1. Calls Telegram's `getFile` to resolve the file_id to a download URL.
2. Downloads the OGG/Opus (or other audio) into `attachments/<message_id>/`.
3. Hands off to the bundled `transcribe` skill.
4. Replaces the inbound message body with a `[voice transcript]` block.
5. Keeps the original audio as an attachment for memory replay.

## Install

```bash
assistant skills add marinatrajk/telegram-voice-transcribe/skills/telegram-voice-transcribe
```

Depends on the bundled `telegram-setup` (for the bot token and webhook) and the bundled `transcribe` skill (for STT). Install all three.

## Test

After install, send the bot a 5-second voice note saying "test voice transcription ping." You should see a transcript block land in the conversation, not raw audio.

## Scope (v1)

In scope:
- `voice` field
- `audio` field, when treated as speech (not music)

Out of scope (v1):
- `video_note` round videos
- Music files
- Files >20 MB
- Hook-based pretraining (skill-mode only in v1; promote to hook in v2 if it works)

## Credits

Built by [Marina Trajkovska](https://github.com/marinatrajk) on top of the bundled Vellum `transcribe` and `telegram-setup` skills. License: MIT.
