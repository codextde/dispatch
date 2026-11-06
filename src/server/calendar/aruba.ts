import "server-only"
import { XMLParser } from "fast-xml-parser"
import { ApiError } from "@/server/api"

const origin = "https://syncdav.aruba.it"
const parser = new XMLParser({ removeNSPrefix: true, trimValues: false, parseTagValue: false, processEntities: true })

type Prop = { displayname?: string; resourcetype?: { calendar?: unknown }; getetag?: string; "calendar-data"?: string }
type DavRow = { href: string; status?: string; propstat?: { status: string; prop: Prop } | Array<{ status: string; prop: Prop }> }
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value]

export type ArubaCredentials = { email: string; password: string }
export function arubaHome(email: string) {
  return "/calendars/" + encodeURIComponent(email).replace(/%40/g, "@") + "/"
}

function arubaUrl(path: string) {
  const url = new URL(path, origin)
  if (url.origin !== origin || url.username || url.password || url.hash || url.search) throw new Error("Invalid Aruba calendar URL")
  return url
}

async function request(credentials: ArubaCredentials, path: string, method: string, body?: string, headers: Record<string, string> = {}) {
  const response = await fetch(arubaUrl(path), {
    method,
    body,
    headers: {
      Authorization: "Basic " + Buffer.from(credentials.email + ":" + credentials.password).toString("base64"),
      ...(body ? { "Content-Type": method === "PUT" ? "text/calendar; charset=utf-8" : "application/xml; charset=utf-8" } : {}),
      ...headers,
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    if ([409, 412].includes(response.status) || (response.status === 404 && ["PUT", "DELETE"].includes(method))) {
      throw new ApiError(409, "Aruba changed this event. Refresh the calendar and review the current version.", "calendar_conflict")
    }
    throw new ApiError(response.status === 401 || response.status === 403 ? 422 : 502, "Aruba CalDAV request failed (" + response.status + ")")
  }
  return response
}

async function readXml(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Missing Aruba response")
  const decoder = new TextDecoder()
  let xml = ""
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 25_000_000) {
      await reader.cancel()
      throw new Error("Aruba calendar response is too large")
    }
    xml += decoder.decode(value, { stream: true })
  }
  xml += decoder.decode()
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Invalid Aruba calendar response")
  const data = parser.parse(xml) as { multistatus?: { response?: DavRow | DavRow[] } | "" }
  if (data.multistatus === undefined) throw new Error("Invalid Aruba calendar response")
  return array(typeof data.multistatus === "object" ? data.multistatus.response : undefined)
}

function properties(row: DavRow) {
  return array(row.propstat).filter(({ status }) => / 200(?: |$)/.test(status)).reduce<Prop>((all, item) => ({ ...all, ...item.prop }), {})
}

export async function discoverAruba(credentials: ArubaCredentials) {
  const response = await request(credentials, arubaHome(credentials.email), "PROPFIND",
    '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>', { Depth: "1" })
  return (await readXml(response)).flatMap((row) => {
    const prop = properties(row)
    if (prop.resourcetype?.calendar === undefined) return []
    const path = arubaUrl(row.href).pathname.replace(/\/?$/, "/")
    return [{ path, name: prop.displayname?.trim().slice(0, 160) || "Aruba" }]
  })
}

export async function readArubaEvents(credentials: ArubaCredentials, path: string) {
  const response = await request(credentials, path, "REPORT",
    '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>', { Depth: "1" })
  return (await readXml(response)).map((row) => {
    const prop = properties(row)
    const remotePath = arubaUrl(row.href).pathname
    if (!remotePath.startsWith(path) || remotePath === path || !prop.getetag || !prop["calendar-data"]) throw new Error("Incomplete Aruba event response")
    return { remotePath, etag: prop.getetag.trim(), ics: prop["calendar-data"] }
  })
}

export async function writeArubaEvent(credentials: ArubaCredentials, path: string, etag: string | null, ics?: string) {
  const response = await request(credentials, path, ics === undefined ? "DELETE" : "PUT", ics,
    etag ? { "If-Match": etag } : { "If-None-Match": "*" })
  const next = response.headers.get("etag")
  await response.body?.cancel()
  return next
}
