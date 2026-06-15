/**
 * Telegram Bot API helpers.
 *
 * Resolves a Telegram `file_id` to a download URL and pulls the bytes
 * back. The credentials live in the assistant's secure key storage under
 * the canonical key `telegram:bot_token` (set up by the bundled
 * `telegram-setup` skill).
 */

import { getSecureKeyAsync } from "@vellumai/plugin-api";

/** Canonical credential key for the Telegram bot token. */
const TELEGRAM_BOT_TOKEN_KEY = "telegram:bot_token";

export interface DownloadedFile {
  /** Bytes the assistant can hand to a transcribe provider. */
  bytes: Uint8Array;
  /** Content-Type the Telegram Bot API returned (e.g. `audio/ogg`). */
  mimeType: string;
  /** Path returned by getFile (e.g. `voice/file_42.oga`). Useful for debugging. */
  filePath: string;
}

export class TelegramAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramAuthError";
  }
}

export class TelegramFileExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramFileExpiredError";
  }
}

/**
 * Resolve a Telegram `file_id` to a download URL using the Bot API.
 *
 * Throws {@link TelegramFileExpiredError} for 404 (file_id is stale —
 * Telegram holds voice files for ~24 h before eviction). Throws
 * {@link TelegramAuthError} for 401 (the bot token was revoked).
 */
export async function resolveDownloadUrl(fileId: string): Promise<{
  url: string;
  botToken: string;
  filePath: string;
}> {
  const botToken = (await getSecureKeyAsync(TELEGRAM_BOT_TOKEN_KEY)).trim();
  if (!botToken) {
    throw new TelegramAuthError(
      "telegram:bot_token is empty — load the telegram-setup skill to provision it.",
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );

  if (response.status === 401) {
    throw new TelegramAuthError(
      "Telegram bot token rejected (401). Re-run the telegram-setup skill.",
    );
  }

  const body = (await response.json()) as {
    ok: boolean;
    result?: { file_path: string };
    description?: string;
  };

  if (!body.ok || !body.result) {
    throw new TelegramFileExpiredError(
      body.description ?? `getFile failed for file_id=${fileId}`,
    );
  }

  const filePath = body.result.file_path;
  return {
    botToken,
    filePath,
    url: `https://api.telegram.org/file/bot${botToken}/${filePath}`,
  };
}

/** Download the bytes of a resolved Telegram file. */
export async function downloadTelegramFile(fileId: string): Promise<DownloadedFile> {
  const { url, filePath } = await resolveDownloadUrl(fileId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new TelegramFileExpiredError(
      `Failed to download Telegram file ${filePath} — HTTP ${response.status}`,
    );
  }
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, mimeType, filePath };
}
