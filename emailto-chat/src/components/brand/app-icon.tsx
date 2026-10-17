/** PWA / favicon artwork, rendered with next/og ImageResponse (inline styles only). */
export function AppIcon({ size, maskable = false }: { size: number; maskable?: boolean }) {
  const pad = maskable ? size * 0.2 : size * 0.12;
  const inner = size - pad * 2;
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? "#2463eb" : "transparent" }}>
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: maskable ? 0 : inner * 0.26,
          background: "#2463eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={inner * 0.62} height={inner * 0.62} viewBox="0 0 32 32">
          <rect x="2" y="3" width="28" height="22" rx="8" fill="white" />
          <path d="M9 25 L7 30 L15 25 Z" fill="white" />
          <path d="M8 10 L16 16 L24 10" fill="none" stroke="#2463eb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
