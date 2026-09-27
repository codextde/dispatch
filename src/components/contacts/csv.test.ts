import { describe, expect, it } from "vitest"
import { detectDelimiter, guessMapping, parseCsv, rowsToContacts } from "./csv"

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded newlines and BOM", () => {
    const text = '﻿name,email,notes\r\n"Doe, Jane",jane@x.io,"Said ""hi""\nsecond line"\n\nBob,bob@x.io,\n'
    expect(parseCsv(text)).toEqual([
      ["name", "email", "notes"],
      ["Doe, Jane", "jane@x.io", 'Said "hi"\nsecond line'],
      ["Bob", "bob@x.io", ""],
    ])
  })
  it("detects semicolons and tabs", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";")
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t")
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })
})

describe("mapping", () => {
  it("guesses common headers (Google/Outlook style)", () => {
    expect(guessMapping(["First Name", "Last Name", "E-mail Address", "Organization", "Job Title", "Mobile Phone", "Favourite colour"])).toEqual([
      "firstName",
      "lastName",
      "email",
      "company",
      "title",
      "phone",
      null,
    ])
  })
  it("builds import rows, combining names, splitting tags and keeping extra columns", () => {
    const headers = ["First Name", "Last Name", "Email", "Tags", "Plan"]
    const rows = [
      ["Jane", "Doe", "mailto:jane@x.io", "vip; customer", "Pro"],
      ["No", "Email", "", "", ""],
    ]
    expect(rowsToContacts(headers, rows, guessMapping(headers), { customFields: true })).toEqual([
      { email: "jane@x.io", name: "Jane Doe", tags: ["vip", "customer"], customFields: { Plan: "Pro" } },
    ])
  })
})
