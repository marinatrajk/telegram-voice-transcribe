/**
 * Voice → TextContent rewriter.
 *
 * Given a Message whose content blocks contain Telegram voice notes,
 * download each one, transcribe, and rewrite the original blocks into
 * a single TextContent block carrying the transcript plus a short
 * duration tag. The agent loop will treat this as ordinary text from
 * then on.
 */

import { findVoiceBlocks, type CandidateVoiceBlock } from "./detect.js";
import { downloadTelegramFile, TelegramAuthError, TelegramFileExpiredError } from "./telegram.js";
import { transcribeAudio } from "./transcribe.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export interface RewriteOutcome {
  /** The (possibly mutated) message. */
  message: Record<string, unknown>;
  /** Count of audio blocks that became text. */
  transcribed: number;
  /** Count of audio blocks we left as-is because transcription failed soft. */
  preserved: number;
  /** Human-readable notes for the agent log (no logging from here). */
  notes: string[];
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds < 0) return "0:00";
  const total = Math.round(seconds);
  const mm = Math.floor(total / 60).toString();
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function buildTranscriptBlock(
  candidate: CandidateVoiceBlock,
  text: string,
): Record<string, unknown> {
  const duration = formatDuration(candidate.durationSeconds);
  const safeText = text.trim();
  const body = safeText.length > 0 ? safeText : "(no transcript)";
  return {
    type: "text",
    text: `[voice transcript, ${duration}]\n${body}`,
    _originalBlock: candidate.block,
  };
}

function buildPreservedBlock(
  candidate: CandidateVoiceBlock,
  reason: string,
): Record<string, unknown> {
  return {
    type: "text",
    text: `[voice attachment retained — ${reason}]`,
    _originalBlock: candidate.block,
  };
}

/**
 * Rewrite voice blocks inside a single message in place.
 *
 * On hard auth failures (revoked bot token) we throw so the calling
 * hook can stop the chain. On soft failures (expired file, STT returned
 * empty, file too large) we preserve the original block as text so the
 * user knows what happened instead of losing the message.
 */
export async function rewriteMessage(
  message: Record<string, unknown>,
): Promise<RewriteOutcome> {
  const candidates = findVoiceBlocks(message);
  if (candidates.length === 0) {
    return { message, transcribed: 0, preserved: 0, notes: [] };
  }

  const newContent: unknown[] = [];
  let transcribed = 0;
  let preserved = 0;
  const notes: string[] = [];

  // Preserve any non-audio blocks as-is.
  for (const raw of Array.isArray(message.content) ? message.content : []) {
    if (
      !candidates.some((c) => c.block === raw || deepEqual(c.block, raw))
    ) {
      newContent.push(raw);
    }
  }

  for (const candidate of candidates) {
    try {
      const file = await downloadTelegramFile(candidate.fileId);
      if (file.bytes.byteLength > MAX_FILE_BYTES) {
        newContent.push(buildPreservedBlock(candidate, "file too large (>20MB)"));
        preserved++;
        notes.push(`voice too large: ${candidate.fileId}`);
        continue;
      }
      const result = await transcribeAudio({
        bytes: file.bytes,
        mimeType: file.mimeType,
      });
      newContent.push(buildTranscriptBlock(candidate, result.text));
      transcribed++;
    } catch (error) {
      if (error instanceof TelegramAuthError) {
        // Hard failure — bubble up so the hook stops.
        throw error;
      }
      const reason =
        error instanceof TelegramFileExpiredError
          ? "file expired, re-record"
          : "transcription failed";
      newContent.push(buildPreservedBlock(candidate, reason));
      preserved++;
      notes.push(`${reason}: ${candidate.fileId}`);
    }
  }

  // Re-order to mirror the input order: original blocks first, then
  // transcripts in the order they appeared.
  const reordered: unknown[] = [];
  let transcriptIdx = 0;
  for (const raw of Array.isArray(message.content) ? message.content : []) {
    const matched = candidates.find((c) => c.block === raw || deepEqual(c.block, raw));
    if (!matched) {
      reordered.push(raw);
    } else {
      reordered.push(newContent.find((b) => deepEqual(b, raw)) ?? newContent[transcriptIdx]);
      transcriptIdx++;
    }
  }
  // Anything we appended that didn't fit back into the original order.
  for (let i = transcriptIdx; i < newContent.length; i++) reordered.push(newContent[i]);

  message.content = reordered;
  return { message, transcribed, preserved, notes };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}
