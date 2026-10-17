"use client";

import { Tooltip as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <T.Provider delayDuration={350} skipDelayDuration={150}>
    {children}
  </T.Provider>
);

export function Tooltip({
  content,
  children,
  side = "bottom",
  shortcut,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 rounded-md bg-fg px-2 py-1 text-xs font-medium text-bg shadow-md animate-fade-in",
            "flex items-center gap-2",
          )}
        >
          {content}
          {shortcut && <kbd className="rounded bg-bg/15 px-1 font-mono text-[10px] opacity-80">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
