---
name: telegram-voice-transcribe
description: Transcribe Telegram voice notes and audio attachments into the conversation using the assistant's STT provider. Downloads OGG/Opus from Telegram's getFile API, hands off to the transcribe skill, and replaces the audio with text while keeping the original as an attachment.
compatibility: "Designed for Vellum personal assistants"
metadata:
  emoji: "🎙️"
  vellum:
    category: "channels"
    display-name: "Telegram Voice Transcription"
    activation-hints:
      - "Telegram voice note arrives"
      - "User sends an audio attachment on Telegram"
      - "Inbound message has voice or audio file_id"
    avoid-when:
      - "Voice came from a non-Telegram channel"
      - "Audio is music or media for playback, not speech"
      - "User typed a caption that already says what they meant"
---

You are extending the assistant's Telegram channel behavior so voice notes from the user arrive as searchable, copyable text instead of opaque audio blobs.

## Value Classification

| Value | Type | Storage | Secret? |
|-------|------|---------|---------|
| Telegram bot token | Credential | `credential_store` (`telegram:bot_token`, already provisioned by `telegram-setup`) | Yes |
| Webhook secret | Credential | `credential_store` (`telegram:webhook_secret`, set by `telegram-setup`) | Yes |
| STT provider key | Credential | Owned by the **transcribe** skill | Yes |
| Downloaded audio | Attachment | `attachments/<message_id>/voice.oga` (workspace only) | No |
| Transcript text | Conversation | Replaces audio message body in-conversation | No |
| Voice note file_id from Telegram webhook payload | Input | Gone after step 1, not persisted | No |

The skill **never** reads the Telegram bot token as plaintext. Resolves it at call time via `assistant credentials reveal --service telegram --field bot_token`, or pushes through a credential_execution grant for non-interactive runs.

## Trigger Conditions

Activate only when **all** are true:

- Inbound source is Telegram (the `message` arrived via the platform's `webhooks/telegram/` route, not Slack, Discord, or web).
- The message has a `voice` field OR an `audio` field with a non-empty `file_id`.
- The `telegram:bot_token` credential resolves cleanly.

Skip when:

- Message has `video_note` only (round video without speech is out of scope for v1).
- File size field present and >20 MB. Telegram's bot API limit is 50 MB but transcoding large files is slow; surface the audio attachment and ask Marina to record a shorter note.
- Transcription is already present in `caption` and matches the message intent. Don't double-transcribe.
- Audio looks like music (mime_type starts with `audio/mpeg` AND duration >2 minutes AND no `title`/`performer`). STT will return garbage on music; defer with "I can hear a song but can't transcribe music — what did you want to say?"

## Flow

### Step 1: Resolve file_id to download URL

```bash
BOT_TOKEN=$(assistant credentials reveal --service telegram --field bot_token)
RESP=$(curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${FILE_ID}")
FILE_PATH=$(echo "$RESP" | jq -r '.result.file_path')
```

If `RESP.ok` is `false`, jump to **Error: getFile failed**.

Build the download URL:

```
https://api.telegram.org/file/bot${BOT_TOKEN}/${FILE_PATH}
```

### Step 2: Download the blob

```bash
MESSAGE_ID=<the inbound message_id>
mkdir -p "attachments/${MESSAGE_ID}"
curl -fsSL "https://api.telegram.org/file/bot${BOT_TOKEN}/${FILE_PATH}" \
  -o "attachments/${MESSAGE_ID}/voice.${EXT}"
```

Where `EXT` is derived from `FILE_PATH` (e.g. `oga` from `voice/file_42.oga`, `mp3` from `audio/file_99.mp3`). Telegram gives us extension hints.

### Step 3: Hand off to the transcribe skill

```bash
skill_load skill="transcribe"
# then call with the downloaded file and the message's mime_type
```

Pass the original `mime_type` from the inbound message so the transcribe skill picks the right provider. If `language_hint` is meaningful (Marina's `mk-MK` voice vs an `en-US` voice), pass it. Default to `auto`.

### Step 4: Replace the inbound message body with the transcript

Take the transcribed text and inject into the conversation as the user's message, prefixed with:

```
[voice transcript, <duration formatted as M:SS or H:MM:SS>, <language if known>]
{transcribed text}
```

Keep `from` attribution (Marina's Telegram user ID). Do NOT lose the original timestamp.

### Step 5: Persist the audio for memory

The downloaded blob lives at `attachments/<message_id>/voice.<ext>` and is referenced in the conversation's metadata so the assistant can replay if Marina asks "what did I say about X?" later.

## Error Handling

| Failure | Action |
|---------|--------|
| `getFile` returns `{"ok": false}` or 404 | `file_id` likely expired (>24 h, or the bot lost access). Note the failure in conversation metadata. Surface the original audio attachment to the user with "I can't transcribe this — looks like Telegram dropped the file. Want to re-record?" |
| `getFile` returns 401 | Bot token is revoked or wrong. Tell the user plainly. Do **not** auto-retry. Do **not** fall through to other channels. |
| `transcribe` returns empty | Audio may be silence, music, or low-quality. Append `[audio received, no transcript]` to the conversation as the user's "message" and let the human agent (Marina) help. |
| `transcribe` errors | Keep the audio attachment. Replace inbound with "Couldn't transcribe — keeping the audio. What did you say?" so Marina can re-state if needed. |
| Network timeout on download | Retry once after 2s, then surface the audio attachment and ask Marina to retry. |
| Bot token credential missing entirely | Refuse to run. Tell Marina to load the `telegram-setup` skill first. |

## Security

- Bot token resolved per-call, never logged, never persisted to disk by this skill.
- Downloaded blobs live in workspace `attachments/`, never inside the skill repo or any sync target.
- Audio is not forwarded to any third-party API without the user explicitly installing an external STT provider via the skills catalog.
- If a `language_hint` is auto-detected, preempt `mk-MK` and `en-US` so the STT doesn't over-translate Marina's Macedonian shorthand.

## Installation

```bash
# From GitHub
assistant skills install marinatrajk/telegram-voice-transcribe

# Or via direct URL
assistant skills install https://github.com/marinatrajk/telegram-voice-transcribe
```

The plugin depends on the bundled `telegram-setup` (for the bot token + webhook) and the bundled `transcribe` skill (for STT). Install all three.

## Test Plan

1. Run `assistant skills list` and confirm `telegram-voice-transcribe` is active.
2. Send a 5-second voice note to the bot saying "test voice transcription ping".
3. Verify the agent receives a `[voice transcript]` block, not an opaque attachment.
4. Verify `attachments/<message_id>/voice.oga` exists and is non-empty.
5. Verify a follow-up reply to the same conversation can refer to the transcript by content, not just file.
6. Negative test: send a 25 MB audio file. Verify it falls through to "audio too large" path.
7. Negative test: revoke the bot token (`assistant credentials delete --service telegram --field bot_token`). Verify the skill refuses cleanly without crashing the agent loop.

## Future (not in v1)

- `video_note` round videos (auto-transcribe embedded audio).
- Per-language confidence display (translate low-confidence words differently).
- Optional: surface transcript + audio both, let the conversation context choose.
- Hook-based pretraining so the main agent never even sees audio.
- Tone-aware punctuation preservation for Marina's conversational style.
