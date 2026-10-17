import { cn } from "@/lib/utils";

/** Mark: a chat bubble whose top edge folds like an envelope flap. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect x="2" y="3" width="28" height="22" rx="8" fill="var(--accent)" />
      <path d="M9 25 L7 30 L15 25 Z" fill="var(--accent)" />
      <path d="M8 10 L16 16 L24 10" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, markOnly }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="h-full w-auto" />
      {!markOnly && (
        <span className="text-[17px] font-semibold tracking-tight text-fg">
          emailto<span className="text-accent">.chat</span>
        </span>
      )}
    </span>
  );
}
