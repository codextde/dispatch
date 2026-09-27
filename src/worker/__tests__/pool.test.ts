import { describe, expect, it } from "vitest"
import { runPool } from "../pool"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("runPool (worker queue fairness, L18)", () => {
  it("never runs more than `concurrency` items at once", async () => {
    let active = 0
    let peak = 0
    await runPool(Array.from({ length: 12 }, (_, i) => i), 5, async () => {
      peak = Math.max(peak, ++active)
      await sleep(5)
      active--
    })
    expect(peak).toBe(5)
  })

  it("keeps the other slots busy while one item is slow", async () => {
    const done: string[] = []
    const started = Date.now()
    await runPool(["slow", ...Array.from({ length: 8 }, (_, i) => `fast${i}`)], 3, async (item) => {
      await sleep(item === "slow" ? 200 : 10)
      done.push(item)
    })
    // Fixed rounds of 3 would wait for "slow" before starting the rest
    expect(done.indexOf("slow")).toBe(8)
    expect(Date.now() - started).toBeLessThan(400)
  })

  it("handles empty input", async () => {
    await expect(runPool([], 5, async () => {})).resolves.toBeUndefined()
  })
})
