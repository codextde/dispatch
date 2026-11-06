import { afterEach, describe, expect, it, vi } from "vitest"
import { arubaHome, discoverAruba, readArubaEvents, writeArubaEvent } from "./aruba"

const credentials = { email: "calendar@example.com", password: "test" }
const path = arubaHome(credentials.email) + "personal/"
const href = path + "test.ics"
const xml = (body: string) => new Response(
  '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' + body + "</d:multistatus>",
  { status: 207 },
)
const row = (url: string, prop: string) => `<d:response><d:href>${url}</d:href><d:propstat><d:prop>${prop}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`

afterEach(() => vi.unstubAllGlobals())

describe("Aruba CalDAV", () => {
  it("discovers calendars and decodes DAV properties", async () => {
    const fetcher = vi.fn().mockResolvedValue(xml(row(path, "<d:displayname> Team &amp; Ops </d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>")))
    vi.stubGlobal("fetch", fetcher)
    expect(await discoverAruba(credentials)).toEqual([{ path, name: "Team & Ops" }])
    expect(fetcher).toHaveBeenCalledWith(new URL("https://syncdav.aruba.it" + arubaHome(credentials.email)),
      expect.objectContaining({ method: "PROPFIND", redirect: "error" }))
  })

  it("requires complete reports before reconciling cached events", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(xml(row(href, '<d:getetag>"1"</d:getetag><c:calendar-data>BEGIN:VCALENDAR</c:calendar-data>')))
      .mockResolvedValueOnce(xml(row(href, '<d:getetag>"1"</d:getetag>')))
    vi.stubGlobal("fetch", fetcher)
    expect(await readArubaEvents(credentials, path)).toEqual([{ remotePath: href, etag: '"1"', ics: "BEGIN:VCALENDAR" }])
    await expect(readArubaEvents(credentials, path)).rejects.toThrow("Incomplete Aruba event response")
  })

  it("writes with preconditions and surfaces conflicts without retrying", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 201, headers: { etag: '"1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
    vi.stubGlobal("fetch", fetcher)
    expect(await writeArubaEvent(credentials, href, null, "BEGIN:VCALENDAR")).toBe('"1"')
    await expect(writeArubaEvent(credentials, href, '"1"')).rejects.toMatchObject({ status: 409, code: "calendar_conflict" })
    expect(fetcher.mock.calls.map(([, init]) => [init.method, init.headers["If-Match"], init.headers["If-None-Match"]]))
      .toEqual([["PUT", undefined, "*"], ["DELETE", '"1"', undefined]])
  })

  it("rejects provider paths outside Aruba before sending credentials", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    await expect(writeArubaEvent(credentials, "https://example.com/test.ics", null, "BEGIN:VCALENDAR")).rejects.toThrow("Invalid Aruba calendar URL")
    expect(fetcher).not.toHaveBeenCalled()
  })
})
