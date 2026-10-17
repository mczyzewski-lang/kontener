"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  active?: boolean;
  size?: "sm" | "md";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, tooltipSide, active, size = "md", className, children, ...props },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40",
          size === "md" ? "size-9 [&_svg]:size-[18px]" : "size-8 [&_svg]:size-4",
          active && "bg-active text-accent hover:bg-active hover:text-accent",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
});
