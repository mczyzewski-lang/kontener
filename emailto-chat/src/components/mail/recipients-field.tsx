"use client";

import { X } from "lucide-react";
import * as React from "react";
import { displayName, isValidEmail, normalizeEmail, parseAddressList } from "@/core/addresses";
import type { Address } from "@/core/types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useConversations } from "./mail-context";

/** Chip input for To / Cc / Bcc with suggestions from people you've corresponded with. */
export function RecipientsField({
  label,
  value,
  onChange,
  autoFocus,
  placeholder,
}: {
  label: string;
  value: Address[];
  onChange: (v: Address[]) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const { data } = useConversations("all", "all");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  const suggestions = React.useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(value.map((v) => v.email));
    const pool = new Map<string, Address>();
    for (const p of data?.people ?? []) if (!p.isSelf) pool.set(p.email, { email: p.email, name: p.name });
    for (const g of data?.groups ?? []) for (const m of g.members) if (!pool.has(m.email)) pool.set(m.email, m);
    return [...pool.values()].filter((a) => !taken.has(a.email) && (a.email.includes(q) || (a.name ?? "").toLowerCase().includes(q))).slice(0, 6);
  }, [input, data, value]);

  const commit = (raw: string) => {
    const parsed = parseAddressList(raw).filter((a) => isValidEmail(a.email));
    if (!parsed.length) return false;
    const existing = new Set(value.map((v) => v.email));
    onChange([...value, ...parsed.filter((p) => !existing.has(p.email))]);
    setInput("");
    return true;
  };

  const pick = (a: Address) => {
    onChange([...value, { ...a, email: normalizeEmail(a.email) }]);
    setInput("");
    setActive(0);
    inputRef.current?.focus();
  };

  const invalid = input.trim().length > 0 && !open && !isValidEmail(input.trim());

  return (
    <div className="relative flex min-h-9 items-start gap-2 py-1">
      <label htmlFor={id} className="w-8 shrink-0 pt-1.5 text-[13px] text-fg-subtle">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {value.map((a) => (
          <span key={a.email} title={a.email} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-1.5 text-[13px]">
            <Avatar email={a.email} name={a.name} size="xs" />
            <span className="truncate">{a.name ? displayName(a) : a.email}</span>
            <button type="button" onClick={() => onChange(value.filter((v) => v.email !== a.email))} className="rounded-full p-0.5 text-fg-subtle hover:bg-border hover:text-fg" aria-label={`Remove ${a.email}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          autoFocus={autoFocus}
          value={input}
          placeholder={value.length ? "" : (placeholder ?? "Name or e-mail")}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
            if (input.trim()) commit(input);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,;\n]/.test(text) && commit(text)) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if ((e.key === "Enter" || e.key === "Tab") && open && suggestions[active]) {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Enter" || e.key === "," || e.key === ";" || (e.key === " " && isValidEmail(input.trim()))) {
              if (input.trim()) {
                e.preventDefault();
                commit(input);
              }
            } else if (e.key === "Backspace" && !input && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          className={cn("h-7 min-w-[8rem] flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-subtle md:text-[13px]", invalid && "text-danger")}
          role="combobox"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          inputMode="email"
          autoComplete="off"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute left-8 top-full z-30 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-panel p-1 shadow-lg animate-pop">
          {suggestions.map((s, i) => (
            <li key={s.email} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left", i === active ? "bg-hover" : "")}
              >
                <Avatar email={s.email} name={s.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{displayName(s)}</span>
                  <span className="block truncate text-xs text-fg-muted">{s.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
