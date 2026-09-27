/**
 * Run `fn` for every item with at most `concurrency` in flight. A slow item
 * only holds its own slot; the others keep going (unlike fixed-size rounds).
 */
export async function runPool<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length) await fn(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane))
}
