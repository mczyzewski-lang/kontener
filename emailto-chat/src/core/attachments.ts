import type { AttachmentKind } from "./types";

const DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument",
  "application/rtf",
  "text/plain",
  "text/csv",
  "application/vnd.apple",
];

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|pages|numbers|key|md)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp|svg|avif)$/i;

export function attachmentKind(mimeType: string, filename = ""): AttachmentKind {
  const m = mimeType.toLowerCase();
  if (m.startsWith("image/") || IMG_EXT.test(filename)) return "image";
  if (DOC_TYPES.some((t) => m.startsWith(t)) || DOC_EXT.test(filename)) return "document";
  return "other";
}

/** MIME types that are safe to display inline from our origin (never HTML, SVG or XML). */
export const INLINE_SAFE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf"]);

export function isInlineSafe(mimeType: string): boolean {
  return INLINE_SAFE_TYPES.has(mimeType.toLowerCase());
}

export function fileExtension(filename: string): string {
  const m = filename.match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toUpperCase() : "FILE";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
