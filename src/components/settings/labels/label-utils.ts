export type LabelItem = {
  id: string
  name: string
  color: string
  parentId: string | null
  visibility: "shared" | "private"
  position: number
  showInSidebar: boolean
  conversationCount: number
}

export type FlatLabel = LabelItem & { depth: number; hasChildren: boolean; path: string }

export const MAX_LABEL_DEPTH = 3

const byOrder = (a: LabelItem, b: LabelItem) => a.position - b.position || a.name.localeCompare(b.name)

/** Depth-first flattening of the label tree (orphans are treated as roots). */
export function flattenLabels(items: LabelItem[]): FlatLabel[] {
  const ids = new Set(items.map((i) => i.id))
  const children = new Map<string | null, LabelItem[]>()
  for (const item of items) {
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(item)
  }
  const out: FlatLabel[] = []
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const item of (children.get(parent) ?? []).sort(byOrder)) {
      const path = prefix ? `${prefix} / ${item.name}` : item.name
      out.push({ ...item, depth, hasChildren: (children.get(item.id)?.length ?? 0) > 0, path })
      if (depth < 10) walk(item.id, depth + 1, path)
    }
  }
  walk(null, 1, "")
  return out
}

export function descendantIds(id: string, items: LabelItem[]): Set<string> {
  const out = new Set<string>()
  const queue = [id]
  while (queue.length) {
    const cur = queue.shift()!
    for (const l of items) {
      if (l.parentId === cur && !out.has(l.id)) {
        out.add(l.id)
        queue.push(l.id)
      }
    }
  }
  return out
}

export function subtreeHeight(id: string, items: LabelItem[]): number {
  const kids = items.filter((l) => l.parentId === id)
  return 1 + (kids.length ? Math.max(...kids.map((k) => subtreeHeight(k.id, items))) : 0)
}

/** Readable text color (black/white) for a hex background. */
export function contrastText(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return "#fff"
  const n = parseInt(m[1]!, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#141414" : "#ffffff"
}
