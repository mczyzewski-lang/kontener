import "server-only";
import { env, appMode } from "@/lib/env";
import { aiProvider } from "@/lib/ai/client";
import type { Capabilities } from "@/components/capabilities";

export function serverCapabilities(): Capabilities {
  return {
    mode: appMode() === "demo" ? "demo" : "private",
    tts: !!env.elevenKey() && !!(env.elevenVoiceDefault() || env.elevenVoiceFemale()),
    stt: !!env.elevenKey(),
    voice: !!(env.elevenKey() && env.elevenAgentId()),
    ai: aiProvider() !== null,
    aiMock: aiProvider() === "mock",
  };
}
