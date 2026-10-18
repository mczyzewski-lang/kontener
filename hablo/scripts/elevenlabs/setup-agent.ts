/**
 * Creates (or updates) the private Hablo tutor agent in ElevenLabs.
 *
 *   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID_FEMALE=... npx tsx scripts/elevenlabs/setup-agent.ts
 *
 * - Without ELEVENLABS_AGENT_ID: POST /v1/convai/agents/create and prints the new id
 *   (put it into ELEVENLABS_AGENT_ID).
 * - With ELEVENLABS_AGENT_ID: PATCH /v1/convai/agents/{id} to apply the latest prompt.
 * - With --print: only writes the JSON (docs/elevenlabs-agent.json) for manual setup.
 */
import fs from "node:fs";
import path from "node:path";
import { buildAgentConfig } from "./agent-config";

const API = "https://api.elevenlabs.io";

async function main() {
  const printOnly = process.argv.includes("--print");
  const voiceId = process.env.ELEVENLABS_VOICE_ID_FEMALE ?? process.env.ELEVENLABS_VOICE_ID ?? "<VOICE_ID>";
  const config = buildAgentConfig({
    name: "Hablo — profesora de español",
    voiceId,
    ttsModel: process.env.ELEVENLABS_AGENT_TTS_MODEL ?? "eleven_flash_v2_5",
    llm: process.env.ELEVENLABS_AGENT_LLM ?? "claude-opus-5-5",
    recordVoice: process.env.ELEVENLABS_RECORD_VOICE === "1",
    retentionDays: Number(process.env.ELEVENLABS_RETENTION_DAYS ?? 30),
  });
  const out = path.join(process.cwd(), "docs/elevenlabs-agent.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(config, null, 2) + "\n");
  console.log(`Agent config written to ${path.relative(process.cwd(), out)}`);
  if (printOnly) return;

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Set ELEVENLABS_API_KEY (or use --print).");
  if (voiceId === "<VOICE_ID>") throw new Error("Set ELEVENLABS_VOICE_ID_FEMALE to a Spanish (Spain) voice id from your Voice Library.");
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const res = await fetch(agentId ? `${API}/v1/convai/agents/${agentId}` : `${API}/v1/convai/agents/create`, {
    method: agentId ? "PATCH" : "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${text}`);
  const data = JSON.parse(text) as { agent_id?: string };
  if (agentId) console.log(`Updated agent ${agentId}.`);
  else console.log(`Created agent. Add to your environment:\nELEVENLABS_AGENT_ID=${data.agent_id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
