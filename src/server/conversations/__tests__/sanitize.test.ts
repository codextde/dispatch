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
