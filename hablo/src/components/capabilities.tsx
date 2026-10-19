"use client";

import { createContext, useContext } from "react";

export interface Capabilities {
  mode: "private" | "demo";
  tts: boolean;
  stt: boolean;
  voice: boolean;
  ai: boolean;
  aiMock: boolean;
}

const Ctx = createContext<Capabilities>({ mode: "demo", tts: false, stt: false, voice: false, ai: false, aiMock: false });

export function CapabilitiesProvider({ value, children }: { value: Capabilities; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapabilities() {
  return useContext(Ctx);
}
