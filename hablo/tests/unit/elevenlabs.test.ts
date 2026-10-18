import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsError, getConversationToken, speechToText, textToSpeech } from "@/lib/elevenlabs/server";

const ENV = { ...process.env };
beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "xi-test";
  process.env.ELEVENLABS_AGENT_ID = "agent_test";
  process.env.ELEVENLABS_VOICE_ID = "voice_test";
});
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("ElevenLabs server client", () => {
  it("requests a WebRTC token for the private agent with the API key server-side", async () => {
    const f = mockFetch(() => Response.json({ token: "tok_123" }));
    expect(await getConversationToken()).toBe("tok_123");
    const [url, init] = f.mock.calls[0];
    expect(url).toContain("/v1/convai/conversation/token?agent_id=agent_test");
    expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("xi-test");
  });

  it("maps API errors to ElevenLabsError with status and message", async () => {
    mockFetch(() => Response.json({ detail: { message: "invalid_api_key" } }, { status: 401 }));
    await expect(getConversationToken()).rejects.toMatchObject({ status: 401, message: expect.stringContaining("invalid_api_key") });
  });

  it("reports network failures as 502 and missing configuration as 503", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(textToSpeech("hola")).rejects.toBeInstanceOf(ElevenLabsError);
    await expect(textToSpeech("hola")).rejects.toMatchObject({ status: 502 });
    delete process.env.ELEVENLABS_API_KEY;
    await expect(getConversationToken()).rejects.toMatchObject({ status: 503 });
  });

  it("sends Spanish speech-to-text with the Scribe model", async () => {
    const f = mockFetch(() => Response.json({ text: " Necesito tu ayuda ", audio_duration_secs: 2.1 }));
    const r = await speechToText(new Blob([new Uint8Array(2000)], { type: "audio/webm" }));
    expect(r).toEqual({ text: "Necesito tu ayuda", durationSecs: 2.1 });
    const form = f.mock.calls[0][1]?.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("language_code")).toBe("spa");
  });
});
