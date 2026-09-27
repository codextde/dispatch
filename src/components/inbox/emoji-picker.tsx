"use client"

import { useState } from "react"
import { EmojiPicker, type EmojiPickerListCategoryHeaderProps, type EmojiPickerListEmojiProps, type EmojiPickerListRowProps } from "frimousse"
import { LoaderCircle, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useInbox } from "./inbox-provider"

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏", "✅", "🔥"]

function CategoryHeader({ category, ...props }: EmojiPickerListCategoryHeaderProps) {
  return (
    <div className="bg-popover px-3 pt-2.5 pb-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase" {...props}>
      {category.label}
    </div>
  )
}

function Row({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div className="scroll-my-1.5 px-1.5" {...props}>
      {children}
    </div>
  )
}

function EmojiButton({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button type="button" aria-label={emoji.label} className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-muted" {...props}>
      {emoji.emoji}
    </button>
  )
}

const LIST_COMPONENTS = { CategoryHeader, Row, Emoji: EmojiButton }

/**
 * Emoji picker in a popover: a row of quick reactions plus the full,
 * searchable set (frimousse). Emoji data is served same-origin by
 * /api/w/[slug]/reactions/emoji (the CSP blocks third-party CDNs).
 */
export function EmojiPickerPopover({
  onPick,
  children,
  align = "start",
  side = "top",
}: {
  onPick: (emoji: string) => void
  children: React.ReactNode
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
}) {
  const { slug } = useInbox()
  const [open, setOpen] = useState(false)
  const pick = (emoji: string) => {
    onPick(emoji)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-[17.5rem] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-0.5 border-b px-1.5 py-1.5" role="group" aria-label="Quick reactions">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              aria-label={`React with ${emoji}`}
              className="flex size-8 items-center justify-center rounded-md text-lg outline-none transition-transform hover:scale-110 hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {emoji}
            </button>
          ))}
        </div>
        {open && (
          <EmojiPicker.Root
            className="isolate flex h-80 w-full flex-col bg-popover"
            columns={8}
            emojibaseUrl={`/api/w/${slug}/reactions/emoji`}
            onEmojiSelect={({ emoji }) => pick(emoji)}
          >
            <div className="relative z-10 mx-2 mt-2">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <EmojiPicker.Search
                autoFocus
                aria-label="Search emoji"
                placeholder="Search emoji…"
                className="h-8 w-full appearance-none rounded-md border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
            <EmojiPicker.Viewport className="scrollbar-thin relative mt-1 flex-1 outline-hidden">
              <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Loading emoji…
              </EmojiPicker.Loading>
              <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {({ search }) => <>No emoji found for “{search}”.</>}
              </EmojiPicker.Empty>
              <EmojiPicker.List
                className="pb-1.5 select-none"
                components={LIST_COMPONENTS}
              />
            </EmojiPicker.Viewport>
          </EmojiPicker.Root>
        )}
      </PopoverContent>
    </Popover>
  )
}
