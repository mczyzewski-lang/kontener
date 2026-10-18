"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Library, Mic, Shapes, BarChart3, Settings, Feather } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Dziś", icon: Home },
  { href: "/vocabulary", label: "Słowa", icon: Library },
  { href: "/speak", label: "Mów", icon: Mic, primary: true },
  { href: "/stories", label: "Historie", icon: BookOpen },
  { href: "/grammar", label: "Gramatyka", icon: Shapes },
];
const EXTRA = [
  { href: "/thoughts", label: "Moje myśli", icon: Feather },
  { href: "/progress", label: "Postępy", icon: BarChart3 },
  { href: "/settings", label: "Ustawienia", icon: Settings },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Główna nawigacja"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5">
        {TABS.map((t) => {
          const on = active(path, t.href);
          return (
            <li key={t.href} className="flex justify-center">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex min-w-14 flex-col items-center gap-0.5 rounded-xl py-1 text-[11px]", on ? "text-accent" : "text-muted")}
              >
                {t.primary ? (
                  <span className={cn("-mt-4 flex size-12 items-center justify-center rounded-full", on ? "bg-accent text-accent-ink" : "bg-ink text-white")}>
                    <t.icon className="size-6" />
                  </span>
                ) : (
                  <t.icon className="size-6" strokeWidth={on ? 2.2 : 1.8} />
                )}
                <span className={cn(t.primary && "font-medium")}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Nawigacja" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2 text-xl font-semibold tracking-tight">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent font-serif text-white">h</span> Hablo
      </Link>
      <ul className="space-y-1">
        {[...TABS, ...EXTRA].map((t) => {
          const on = active(path, t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
                  on ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-sunken",
                )}
              >
                <t.icon className="size-5" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
