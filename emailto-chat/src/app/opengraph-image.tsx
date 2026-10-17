import { ImageResponse } from "next/og";

export const alt = "emailto.chat — Your email. Now a conversation.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const bubble = (text: string, mine: boolean) => (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", width: "100%" }}>
      <div
        style={{
          display: "flex",
          padding: "14px 22px",
          borderRadius: 28,
          fontSize: 26,
          background: mine ? "#2463eb" : "#f0f2f5",
          color: mine ? "white" : "#0e1116",
          borderBottomRightRadius: mine ? 8 : 28,
          borderBottomLeftRadius: mine ? 28 : 8,
        }}
      >
        {text}
      </div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "white", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 620 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#0e1116" }}>
            emailto<span style={{ color: "#2463eb" }}>.chat</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 72, fontWeight: 700, lineHeight: 1.05, marginTop: 28, letterSpacing: -2, color: "#0e1116" }}>
            <span>Your email.</span>
            <span style={{ color: "#2463eb" }}>Now a conversation.</span>
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#5d6573", marginTop: 28 }}>People first. Threads second. Messages naturally.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, flex: 1 }}>
          {bubble("Can you send the offer?", false)}
          {bubble("Sure, today!", true)}
          {bubble("Great, thanks!", false)}
          {bubble("Just attached it.", true)}
        </div>
      </div>
    ),
    size,
  );
}
