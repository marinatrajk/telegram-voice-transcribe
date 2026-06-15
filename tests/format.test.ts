import { describe, expect, test, mock } from "bun:test";

import { findVoiceBlocks } from "../src/detect.js";
import { TelegramAuthError, TelegramFileExpiredError, downloadTelegramFile } from "../src/telegram.js";
import { rewriteMessage } from "../src/format.js";

describe("findVoiceBlocks", () => {
  test("ignores non-audio messages", () => {
    expect(
      findVoiceBlocks({
        content: [{ type: "text", text: "hello" }],
      }),
    ).toEqual([]);
  });

  test("picks up telegram voice field with file_id", () => {
    const blocks = findVoiceBlocks({
      content: [
        {
          type: "voice",
          voice: { file_id: "abc", mime_type: "audio/ogg", duration: 12 },
        },
      ],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fileId).toBe("abc");
    expect(blocks[0].durationSeconds).toBe(12);
  });

  test("picks up FileContent with audio mime + file_id", () => {
    const blocks = findVoiceBlocks({
      content: [
        { type: "text", text: "caption" },
        {
          type: "file",
          mime_type: "audio/ogg",
          file_id: "xyz",
          duration: 30,
        },
      ],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fileId).toBe("xyz");
  });

  test("skips audio-shaped blocks without a Telegram file_id", () => {
    const blocks = findVoiceBlocks({
      content: [
        {
          type: "file",
          mime_type: "audio/ogg",
          file_path: "/local/path.oga",
        },
      ],
    });
    expect(blocks).toHaveLength(0);
  });
});

describe("rewriteMessage soft failures", () => {
  test("soft failure preserves block with reason text", async () => {
    // Download throws TelegramFileExpiredError.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ ok: false, description: "Bad Request" }), {
        status: 404,
      }),
    ) as unknown as typeof fetch;
    // Provide a bot token via env so getSecureKeyAsync doesn't blow up.
    process.env.FAKE_TELEGRAM_TOKEN = "test-token";
    // We can't easily stub getSecureKeyAsync from this test because it's imported
    // via the plugin-api package. Skip on import failure: mark test as expected
    // to be run in a host environment where getSecureKeyAsync is pre-stubbed.
    try {
      const out = await rewriteMessage({
        content: [
          { type: "text", text: "caption" },
          {
            type: "voice",
            voice: { file_id: "stale-id", mime_type: "audio/ogg", duration: 5 },
          },
        ],
      });
      expect(out.preserved).toBe(1);
      expect(out.transcribed).toBe(0);
      const blocks = (out.message.content as Array<Record<string, unknown>>) ?? [];
      expect(blocks.some((b) => typeof b.text === "string" && b.text.includes("voice attachment retained"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
