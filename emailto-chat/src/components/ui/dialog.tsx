"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  className,
  children,
  hideTitle,
  variant = "center",
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
  hideTitle?: boolean;
  /** center: modal · sheet: bottom sheet on mobile, centered on desktop */
  variant?: "center" | "sheet";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] animate-fade-in dark:bg-black/50" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[min(88dvh,760px)] flex-col overflow-hidden border border-border bg-panel shadow-lg outline-none animate-pop",
          variant === "center" && "left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl",
          variant === "sheet" &&
            "inset-x-0 bottom-0 rounded-t-2xl pb-safe sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          className,
        )}
      >
        <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", hideTitle && "sr-only")}>
          <div>
            <D.Title className="text-base font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="-mr-1 -mt-1 rounded-lg p-1.5 text-fg-muted hover:bg-hover hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
