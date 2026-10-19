// Markdown to HTML for the site, with no raw HTML left in it.
//
// `Bun.markdown.html` is a CommonMark renderer, not a sanitiser: it copies raw HTML from its
// input straight through (`<script>`, `<img onerror>`) and keeps any href it is given, including
// `javascript:`. Most of what the site renders is this repository's own Markdown, but the
// changelog renders GitHub's release notes, and GitHub's generated notes quote the titles of
// every merged pull request — titles written by whoever opened them. So the rendered HTML is
// filtered here: a tag the renderer itself emits is kept (with only the attributes it needs),
// anything else is escaped into visible text, and every link must point somewhere harmless.
//
// Filtering the output rather than escaping the input keeps code blocks right: the renderer has
// already escaped their contents, so every `<` left in its output is a tag.
import { esc } from "./layout"

/** The tags Bun's Markdown renderer emits, and the attributes each may keep. */
const ALLOWED: Record<string, readonly string[]> = {
  p: [],
  br: [],
  hr: [],
  h1: ["id"],
  h2: ["id"],
  h3: ["id"],
  h4: ["id"],
  h5: ["id"],
  h6: ["id"],
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  em: [],
  strong: [],
  del: [],
  code: ["class"],
  pre: [],
  blockquote: [],
  ul: [],
  ol: ["start"],
  li: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ["align"],
  td: ["align"],
}

/** Where a link may point: the web, mail, or somewhere on this site. Not `javascript:`, not `data:`. */
export function safeUrl(url: string): boolean {
  // a scheme can hide behind whitespace and control characters, which browsers ignore
  const u = url.replace(/[\u0000-\u0020]/g, "")
  if (/^(https?:|mailto:)/i.test(u)) return true
  // "//host/x" has no scheme but is not relative either: it is whatever host someone names
  if (u.startsWith("//")) return false
  // relative paths and in-page anchors have no scheme of their own
  return !/^[a-z0-9.+-]*:/i.test(u)
}

export function sanitizeHtml(html: string): string {
  return html
    // comments, doctypes and processing instructions: no tag of ours starts this way
    .replace(/<(?=[!?])/g, "&lt;")
    .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (whole, slash: string, name: string, attrs: string) => {
      const tag = name.toLowerCase()
      const allowed = ALLOWED[tag]
      if (!allowed) return esc(whole)
      if (slash) return `</${tag}>`
      // keep the renderer's own form for a void tag, so this repository's pages are unchanged
      const close = /\/\s*$/.test(attrs) ? " /" : ""
      const kept = [...attrs.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
        .map(([, key, dq, sq]) => [key!.toLowerCase(), dq ?? sq ?? ""] as const)
        .filter(([key]) => allowed.includes(key))
        .filter(([key, value]) => !((key === "href" || key === "src") && !safeUrl(value)))
        // the value comes from the renderer's own output, already escaped; only the quote matters
        .map(([key, value]) => ` ${key}="${value.replace(/"/g, "&quot;")}"`)
      return `<${tag}${kept.join("")}${close}>`
    })
}

/** Markdown rendered to HTML the site can serve, whoever wrote the Markdown. */
export const markdownHtml = (md: string): string => sanitizeHtml(Bun.markdown.html(md))
