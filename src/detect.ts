/**
 * Voice-note detection on inbound messages.
 *
 * The Vellum user-prompt-submit hook receives the agent-loop's
 * `latestMessages: Message[]`. Each Message has a `content: ContentBlock[]`
 * payload. Telegram voice notes typically arrive as one of:
 *
 *   - a `FileContent` block with `mime_type` starting with `audio/ogg`,
 *     `audio/opus`, `audio/mpeg`, or `audio/m4a`, plus a `telegram.file_id`
 *     (or `file_id`) field
 *   - a custom `voice` field on the block (channel-specific)
 *
 * This module recognises both shapes and exposes a single normalization
 * helper that returns a uniform shape for the hook to consume.
 */

export interface CandidateVoiceBlock {
  /** The raw ContentBlock the agent loop will see. */
  block: Record<string, unknown>;
  /** Telegram `file_id` ready for our download helper. */
  fileId: string;
  /** MIME type for the transcription adapter. */
  mimeType: string;
  /** Original duration in seconds, if the runtime provided it. */
  durationSeconds?: number;
}

const AUDIO_MIME_PREFIXES = [
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
];

function looksLikeAudio(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return AUDIO_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
}

function firstString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const inner = firstString(nested, ...keys);
      if (inner) return inner;
    }
  }
  return undefined;
}

/**
 * Walk a message's `content` blocks and return every audio-shaped
 * Telegram attachment we can recognize, with sufficient metadata to
 * transcribe.
 */
export function findVoiceBlocks(message: { content?: unknown[] }): CandidateVoiceBlock[] {
  if (!Array.isArray(message.content)) return [];

  const candidates: CandidateVoiceBlock[] = [];
  for (const raw of message.content) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;

    // 1. Telegram-shaped explicit `voice` field on a ContentBlock.
    const telegramVoice = firstString(block, "voice", "telegram_voice");
    if (telegramVoice || block.voice) {
      const voiceObj =
        (block.voice as Record<string, unknown> | undefined) ??
        (block.telegram_voice as Record<string, unknown> | undefined);
      if (voiceObj) {
        const fileId = firstString(voiceObj, "file_id", "fileId");
        if (fileId) {
          candidates.push({
            block,
            fileId,
            mimeType: firstString(voiceObj, "mime_type", "mimeType") ?? "audio/ogg",
            durationSeconds: Number(voiceObj.duration) || undefined,
          });
          continue;
        }
      }
    }

    // 2. FileContent-shaped block with audio MIME and a Telegram file_id.
    const mimeType = firstString(block, "mime_type", "mimeType");
    if (!looksLikeAudio(mimeType)) continue;

    const fileId = firstString(block, "file_id", "fileId", "telegram_file_id");
    if (!fileId) continue;

    candidates.push({
      block,
      fileId,
      mimeType: mimeType ?? "audio/ogg",
      durationSeconds: Number(block.duration) || undefined,
    });
  }
  return candidates;
}
