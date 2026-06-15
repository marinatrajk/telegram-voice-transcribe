# Error states we hit while building this

This is a working log. When the skill breaks, we add a row. When we fix it, we leave a one-liner.

## Status

Skipping real captures for now; this file is a placeholder for production runs.

## Common shapes

- `getFile` returning `{"ok": false, "error_code": 400, "description": "Bad Request: file is too big"}` — happens above 20 MB. Surface audio as attachment, ask Marina to re-record shorter.
- `transcribe` returning `{"transcript": "", "language": "en", "confidence": 0.0}` — silent recording. Don't pretend it's a message.
- Bot token revoked mid-call — credentials reveal throws. Refuse silently rather than crash the agent loop.

## When in doubt

Always keep the audio attachment. Even when STT fails, the original audio is the source of truth for what was actually said.
