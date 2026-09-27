"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { EditorContent, Extension, ReactRenderer, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Image from "@tiptap/extension-image"
import Mention from "@tiptap/extension-mention"
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import { Bold, Code, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting, Strikethrough, Underline } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/app/user-avatar"
import { memberName } from "@/lib/inbox/format"
import type { MemberSummary } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"

/** Shared typography for editors and rendered comments/messages written in Dispatch. */
export const PROSE =
  "text-[14px] leading-relaxed [&_a]:text-info [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12.5px] [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:max-w-full [&_img]:rounded [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-2 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_.mention]:rounded [&_.mention]:bg-brand-soft [&_.mention]:px-1 [&_.mention]:py-px [&_.mention]:font-medium [&_.mention]:text-foreground"

/** Tiptap placeholder (the extension only adds `data-placeholder`; styling is ours). */
const PLACEHOLDER =
  "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"

const isCoarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches

/** Paste/drop of files → upload handler (instead of inlining them into the document). */
function fileProps(get: () => ((files: File[]) => void) | undefined) {
  return {
    handlePaste: (_view: unknown, event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])]
      const handler = get()
      if (!files.length || !handler) return false
      event.preventDefault()
      handler(files)
      return true
    },
    handleDrop: (_view: unknown, event: DragEvent) => {
      const files = [...(event.dataTransfer?.files ?? [])]
      const handler = get()
      if (!files.length || !handler) return false
      event.preventDefault()
      handler(files)
      return true
    },
  }
}

/* --------------------------------- Email ---------------------------------- */

export function useEmailEditor({
  content,
  placeholder = "Write your reply…",
  onChange,
  onSubmit,
  onFiles,
  autofocus = false,
}: {
  content: string
  placeholder?: string
  onChange?: (html: string, editor: Editor) => void
  onSubmit?: (opts: { close: boolean }) => void
  onFiles?: (files: File[]) => void
  autofocus?: boolean
}) {
  const cb = useRef({ onChange, onSubmit, onFiles })
  useEffect(() => {
    cb.current = { onChange, onSubmit, onFiles }
  })
  return useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    autofocus: autofocus ? "start" : false,
    content,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      Image.configure({ inline: true, allowBase64: false }),
      Placeholder.configure({ placeholder }),
      Extension.create({
        name: "dispatchSend",
        // Before StarterKit's own Mod-Enter (hard break).
        priority: 1000,
        addKeyboardShortcuts() {
          return {
            "Mod-Enter": () => (cb.current.onSubmit?.({ close: false }), true),
            "Mod-Shift-Enter": () => (cb.current.onSubmit?.({ close: true }), true),
          }
        },
      }),
    ],
    editorProps: {
      // Handlers run on paste/drop events, never during render.
      // eslint-disable-next-line react-hooks/refs
      ...fileProps(() => cb.current.onFiles),
      attributes: {
        class: cn(PROSE, PLACEHOLDER, "min-h-[120px] px-3 py-2.5 outline-none max-md:min-h-[40dvh]"),
        "aria-label": "Message body",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => cb.current.onChange?.(editor.getHTML(), editor),
  })
}

function ToolbarButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle size="sm" pressed={!!active} onPressedChange={onClick} aria-label={label} className="size-7 min-w-7 p-0 [&_svg]:size-3.5">
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function LinkButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const active = useEditorState({ editor, selector: ({ editor }) => editor.isActive("link") })
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setUrl((editor.getAttributes("link").href as string | undefined) ?? "")
      }}
    >
      <PopoverTrigger asChild>
        <Toggle size="sm" pressed={active} aria-label="Link" className="size-7 min-w-7 p-0 [&_svg]:size-3.5">
          <Link2 />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const href = url.trim()
            const chain = editor.chain().focus().extendMarkRange("link")
            if (!href) chain.unsetLink().run()
            else chain.setLink({ href: /^(https?:|mailto:|tel:)/i.test(href) ? href : `https://${href}` }).run()
            setOpen(false)
          }}
        >
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-8" autoFocus aria-label="Link URL" />
          <Button type="submit" size="sm" className="h-8">
            {url.trim() ? "Save" : "Remove"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function EditorToolbar({ editor, className }: { editor: Editor | null; className?: string }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            code: e.isActive("code"),
          }
        : null,
  })
  if (!editor) return null
  // useEditorState only reports after the first transaction of a freshly mounted editor.
  const active = state ?? { bold: false, italic: false, underline: false, strike: false, bullet: false, ordered: false, quote: false, code: false }
  const chain = () => editor.chain().focus()
  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)} role="toolbar" aria-label="Formatting">
      <ToolbarButton label="Bold" active={active.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={active.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label="Underline" active={active.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={active.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton label="Bulleted list" active={active.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={active.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton label="Quote" active={active.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote />
      </ToolbarButton>
      <ToolbarButton label="Code" active={active.code} onClick={() => chain().toggleCode().run()}>
        <Code />
      </ToolbarButton>
      <LinkButton editor={editor} />
      <ToolbarButton label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting />
      </ToolbarButton>
    </div>
  )
}

/* ------------------------------ Mentions list ------------------------------ */

export type MentionListHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean }
type MentionListProps = SuggestionProps<MemberSummary, { id: string; label: string }>

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList({ items, command }, ref) {
  const [index, setIndex] = useState(0)
  const [prevItems, setPrevItems] = useState(items)
  if (prevItems !== items) {
    setPrevItems(items)
    setIndex(0)
  }
  const select = (i: number) => {
    const m = items[i]
    if (m) command({ id: m.id, label: memberName(m) })
  }
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        select(index)
        return true
      }
      return false
    },
  }))
  if (!items.length) {
    return <div className="rounded-lg bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md ring-1 ring-foreground/10">No teammates found</div>
  }
  return (
    <div role="listbox" aria-label="Mention a teammate" className="max-h-64 w-72 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
      {items.map((m, i) => (
        <button
          key={m.id}
          type="button"
          role="option"
          aria-selected={i === index}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            select(i)
          }}
          className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === index && "bg-muted")}
        >
          <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />
          <span className="shrink-0 truncate">{memberName(m)}</span>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{m.email}</span>
        </button>
      ))}
    </div>
  )
})

function mentionSuggestion(getMembers: () => MemberSummary[], activeRef: { current: boolean }) {
  return {
    char: "@",
    allowSpaces: false,
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase()
      return getMembers()
        .filter((m) => (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        .slice(0, 8)
    },
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, MentionListProps> | null = null
      let unmount: (() => void) | null = null
      return {
        onStart: (props: MentionListProps) => {
          activeRef.current = true
          renderer = new ReactRenderer(MentionList, { props, editor: props.editor })
          renderer.element.style.zIndex = "60"
          renderer.element.style.pointerEvents = "auto"
          unmount = props.mount(renderer.element)
        },
        onUpdate: (props: MentionListProps) => renderer?.updateProps(props),
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            unmount?.()
            unmount = null
            return true
          }
          return renderer?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          activeRef.current = false
          unmount?.()
          renderer?.destroy()
          renderer = null
          unmount = null
        },
      }
    },
  }
}

/* -------------------------------- Comments --------------------------------- */

export function useCommentEditor({
  members,
  placeholder = "Comment or @mention…",
  content = "",
  onSubmit,
  onChange,
  onFiles,
  onEscape,
  onReady,
  autofocus = false,
}: {
  members: MemberSummary[]
  placeholder?: string
  content?: string
  onSubmit?: () => void
  onChange?: (editor: Editor) => void
  onFiles?: (files: File[]) => void
  onEscape?: () => void
  /** Called once the editor exists (e.g. to sync UI state with restored content) */
  onReady?: (editor: Editor) => void
  autofocus?: boolean
}) {
  const cb = useRef({ onSubmit, onChange, onFiles, onEscape, members, onReady })
  useEffect(() => {
    cb.current = { onSubmit, onChange, onFiles, onEscape, members, onReady }
  })
  const suggesting = useRef(false)
  return useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    autofocus: autofocus ? "end" : false,
    content,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        // The suggestion plugin reads members / its active flag while typing, never during render.
        // eslint-disable-next-line react-hooks/refs
        suggestion: mentionSuggestion(() => cb.current.members, suggesting),
      }),
      Extension.create({
        name: "dispatchCommentKeys",
        // Runs before the default Enter handling; yields to the mention popup while it is open.
        priority: 1000,
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (suggesting.current || isCoarse()) return false
              cb.current.onSubmit?.()
              return true
            },
            "Mod-Enter": () => (cb.current.onSubmit?.(), true),
            "Shift-Enter": ({ editor }) =>
              editor.commands.first(({ commands }) => [
                () => commands.newlineInCode(),
                () => commands.splitListItem("listItem"),
                () => commands.createParagraphNear(),
                () => commands.liftEmptyBlock(),
                () => commands.splitBlock(),
              ]),
            Escape: () => {
              if (suggesting.current) return false
              cb.current.onEscape?.()
              return !!cb.current.onEscape
            },
          }
        },
      }),
    ],
    editorProps: {
      // eslint-disable-next-line react-hooks/refs -- paste/drop handlers, see above
      ...fileProps(() => cb.current.onFiles),
      attributes: {
        class: cn(PROSE, PLACEHOLDER, "max-h-60 min-h-[22px] overflow-y-auto outline-none"),
        "aria-label": "Comment",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onCreate: ({ editor }) => cb.current.onReady?.(editor),
    onUpdate: ({ editor }) => cb.current.onChange?.(editor),
  })
}

export function isEditorEmpty(editor: Editor | null) {
  if (!editor) return true
  return editor.isEmpty || (editor.getText().trim().length === 0 && !editor.getHTML().includes("<img"))
}

export { EditorContent }
