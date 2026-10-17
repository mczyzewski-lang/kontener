import { Users } from "lucide-react";
import { initials, stableHash } from "@/core/addresses";
import { cn } from "@/lib/utils";

// Calm, distinguishable hues — also used to color group senders.
const PALETTE = [
  ["#e8f0fe", "#1d4ed8"],
  ["#fde8ef", "#be185d"],
  ["#e6f6ee", "#047857"],
  ["#fff1e0", "#b45309"],
  ["#efe9fd", "#6d28d9"],
  ["#e3f5f8", "#0e7490"],
  ["#fdeceb", "#b91c1c"],
  ["#eef2e3", "#4d7c0f"],
];
const PALETTE_DARK = [
  ["#1b2a4d", "#9db8ff"],
  ["#3a1a28", "#f9a8c8"],
  ["#123527", "#7ddcb0"],
  ["#3a2a12", "#f5c27a"],
  ["#2a2045", "#c4b0fb"],
  ["#123139", "#7fd6e6"],
  ["#3b1918", "#f6a3a0"],
  ["#253012", "#bcdc7f"],
];

export function colorIndex(seed: string): number {
  return parseInt(stableHash(seed.toLowerCase()).slice(0, 6), 16) % PALETTE.length;
}

/** Text color for a sender name in group chats (CSS var friendly, works in both themes). */
export function senderColorClass(seed: string): string {
  return SENDER_CLASSES[colorIndex(seed)];
}
const SENDER_CLASSES = [
  "text-[#1d4ed8] dark:text-[#9db8ff]",
  "text-[#be185d] dark:text-[#f9a8c8]",
  "text-[#047857] dark:text-[#7ddcb0]",
  "text-[#b45309] dark:text-[#f5c27a]",
  "text-[#6d28d9] dark:text-[#c4b0fb]",
  "text-[#0e7490] dark:text-[#7fd6e6]",
  "text-[#b91c1c] dark:text-[#f6a3a0]",
  "text-[#4d7c0f] dark:text-[#bcdc7f]",
];

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-[11px]",
  md: "size-10 text-[13px]",
  lg: "size-12 text-[15px]",
  xl: "size-20 text-2xl",
} as const;

export function Avatar({
  name,
  email,
  size = "md",
  className,
  ring,
}: {
  name?: string | null;
  email: string;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
}) {
  const i = colorIndex(email);
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight",
        "bg-[var(--av-bg)] text-[var(--av-fg)] dark:bg-[var(--av-bg-d)] dark:text-[var(--av-fg-d)]",
        ring && "ring-2 ring-bg",
        SIZES[size],
        className,
      )}
      style={
        {
          "--av-bg": PALETTE[i][0],
          "--av-fg": PALETTE[i][1],
          "--av-bg-d": PALETTE_DARK[i][0],
          "--av-fg-d": PALETTE_DARK[i][1],
        } as React.CSSProperties
      }
    >
      {initials(name || email)}
    </span>
  );
}

/** Stacked avatars for group conversations. */
export function GroupAvatar({ members, size = "md", className }: { members: { email: string; name?: string | null }[]; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const shown = members.slice(0, 2);
  if (shown.length < 2) {
    return (
      <span className={cn("inline-flex items-center justify-center rounded-full bg-muted text-fg-muted", SIZES[size], className)}>
        <Users className="size-1/2" />
      </span>
    );
  }
  const inner = size === "xl" ? "lg" : size === "lg" ? "md" : size === "md" ? "sm" : "xs";
  return (
    <span className={cn("relative inline-block shrink-0", SIZES[size], className)} aria-hidden>
      <Avatar email={shown[0].email} name={shown[0].name} size={inner} className="absolute left-0 top-0" />
      <Avatar email={shown[1].email} name={shown[1].name} size={inner} ring className="absolute bottom-0 right-0" />
    </span>
  );
}
