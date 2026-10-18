"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Loader2, Mic, MicOff, PhoneOff, RefreshCw, Send, WifiOff, X } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useCapabilities } from "@/components/capabilities";
import { AnswerInput } from "@/components/answer-input";
import { PlayButton } from "@/components/play-button";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import { CONTROL_ACTIONS, type ControlAction } from "@/lib/learning/actions";
import { cn } from "@/lib/utils";

type Mode = "guided" | "natural" | "real_life" | "assessment" | "grammar";
interface Props {
  scenarioId: string | null;
  grammarTopicId: string | null;
  mode: Mode;
  planItemId: string | null;
  forceText: boolean;
}
interface StartResponse {
  sessionId: string;
  channel: "voice" | "text";
  mode: Mode;
  character: { name: string; role: string; title: string; goals: string[]; keyPhrases: string[] };
  firstMessage: string;
  actions: ControlAction[];
  showTranslationDefault: boolean;
  showSubtitlesDefault: boolean;
  voice: null | {
    conversationToken?: string;
    signedUrl?: string;
    connectionType: "webrtc" | "websocket";
    dynamicVariables: Record<string, string>;
    overrides: { agent: { firstMessage: string; language: "es" }; tts: { voiceId?: string; speed: number } };
    userId: string;
  };
}
interface Line {
  role: "user" | "agent" | "action";
  text: string;
  time: number;
  action?: ControlAction;
}

const MODE_LABEL: Record<Mode, string> = {
  guided: "Rozmowa prowadzona",
  natural: "Rozmowa naturalna",
  real_life: "Symulacja z życia",
  assessment: "Test tygodniowy",
  grammar: "Praktyka gramatyki",
};

export function ConversationScreen(props: Props) {
  const caps = useCapabilities();
  const voice = caps.voice && !props.forceText;
  if (!voice && !caps.ai) {
    return (
      <div className="mt-20 space-y-4 text-center">
        <p>Rozmowy wymagają ElevenLabs (głos) albo Claude API (tryb tekstowy).</p>
        <Button asChild variant="secondary">
          <Link href="/settings">Zobacz status integracji</Link>
        </Button>
      </div>
    );
  }
  return voice ? (
    <ConversationProvider>
      <VoiceConversation {...props} />
    </ConversationProvider>
  ) : (
    <TextConversation {...props} />
  );
}

function useFinish(planItemId: string | null) {
  const router = useRouter();
  return useCallback(
    async (sessionId: string, payload: { elevenConversationId: string | null; localTranscript: { role: "user" | "agent"; text: string; time: number }[]; durationSecs: number; counters: Record<string, number> }) => {
      await api(`/api/conversation/${sessionId}/finish`, { method: "POST", json: payload });
      router.push(`/speak/report/${sessionId}${planItemId ? `?item=${planItemId}` : ""}`);
    },
    [router, planItemId],
  );
}

function Intro({
  data,
  mode,
  busy,
  error,
  onStart,
  subtitles,
  setSubtitles,
  translation,
  setTranslation,
  channel,
}: {
  data: { title: string; name: string; role: string; goals: string[] } | null;
  mode: Mode;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  subtitles: boolean;
  setSubtitles: (v: boolean) => void;
  translation: boolean;
  setTranslation: (v: boolean) => void;
  channel: "voice" | "text";
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="py-2">
        <Link href="/speak" aria-label="Zamknij" className="-ml-2 inline-flex rounded-full p-2 text-muted hover:bg-sunken">
          <X className="size-6" />
        </Link>
      </div>
      <div className="mt-6 flex-1">
        <Badge tone="accent">{MODE_LABEL[mode]}</Badge>
        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight">{data?.title ?? "Rozmowa"}</h1>
        {data && (
          <p className="mt-1 text-muted">
            Rozmówca: {data.name}, {data.role}
          </p>
        )}
        {data?.goals.length ? (
          <ul className="mt-5 space-y-1.5 text-[15px]">
            {data.goals.map((g) => (
              <li key={g}>· {g}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-8 space-y-4">
          <label className="flex items-center justify-between">
            <span>Napisy po hiszpańsku</span>
            <Switch checked={subtitles} onCheckedChange={setSubtitles} />
          </label>
          {mode !== "assessment" && mode !== "real_life" && (
            <label className="flex items-center justify-between">
              <span>Tłumaczenie po dotknięciu</span>
              <Switch checked={translation} onCheckedChange={setTranslation} />
            </label>
          )}
        </div>
        {mode === "assessment" && (
          <Notice className="mt-6">
            10 minut rozmowy bez podpowiedzi i tłumaczeń. Wynik to przybliżona ocena AI według stałych kryteriów — nie certyfikowany test CEFR.
          </Notice>
        )}
        {channel === "text" && (
          <Notice tone="warn" className="mt-6">
            Tryb tekstowy — rozmowa głosowa ElevenLabs nie jest skonfigurowana. Odpowiadasz pisząc albo dyktując.
          </Notice>
        )}
        {channel === "voice" && <p className="mt-6 text-sm text-muted">Przeglądarka poprosi o dostęp do mikrofonu. Najlepiej w słuchawkach.</p>}
      </div>
      {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}
      <Button size="lg" className="mb-4 w-full" onClick={onStart} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Mic />} Rozpocznij rozmowę
      </Button>
    </div>
  );
}

function Transcript({
  lines,
  subtitles,
  translation,
  live,
}: {
  lines: Line[];
  subtitles: boolean;
  translation: boolean;
  live?: boolean;
}) {
  const [tr, setTr] = useState<Record<number, string>>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [lines.length]);
  if (!subtitles) return <div className="flex-1" />;
  return (
    <div className="flex-1 space-y-3 overflow-y-auto py-4" aria-live={live ? "polite" : undefined}>
      {lines.map((l, i) =>
        l.role === "action" ? (
          <div key={i} className="text-center text-xs text-faint">
            — {l.text} —
          </div>
        ) : (
          <div key={i} className={cn("flex", l.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5", l.role === "user" ? "bg-ink text-white" : "border border-line bg-surface")}>
              <div className="font-serif text-[17px] leading-snug" lang="es">
                {l.text}
              </div>
              {l.role === "agent" && translation && (
                <button
                  type="button"
                  className="mt-1 text-xs text-muted underline-offset-2 hover:underline"
                  onClick={async () => {
                    if (tr[i]) return;
                    setTr((t) => ({ ...t, [i]: "…" }));
                    try {
                      const r = await api<{ pl: string }>("/api/translate", { method: "POST", json: { es: l.text } });
                      setTr((t) => ({ ...t, [i]: r.pl }));
                    } catch (e) {
                      setTr((t) => ({ ...t, [i]: e instanceof Error ? e.message : "—" }));
                    }
                  }}
                >
                  {tr[i] ?? "przetłumacz"}
                </button>
              )}
            </div>
          </div>
        ),
      )}
      <div ref={end} />
    </div>
  );
}

function ActionBar({ actions, onAction, disabled }: { actions: ControlAction[]; onAction: (a: ControlAction) => void; disabled?: boolean }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          disabled={disabled}
          onClick={() => onAction(a)}
          className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink-2 active:scale-95 disabled:opacity-40"
        >
          {CONTROL_ACTIONS[a].label}
        </button>
      ))}
    </div>
  );
}

function VoiceConversation({ scenarioId, grammarTopicId, mode, planItemId }: Props) {
  const finish = useFinish(planItemId);
  const [start, setStart] = useState<StartResponse | null>(null);
  const [phase, setPhase] = useState<"intro" | "starting" | "live" | "interrupted" | "finishing">("intro");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [subtitles, setSubtitles] = useState(true);
  const [translation, setTranslation] = useState(mode === "guided");
  const [online, setOnline] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const segments = useRef<string[]>([]);
  const counters = useRef<Record<string, number>>({});
  const startedAt = useRef<number | null>(null);
  const userEnded = useRef(false);
  // Callbacks can fire before React re-renders with the new state; keep the session in a ref too.
  const startRef = useRef<StartResponse | null>(null);

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      segments.current.push(conversationId);
      if (!startedAt.current) startedAt.current = Date.now();
      setPhase("live");
      const st = startRef.current;
      if (st) void api(`/api/conversation/${st.sessionId}`, { method: "PATCH", json: { elevenConversationId: conversationId } }).catch(() => null);
    },
    onMessage: ({ message, role }) => {
      if (!message?.trim() || /^\s*\[\s*ACCI[OÓ]N/i.test(message)) return;
      setLines((l) => [...l, { role: role === "agent" ? "agent" : "user", text: message, time: startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0 }]);
    },
    onDisconnect: (details) => {
      if (userEnded.current) return;
      setPhase(details.reason === "agent" ? "finishing" : "interrupted");
      if (details.reason === "agent") void doFinish();
    },
    onError: (message) => setError(typeof message === "string" ? message : "Błąd połączenia głosowego"),
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setElapsed(startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function ensureMic(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      setError("Brak dostępu do mikrofonu. Na iPhonie: Ustawienia → Safari → Mikrofon → Pozwól, a potem odśwież stronę.");
      return false;
    }
  }

  function connect(data: StartResponse, auth: { conversationToken?: string; signedUrl?: string }, resume: boolean) {
    const v = data.voice!;
    const common = {
      dynamicVariables: v.dynamicVariables,
      overrides: resume
        ? { ...v.overrides, agent: { ...v.overrides.agent, firstMessage: "Perdona, se ha cortado la conexión. ¿Seguimos? ¿Por dónde íbamos?" } }
        : v.overrides,
      userId: v.userId,
    };
    if (auth.conversationToken) conversation.startSession({ ...common, conversationToken: auth.conversationToken, connectionType: "webrtc" });
    else if (auth.signedUrl) conversation.startSession({ ...common, signedUrl: auth.signedUrl, connectionType: "websocket" });
  }

  async function begin() {
    setError(null);
    setPhase("starting");
    if (!(await ensureMic())) return setPhase("intro");
    try {
      const data = await api<StartResponse>("/api/conversation/start", {
        method: "POST",
        json: { scenarioId, mode, grammarTopicId, planItemId, channel: "voice" },
      });
      startRef.current = data;
      setStart(data);
      connect(data, { conversationToken: data.voice!.conversationToken, signedUrl: data.voice!.signedUrl }, false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Nie udało się rozpocząć rozmowy.");
      setPhase("intro");
    }
  }

  async function reconnect() {
    if (!start) return;
    setError(null);
    setPhase("starting");
    try {
      const { conversationToken } = await api<{ conversationToken: string }>(`/api/conversation/${start.sessionId}/token`, { method: "POST" });
      connect(start, { conversationToken }, true);
      const recent = lines
        .filter((l) => l.role !== "action")
        .slice(-6)
        .map((l) => `${l.role === "user" ? "Alumno" : "Tú"}: ${l.text}`)
        .join("\n");
      setTimeout(() => recent && conversation.sendContextualUpdate(`La conversación se interrumpió por la conexión. Últimos mensajes:\n${recent}`), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się połączyć ponownie.");
      setPhase("interrupted");
    }
  }

  const doFinish = useCallback(async () => {
    if (!start) return;
    setPhase("finishing");
    try {
      await finish(start.sessionId, {
        // With several connection segments only the local transcript is complete.
        elevenConversationId: segments.current.length === 1 ? segments.current[0] : null,
        localTranscript: lines.filter((l) => l.role !== "action").map((l) => ({ role: l.role as "user" | "agent", text: l.text, time: l.time })),
        durationSecs: startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0,
        counters: counters.current,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zapisać rozmowy.");
      setPhase("interrupted");
    }
  }, [start, finish, lines]);

  async function end() {
    userEnded.current = true;
    conversation.endSession();
    await doFinish();
  }

  function action(a: ControlAction) {
    counters.current[a] = (counters.current[a] ?? 0) + 1;
    setLines((l) => [...l, { role: "action", text: CONTROL_ACTIONS[a].label, time: 0, action: a }]);
    conversation.sendUserMessage(CONTROL_ACTIONS[a].message);
  }

  if (phase === "intro" || (phase === "starting" && !start)) {
    return (
      <Intro
        data={start ? { title: start.character.title, name: start.character.name, role: start.character.role, goals: start.character.goals } : null}
        mode={mode}
        busy={phase === "starting"}
        error={error}
        onStart={begin}
        subtitles={subtitles}
        setSubtitles={setSubtitles}
        translation={translation}
        setTranslation={setTranslation}
        channel="voice"
      />
    );
  }

  const status = conversation.status;
  const speaking = conversation.isSpeaking;
  return (
    <div className="flex h-[calc(100dvh-1rem)] flex-col">
      <div className="flex items-center justify-between py-2">
        <div>
          <div className="font-semibold">{start?.character.name}</div>
          <div className="text-xs text-muted">{start?.character.title}</div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span
            className={cn("size-2 rounded-full", status === "connected" ? "bg-success" : status === "connecting" ? "bg-warn" : "bg-danger")}
            aria-hidden
          />
          {status === "connected" ? (speaking ? "mówi…" : "słucha") : status === "connecting" ? "łączenie…" : "rozłączono"} ·{" "}
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </div>
      </div>
      {!online && (
        <Notice tone="danger" className="flex items-center gap-2">
          <WifiOff className="size-4" /> Brak internetu — rozmowa wstrzymana. Twoja dotychczasowa rozmowa jest zachowana.
        </Notice>
      )}
      {phase === "interrupted" && (
        <Notice tone="warn" className="mt-2 space-y-2">
          <div>Połączenie zostało przerwane.</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={reconnect} disabled={!online}>
              <RefreshCw /> Połącz ponownie
            </Button>
            <Button size="sm" variant="secondary" onClick={doFinish}>
              Zakończ i zobacz wyniki
            </Button>
          </div>
        </Notice>
      )}
      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}

      <Transcript lines={lines} subtitles={subtitles} translation={translation} live />

      <div className="space-y-4 pb-4">
        {start && start.actions.length > 0 && <ActionBar actions={start.actions} onAction={action} disabled={status !== "connected"} />}
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setSubtitles(!subtitles)}
            className="w-16 text-xs text-muted"
            aria-pressed={subtitles}
          >
            {subtitles ? "Ukryj napisy" : "Napisy"}
          </button>
          <button
            type="button"
            onClick={() => conversation.setMuted(!conversation.isMuted)}
            disabled={status !== "connected"}
            aria-label={conversation.isMuted ? "Włącz mikrofon" : "Wycisz mikrofon"}
            className={cn(
              "flex size-20 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40",
              conversation.isMuted ? "bg-muted" : "bg-accent",
              !conversation.isMuted && !speaking && status === "connected" && "animate-pulse-ring",
            )}
          >
            {conversation.isMuted ? <MicOff className="size-8" /> : <Mic className="size-8" />}
          </button>
          <button
            type="button"
            onClick={end}
            disabled={phase === "finishing"}
            aria-label="Zakończ rozmowę"
            className="flex size-14 items-center justify-center rounded-full bg-danger text-white active:scale-95"
          >
            {phase === "finishing" ? <Loader2 className="size-6 animate-spin" /> : <PhoneOff className="size-6" />}
          </button>
        </div>
        {phase === "finishing" && <p className="text-center text-sm text-muted">Analizuję rozmowę…</p>}
      </div>
    </div>
  );
}

function TextConversation({ scenarioId, grammarTopicId, mode, planItemId }: Props) {
  const finish = useFinish(planItemId);
  const [start, setStart] = useState<StartResponse | null>(null);
  const [phase, setPhase] = useState<"intro" | "starting" | "live" | "finishing">("intro");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [subtitles, setSubtitles] = useState(true);
  const [translation, setTranslation] = useState(mode === "guided");
  const [busy, setBusy] = useState(false);
  const startedAt = useRef<number>(0);
  const counters = useRef<Record<string, number>>({});

  async function begin() {
    setPhase("starting");
    setError(null);
    try {
      const data = await api<StartResponse>("/api/conversation/start", {
        method: "POST",
        json: { scenarioId, mode, grammarTopicId, planItemId, channel: "text" },
      });
      setStart(data);
      startedAt.current = Date.now();
      setLines([{ role: "agent", text: data.firstMessage, time: 0 }]);
      setPhase("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
      setPhase("intro");
    }
  }

  async function send(input: { message?: string; action?: ControlAction }) {
    if (!start) return;
    setBusy(true);
    setError(null);
    if (input.message) setLines((l) => [...l, { role: "user", text: input.message!, time: 0 }]);
    if (input.action) {
      counters.current[input.action] = (counters.current[input.action] ?? 0) + 1;
      setLines((l) => [...l, { role: "action", text: CONTROL_ACTIONS[input.action!].label, time: 0 }]);
    }
    try {
      const r = await api<{ reply_es: string; end_conversation: boolean }>(`/api/conversation/${start.sessionId}/text`, { method: "POST", json: input });
      setLines((l) => [...l, { role: "agent", text: r.reply_es, time: 0 }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!start) return;
    setPhase("finishing");
    try {
      await finish(start.sessionId, { elevenConversationId: null, localTranscript: [], durationSecs: (Date.now() - startedAt.current) / 1000, counters: counters.current });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
      setPhase("live");
    }
  }

  if (phase !== "live" && phase !== "finishing") {
    return (
      <Intro
        data={null}
        mode={mode}
        busy={phase === "starting"}
        error={error}
        onStart={begin}
        subtitles={subtitles}
        setSubtitles={setSubtitles}
        translation={translation}
        setTranslation={setTranslation}
        channel="text"
      />
    );
  }
  const lastAgent = [...lines].reverse().find((l) => l.role === "agent");
  return (
    <div className="flex h-[calc(100dvh-1rem)] flex-col">
      <div className="flex items-center justify-between py-2">
        <div>
          <div className="font-semibold">{start?.character.name}</div>
          <div className="text-xs text-muted">{start?.character.title} · tryb tekstowy</div>
        </div>
        <Button variant="secondary" size="sm" onClick={end} disabled={phase === "finishing"}>
          {phase === "finishing" ? <Loader2 className="animate-spin" /> : <PhoneOff />} Zakończ
        </Button>
      </div>
      <Transcript lines={lines} subtitles translation={translation} />
      <div className="space-y-3 pb-4">
        {lastAgent && (
          <div className="flex justify-center">
            <PlayButton text={lastAgent.text} size="sm" label="Odsłuchaj ostatnią wypowiedź" />
          </div>
        )}
        {start && start.actions.length > 0 && <ActionBar actions={start.actions} onAction={(a) => send({ action: a })} disabled={busy} />}
        {error && <p className="text-center text-sm text-danger">{error}</p>}
        <AnswerInput preferText submitLabel="Wyślij" onSubmit={(t) => send({ message: t })} disabled={busy || phase === "finishing"} />
        {busy && (
          <p className="flex items-center justify-center gap-1 text-xs text-muted">
            <Send className="size-3" /> {start?.character.name} pisze…
          </p>
        )}
      </div>
    </div>
  );
}
