/**
 * E-mail HTML sanitizer (allowlist, via sanitize-html).
 *
 *  - Drops script/style/iframe/object/embed/form/input/base/meta/link/svg/math… (and their content
 *    for script/style/textarea/noscript).
 *  - Drops every on* handler, id/class (no DOM clobbering, no clashes with app CSS).
 *  - Links: only http/https/mailto/tel; target=_blank rel=noopener noreferrer nofollow.
 *  - Inline `style` attributes are kept, minus dangerous declarations (expression(), url(),
 *    javascript:, behavior, -moz-binding, @import, position).
 *  - Remote images are BLOCKED by default: `src` is removed and the URL kept in `data-remote-src`
 *    (the UI loads them by renaming the attribute); `hasRemoteImages` lets it offer "Load images".
 *  - `cid:` images are rewritten to our authenticated attachment URL.
 */
import sanitizeHtml from "sanitize-html";

export const TRANSPARENT_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export interface SanitizeOptions {
  /** content-id (no brackets, lower-case) → URL */
  cidMap?: Map<string, string>;
  /** Do not block remote images (user preference "always load"). */
  allowRemoteImages?: boolean;
}

export interface SanitizedHtml {
  html: string;
  hasRemoteImages: boolean;
}

const DANGEROUS_CSS = /expression\s*\(|url\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|@import|\\[0-9a-f]/i;
const DROPPED_CSS_PROPS = new Set(["position", "behavior", "behaviour", "-moz-binding", "z-index"]);

export function cleanStyle(style: string): string {
  return style
    .split(";")
    .map((d) => d.trim())
    .filter((d) => {
      if (!d) return false;
      const i = d.indexOf(":");
      if (i <= 0) return false;
      const prop = d.slice(0, i).trim().toLowerCase();
      if (DROPPED_CSS_PROPS.has(prop)) return false;
      return !DANGEROUS_CSS.test(d) && !/[<>]/.test(d);
    })
    .join("; ");
}

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

const ALLOWED_TAGS = [
  "a", "abbr", "address", "b", "bdi", "bdo", "big", "blockquote", "br", "caption", "center", "cite", "code",
  "col", "colgroup", "dd", "del", "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "font", "h1", "h2",
  "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "samp",
  "small", "span", "strike", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time",
  "tr", "tt", "u", "ul", "var", "wbr",
];

const COMMON_ATTRS = ["style", "dir", "lang", "title", "align"];
const TABLE_ATTRS = ["width", "height", "align", "valign", "bgcolor", "border", "cellpadding", "cellspacing", "colspan", "rowspan", "nowrap"];

export function sanitizeEmailHtml(input: string, opts: SanitizeOptions = {}): SanitizedHtml {
  let hasRemoteImages = false;
  const html = sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "title", "head", "template", "xml", "svg", "math", "object", "iframe", "select"],
    allowedAttributes: {
      "*": COMMON_ATTRS,
      a: ["href", "target", "rel", "name"],
      img: ["src", "alt", "width", "height", "data-remote-src", "border", "hspace", "vspace"],
      font: ["color", "face", "size"],
      table: TABLE_ATTRS,
      td: TABLE_ATTRS,
      th: TABLE_ATTRS,
      tr: TABLE_ATTRS,
      tbody: TABLE_ATTRS,
      thead: TABLE_ATTRS,
      col: ["width", "span"],
      colgroup: ["width", "span"],
      ol: ["start", "type"],
      ul: ["type"],
      li: ["value"],
      time: ["datetime"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // img src is fully controlled by the img transform below (placeholder / cid URL / safe data:).
    allowedSchemesByTag: { img: ["data", "http", "https"] },
    allowedSchemesAppliedToAttributes: ["href", "src", "cite", "data-remote-src"],
    allowProtocolRelative: false,
    // Style attributes are cleaned in transformTags["*"] below; don't parse with postcss.
    parseStyleAttributes: false,
    transformTags: {
      "*": (tagName, attribs) => {
        const out: sanitizeHtml.Attributes = {};
        for (const [k, v] of Object.entries(attribs)) {
          if (/^on/i.test(k)) continue;
          if (k === "style") {
            const s = cleanStyle(v);
            if (s) out.style = s;
            continue;
          }
          out[k] = v;
        }
        return { tagName, attribs: out };
      },
      a: (tagName, attribs) => {
        const href = (attribs.href ?? "").trim();
        const out: sanitizeHtml.Attributes = { ...attribs };
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          out.href = href;
          out.target = "_blank";
          out.rel = "noopener noreferrer nofollow";
        } else if (href.startsWith("#")) {
          out.href = href;
        } else {
          delete out.href;
        }
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => {
        const src = (attribs.src ?? "").trim();
        const out: sanitizeHtml.Attributes = {};
        for (const k of ["alt", "width", "height", "style", "border", "title", "align"]) if (attribs[k]) out[k] = attribs[k];
        if (/^cid:/i.test(src)) {
          const url = opts.cidMap?.get(src.slice(4).replace(/^<|>$/g, "").trim().toLowerCase());
          out.src = url ?? TRANSPARENT_GIF;
        } else if (/^https?:\/\//i.test(src) || src.startsWith("//")) {
          const url = src.startsWith("//") ? `https:${src}` : src;
          if (opts.allowRemoteImages) out.src = url;
          else {
            // No src at all: the UI enables images by renaming data-remote-src → src.
            hasRemoteImages = true;
            out["data-remote-src"] = url;
          }
        } else if (SAFE_DATA_IMAGE.test(src)) {
          out.src = src;
        } else {
          out.src = TRANSPARENT_GIF;
        }
        return { tagName, attribs: out };
      },
    },
  });
  return { html, hasRemoteImages };
}
