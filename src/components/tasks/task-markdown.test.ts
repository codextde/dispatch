import { describe, expect, it } from "vitest"
import { renderTaskMarkdown } from "./task-markdown"

describe("renderTaskMarkdown", () => {
  it("renders plain markdown", () => {
    const html = renderTaskMarkdown("**Call** the customer\n\n- one\n- `two`")
    expect(html).toContain("<strong>Call</strong>")
    expect(html).toContain("<li>one</li>")
    expect(html).toContain("<code>two</code>")
  })

  it("drops styles, forms and images from raw HTML", () => {
    const html = renderTaskMarkdown(
      '<div style="position:fixed;inset:0">Your session has expired</div><img src="https://t.example/p.png"><form action="https://evil.example"><input name="password"><button>Go</button></form>'
    )
    expect(html).toContain("Your session has expired")
    expect(html).not.toMatch(/style=|<img|<form|<input|<button|<div/i)
  })

  it("keeps links safe", () => {
    const html = renderTaskMarkdown('[docs](https://example.com) <a href="javascript:alert(1)" onclick="x()">x</a>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toMatch(/javascript:|onclick/i)
  })
})
