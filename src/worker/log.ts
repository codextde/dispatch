/**
 * Structured, concise worker logging.
 *
 *   2026-09-27T12:00:00.000Z INFO  [sync] connected account=support@acme.com
 *
 * Set LOG_FORMAT=json for one JSON object per line (log shippers), and
 * LOG_LEVEL=debug|info|warn|error to filter.
 */

type Level = "debug" | "info" | "warn" | "error"
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const minLevel = ORDER[(process.env.LOG_LEVEL as Level) || "info"] ?? ORDER.info
const json = process.env.LOG_FORMAT === "json"

export type Fields = Record<string, unknown>
export type Logger = {
  debug: (msg: string, fields?: Fields) => void
  info: (msg: string, fields?: Fields) => void
  warn: (msg: string, fields?: Fields) => void
  error: (msg: string, fields?: Fields) => void
  child: (scope: string, fields?: Fields) => Logger
}

function fmtValue(v: unknown): string {
  if (v instanceof Error) return JSON.stringify(v.message)
  if (typeof v === "string") return /[\s="]/.test(v) ? JSON.stringify(v) : v
  if (v === undefined) return "undefined"
  return JSON.stringify(v)
}

function write(level: Level, scope: string, msg: string, fields: Fields) {
  if (ORDER[level] < minLevel) return
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout
  const ts = new Date().toISOString()
  if (json) {
    const safe = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v instanceof Error ? v.message : v]))
    out.write(JSON.stringify({ ts, level, scope, msg, ...safe }) + "\n")
    return
  }
  const kv = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${fmtValue(v)}`)
    .join(" ")
  out.write(`${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${kv ? " " + kv : ""}\n`)
}

export function createLogger(scope: string, base: Fields = {}): Logger {
  return {
    debug: (msg, f = {}) => write("debug", scope, msg, { ...base, ...f }),
    info: (msg, f = {}) => write("info", scope, msg, { ...base, ...f }),
    warn: (msg, f = {}) => write("warn", scope, msg, { ...base, ...f }),
    error: (msg, f = {}) => write("error", scope, msg, { ...base, ...f }),
    child: (child, f = {}) => createLogger(child, { ...base, ...f }),
  }
}

export const log = createLogger("worker")
