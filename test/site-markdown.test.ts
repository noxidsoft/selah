// The site renders Markdown from outside this repository — GitHub's release notes quote the
// titles of merged pull requests — and Bun's renderer is not a sanitiser (security review,
// 2026-10-19). Nothing it emits may execute.
import { describe, expect, test } from "bun:test"
import { markdownHtml, safeUrl, sanitizeHtml } from "../site/markdown"

describe("Markdown rendered for the site", () => {
  test("raw HTML becomes visible text, never a tag", () => {
    const html = markdownHtml(`<script>alert(1)</script>\n<iframe src="https://evil"></iframe>\n\ntext <img src=x onerror=alert(2)> more\n`)
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<iframe")
    expect(html).not.toContain("onerror")
    expect(html).toContain("&lt;script&gt;")
  })

  test("an event handler on a tag the renderer does emit is dropped", () => {
    expect(markdownHtml(`<p onclick="alert(1)">a</p>`)).toContain("<p>")
    expect(markdownHtml(`<p onclick="alert(1)">a</p>`)).not.toContain("onclick")
  })

  test("a link may point at the web, mail or this site, and nowhere else", () => {
    expect(safeUrl("https://example.com/a?x=1&y=2")).toBe(true)
    expect(safeUrl("mailto:a@b.c")).toBe(true)
    expect(safeUrl("/download")).toBe(true)
    expect(safeUrl("docs/x.md")).toBe(true)
    expect(safeUrl("#anchor")).toBe(true)
    expect(safeUrl("javascript:alert(1)")).toBe(false)
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBe(false)
    expect(safeUrl("java\nscript:alert(1)")).toBe(false)
    expect(safeUrl("data:text/html,<b>x")).toBe(false)
    expect(safeUrl("vbscript:msgbox(1)")).toBe(false)
    expect(safeUrl("//evil.example/x")).toBe(false)
  })

  test("a dangerous href is dropped from the rendered link, the safe ones kept", () => {
    const html = markdownHtml(`[a](javascript:alert(1)) [b](/download) [c](https://x?a=1&b=2)`)
    expect(html).not.toContain("javascript")
    expect(html).toContain(`<a href="/download">b</a>`)
    expect(html).toContain(`<a href="https://x?a=1&amp;b=2">c</a>`)
  })

  test("code blocks still read as the writer wrote them", () => {
    const html = markdownHtml("```sh\nif [ 1 -lt 3 ] && echo \"<ok>\"; then :; fi\n```\n\nand `a && b`\n")
    // escaped once, so the page shows && and <ok>, not &amp;&amp; and &lt;ok&gt;
    expect(html).toContain("&amp;&amp; echo &quot;&lt;ok&gt;&quot;")
    expect(html).toContain("<code>a &amp;&amp; b</code>")
  })

  test("the Markdown the site is built from survives whole", () => {
    const html = markdownHtml("# Title\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n\n![pic](https://x/y.png)\n\n- one\n- two\n\n> quoted\n")
    for (const tag of ["<h1>", "<table>", "<th align=\"right\">", `<img src="https://x/y.png" alt="pic" />`, "<ul>", "<blockquote>"]) {
      expect(html).toContain(tag)
    }
  })

  test("a comment or doctype cannot hide the rest of the page", () => {
    expect(sanitizeHtml("<!-- x --><p>a</p>")).toStartWith("&lt;!--")
    expect(sanitizeHtml("<!doctype html><p>a</p>")).not.toContain("<!doctype")
  })
})
