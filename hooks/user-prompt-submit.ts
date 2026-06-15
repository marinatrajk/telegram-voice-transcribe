/**
 * `user-prompt-submit` hook — runs once per user turn, immediately
 * before the agent loop receives `runMessages`. This is the seam
 * where we rewrite Telegram voice notes into text so they reach the
 * model as searchable, copyable content rather than opaque blobs.
 *
 * Strategy:
 *   1. Walk `ctx.latestMessages` looking for Telegram voice notes.
 *   2. For each voice note: download from Telegram, hand to the
 *      assistant's STT provider, swap the content block for a
 *      `[voice transcript, M:SS]` text block.
 *   3. Log every outcome (count + errors) so Marina can debug from
 *      the agent log if a transcription looks off.
 *
 * Hard failures (revoked bot token) propagate so the chain stops and
 * the user sees the auth error instead of silent rewrites. Soft
 * failures (expired file, STT returned empty, file too large) leave a
 * human-readable placeholder text so no message is silently lost.
 *
 * Convention: default export is the function the harness invokes.
 */

import type {
  PluginLogger,
  UserPromptSubmitContext,
} from "@vellumai/plugin-api";
import { rewriteMessage } from "../src/format.js";
import { TelegramAuthError } from "../src/telegram.js";

export default async function userPromptSubmit(
  ctx: UserPromptSubmitContext,
): Promise<void> {
  if (!Array.isArray(ctx.latestMessages) || ctx.latestMessages.length === 0) {
    return;
  }

  let transcribed = 0;
  let preserved = 0;
  let authFailures = 0;
  const errorNotes: string[] = [];

  for (const message of ctx.latestMessages) {
    if (!message || typeof message !== "object") continue;
    const msgObj = message as Record<string, unknown>;
    try {
      const outcome = await rewriteMessage(msgObj);
      transcribed += outcome.transcribed;
      preserved += outcome.preserved;
      for (const note of outcome.notes) errorNotes.push(note);
    } catch (error) {
      if (error instanceof TelegramAuthError) {
        authFailures++;
        ctx.logger?.error?.(
          { plugin: "telegram-voice-transcribe", err: error.message },
          "telegram bot token rejected — voice transcription disabled for this turn",
        );
        // Bubble up so the chain halts.
        throw error;
      }
      const note = error instanceof Error ? error.message : String(error);
      errorNotes.push(note);
      ctx.logger?.warn?.(
        { plugin: "telegram-voice-transcribe", err: note },
        "voice rewrite failed for a message",
      );
    }
  }

  if (transcribed > 0 || preserved > 0 || authFailures > 0) {
    ctx.logger?.info?.(
      {
        plugin: "telegram-voice-transcribe",
        transcribed,
        preserved,
        authFailures,
        errors: errorNotes.slice(0, 5),
      },
      "telegram-voice-transcribe processed messages",
    );
  }
}
