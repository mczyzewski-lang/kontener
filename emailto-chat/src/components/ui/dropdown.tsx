"use client";

import { DropdownMenu as D } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = D.Root;
export const DropdownMenuTrigger = D.Trigger;
export const DropdownMenuGroup = D.Group;

export function DropdownMenuContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-panel p-1 text-sm shadow-lg animate-pop",
          className,
        )}
        {...props}
      />
    </D.Portal>
  );
}

export function DropdownMenuItem({
  className,
  icon,
  shortcut,
  destructive,
  children,
  ...props
}: React.ComponentProps<typeof D.Item> & { icon?: React.ReactNode; shortcut?: string; destructive?: boolean }) {
  return (
    <D.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg outline-none transition-colors",
        "data-[highlighted]:bg-hover data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-fg-muted",
        destructive && "text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <kbd className="font-mono text-[11px] text-fg-subtle">{shortcut}</kbd>}
    </D.Item>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <D.Separator className={cn("my-1 h-px bg-border", className)} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof D.Label>) {
  return <D.Label className={cn("px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle", className)} {...props} />;
}
