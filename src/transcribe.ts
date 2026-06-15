/**
 * Speech-to-text adapter.
 *
 * The assistant's STT provider is wired via the bundled `transcribe`
 * skill, which exposes an MCP tool. Use that tool rather than reaching
 * for a vendor SDK directly: routing through the config-driven provider
 * means the plugin automatically follows whatever STT the user has
 * configured (Whisper, ElevenLabs Scribe, Deepgram, etc.).
 *
 * This module deliberately keeps the surface narrow — the hook only
 * needs "given bytes + mime type, return text".
 */

export interface TranscriptionRequest {
  /** Raw audio bytes (Opus/OGG, MP3, M4A, …). */
  bytes: Uint8Array;
  /** Original MIME type forwarded from the Telegram file. */
  mimeType: string;
  /** Optional language hint (`mk-MK`, `en-US`, or `auto`). */
  language?: string;
}

export interface TranscriptionResult {
  /** Transcribed text. Empty string if STT returned no speech. */
  text: string;
  /** Detected or hinted language in BCP-47 form. */
  language?: string;
  /** Provider's confidence, if it returned one. Opaque 0..1. */
  confidence?: number;
}

/**
 * Call the assistant's configured STT provider.
 *
 * Inside a hook we can't `import { runTool }` from the plugin-api; the
 * stable path is to delegate to the assistant's LLM by injecting a
 * model-only `additionalContext` message via the *next* hook chain
 * step. For the user-prompt-submit seam we don't have a downstream
 * model-call yet, so we run the bundled `transcribe` skill from here.
 *
 * Implementation note: in v1 the hook invokes the provider over HTTP —
 * the assistant daemon exposes a stable `POST /v1/stt/transcribe`
 * endpoint that accepts multipart form data and proxies to whichever
 * STT provider the user has configured. If that endpoint isn't
 * available in your environment, fall back to the env-gated path
 * defined in {@link transcribeWithEnvKey}.
 */
export async function transcribeAudio(
  request: TranscriptionRequest,
): Promise<TranscriptionResult> {
  // Prefer the host-provided endpoint if reachable.
  const endpoint = process.env.VELLUM_STT_ENDPOINT ?? "http://localhost:7821/v1/stt/transcribe";
  try {
    const form = new FormData();
    const blob = new Blob([request.bytes], { type: request.mimeType });
    form.append("file", blob, "voice.oga");
    if (request.language) form.append("language", request.language);
    const response = await fetch(endpoint, { method: "POST", body: form });
    if (response.ok) {
      const body = (await response.json()) as {
        text: string;
        language?: string;
        confidence?: number;
      };
      return {
        text: (body.text ?? "").trim(),
        language: body.language,
        confidence: body.confidence,
      };
    }
  } catch {
    // fall through to env-key path
  }

  return transcribeWithEnvKey(request);
}

/**
 * Fallback: use whichever provider key is present in the environment.
 *
 * Keeps the plugin testable on a dev workstation without spinning up
 * the whole assistant runtime.
 */
async function transcribeWithEnvKey(
  request: TranscriptionRequest,
): Promise<TranscriptionResult> {
  if (process.env.ELEVENLABS_API_KEY) {
    return transcribeWithElevenLabs(request);
  }
  if (process.env.OPENAI_API_KEY) {
    return transcribeWithOpenAI(request);
  }
  // Nothing reachable. Return an empty transcript so the caller can
  // surface a graceful "audio received, no transcript" fallback.
  return { text: "" };
}

async function transcribeWithElevenLabs(
  request: TranscriptionRequest,
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([request.bytes], { type: request.mimeType }),
    "voice.oga",
  );
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1");
  if (request.language) form.append("language", request.language);
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: form,
  });
  if (!response.ok) {
    return { text: "" };
  }
  const body = (await response.json()) as {
    text: string;
    language?: string;
  };
  return { text: (body.text ?? "").trim(), language: body.language };
}

async function transcribeWithOpenAI(
  request: TranscriptionRequest,
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([request.bytes], { type: request.mimeType }),
    "voice.oga",
  );
  form.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
  if (request.language) form.append("language", request.language);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!response.ok) {
    return { text: "" };
  }
  const body = (await response.json()) as { text: string };
  return { text: (body.text ?? "").trim() };
}
