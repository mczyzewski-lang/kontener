"use client";

import { ImageOff } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Renders (already server-sanitized) e-mail HTML in a sandboxed iframe:
 * - no `allow-scripts` → no script execution even if something slipped through sanitization
 * - a strict CSP inside the document; remote images only after the user allows them
 * - links open in a new tab
 */
export function HtmlFrame({
  html,
  hasRemoteImages,
  alwaysLoadImages,
  className,
}: {
  html: string;
  hasRemoteImages: boolean;
  alwaysLoadImages: boolean;
  className?: string;
}) {
  const [loadImages, setLoadImages] = React.useState(alwaysLoadImages);
  const [height, setHeight] = React.useState(160);
  const ref = React.useRef<HTMLIFrameElement>(null);

  const srcDoc = React.useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const body = loadImages ? html.replace(/\sdata-remote-src=(["'])/g, " src=$1") : html;
    const imgSrc = `data: blob: ${origin}${loadImages ? " https: http:" : ""}`;
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:; media-src 'none'; form-action 'none'">
<base target="_blank"><meta name="referrer" content="no-referrer">
<style>html,body{margin:0;padding:0;background:#fff;color:#1f2328}body{padding:16px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}blockquote{margin:0 0 0 .6em;padding-left:.8em;border-left:3px solid #d6dae1;color:#5d6573}a{color:#2463eb}</style>
</head><body>${body}</body></html>`;
  }, [html, loadImages]);

  const measure = React.useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 60), 4000));
  }, []);

  React.useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    let ro: ResizeObserver | null = null;
    const onLoad = () => {
      measure();
      const doc = iframe.contentDocument;
      if (doc?.body && "ResizeObserver" in window) {
        ro = new ResizeObserver(measure);
        ro.observe(doc.body);
      }
      doc?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure, { once: true }));
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [measure, srcDoc]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-white", className)}>
      {hasRemoteImages && !loadImages && (
        <div className="flex items-center justify-between gap-3 border-b border-[#e7e9ee] bg-[#f6f7f9] px-3 py-2 text-xs text-[#5d6573]">
          <span className="flex items-center gap-1.5">
            <ImageOff className="size-3.5" /> Remote images are blocked to protect your privacy.
          </span>
          <button onClick={() => setLoadImages(true)} className="shrink-0 font-medium text-[#2463eb] hover:underline">
            Load images
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        title="E-mail content"
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="block w-full border-0"
        style={{ height }}
      />
    </div>
  );
}
