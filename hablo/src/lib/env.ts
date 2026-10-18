/**
 * Central configuration. All secrets are read from the server environment only;
 * nothing here is exposed to the browser except NEXT_PUBLIC_* values.
 */
function v(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export const env = {
  supabaseUrl: () => v("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => v("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => v("SUPABASE_SERVICE_ROLE_KEY"),
  allowedEmail: () => v("HABLO_ALLOWED_EMAIL")?.toLowerCase(),
  demoMode: () => v("HABLO_DEMO_MODE") === "1",
  dataFile: () => v("HABLO_DATA_FILE") ?? ".hablo-data/db.json",
  aiMock: () => v("HABLO_AI_MOCK") === "1",
  appUrl: () => v("NEXT_PUBLIC_APP_URL"),

  anthropicKey: () => v("ANTHROPIC_API_KEY"),
  anthropicModel: () => v("ANTHROPIC_MODEL") ?? "claude-opus-5-5",

  elevenKey: () => v("ELEVENLABS_API_KEY"),
  elevenAgentId: () => v("ELEVENLABS_AGENT_ID"),
  elevenWebhookSecret: () => v("ELEVENLABS_WEBHOOK_SECRET"),
  elevenVoiceDefault: () => v("ELEVENLABS_VOICE_ID"),
  elevenVoiceFemale: () => v("ELEVENLABS_VOICE_ID_FEMALE") ?? v("ELEVENLABS_VOICE_ID"),
  elevenVoiceNarrator: () => v("ELEVENLABS_VOICE_ID_NARRATOR") ?? v("ELEVENLABS_VOICE_ID_FEMALE") ?? v("ELEVENLABS_VOICE_ID"),
  elevenVoiceMale: () => v("ELEVENLABS_VOICE_ID_MALE") ?? v("ELEVENLABS_VOICE_ID"),
  elevenTtsModel: () => v("ELEVENLABS_TTS_MODEL") ?? "eleven_multilingual_v2",
  elevenSttModel: () => v("ELEVENLABS_STT_MODEL") ?? "scribe_v2",
};

export type AppMode = "supabase" | "demo" | "unconfigured";

export function appMode(): AppMode {
  if (env.supabaseUrl() && env.supabaseAnonKey() && env.allowedEmail()) return "supabase";
  if (env.demoMode()) return "demo";
  return "unconfigured";
}

export interface IntegrationStatus {
  mode: AppMode;
  supabase: boolean;
  serviceRole: boolean;
  allowedEmail: boolean;
  anthropic: boolean;
  aiMock: boolean;
  elevenlabs: boolean;
  elevenAgent: boolean;
  elevenWebhook: boolean;
  voices: boolean;
}

export function integrationStatus(): IntegrationStatus {
  return {
    mode: appMode(),
    supabase: !!(env.supabaseUrl() && env.supabaseAnonKey()),
    serviceRole: !!env.supabaseServiceKey(),
    allowedEmail: !!env.allowedEmail(),
    anthropic: !!env.anthropicKey(),
    aiMock: env.aiMock(),
    elevenlabs: !!env.elevenKey(),
    elevenAgent: !!(env.elevenKey() && env.elevenAgentId()),
    elevenWebhook: !!env.elevenWebhookSecret(),
    voices: !!(env.elevenVoiceFemale() || env.elevenVoiceMale()),
  };
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = env.allowedEmail();
  return !!allowed && !!email && email.trim().toLowerCase() === allowed;
}
