"use client"

import { useEffect, useState } from "react"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Image from "@tiptap/extension-image"
import {
  Bold,
  Braces,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type TemplateVariable = { token: string; label: string }

export const RESPONSE_VARIABLES: TemplateVariable[] = [
  { token: "{{contact.first_name}}", label: "Contact first name" },
  { token: "{{contact.name}}", label: "Contact name" },
  { token: "{{contact.email}}", label: "Contact email" },
  { token: "{{user.name}}", label: "Your name" },
  { token: "{{user.first_name}}", label: "Your first name" },
  { token: "{{org.name}}", label: "Workspace name" },
]

export const SIGNATURE_VARIABLES: TemplateVariable[] = [
  { token: "{{user.name}}", label: "Name" },
  { token: "{{user.title}}", label: "Job title" },
  { token: "{{user.email}}", label: "Email" },
]

/** Typography for rendered rich text (editor and previews). */
export const richTextClass =
  "text-sm leading-relaxed text-foreground [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_hr]:my-3 [&_img]:inline-block [&_img]:max-h-40 [&_img]:max-w-full [&_img]:rounded [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5"

/** Render trusted (server-sanitized) HTML with rich text typography. */
export function RichTextPreview({ html, className }: { html: string; className?: string }) {
  return <div className={cn(richTextClass, className)} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Highlight {{variables}} in a preview string by substituting sample values. */
export function fillSampleVariables(html: string, samples: Record<string, string>) {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => {
    const v = samples[key]
    if (v === undefined) return m
    return `<span style="background:color-mix(in oklch, var(--brand) 18%, transparent);border-radius:3px;padding:0 2px">${v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</span>`
  })
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
  disabled,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn("text-muted-foreground", active && "bg-muted text-foreground")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const apply = () => {
    const v = url.trim()
    if (!v) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
    } else {
      const href = /^(https?:|mailto:|tel:)/i.test(v) ? v : `https://${v}`
      if (editor.state.selection.empty && !active) {
        editor.chain().focus().insertContent({ type: "text", text: v, marks: [{ type: "link", attrs: { href } }] }).run()
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
      }
    }
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setUrl((editor.getAttributes("link").href as string | undefined) ?? "")
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Link"
              aria-pressed={active}
              onMouseDown={(e) => e.preventDefault()}
              className={cn("text-muted-foreground", active && "bg-muted text-foreground")}
            >
              <Link2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Link</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80 p-2">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <Input autoFocus placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link URL" />
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function ImageButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState("")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Image" className="text-muted-foreground">
              <ImageIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Insert image</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80 p-2">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = src.trim()
            if (/^https:\/\//i.test(v)) {
              editor.chain().focus().setImage({ src: v }).run()
              setSrc("")
              setOpen(false)
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            <Input autoFocus placeholder="https://…/logo.png" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Image URL" />
            <Button type="submit" size="sm" disabled={!/^https:\/\//i.test(src.trim())}>
              Insert
            </Button>
          </div>
          <p className="px-0.5 text-xs text-muted-foreground">Use a public https:// image URL (e.g. your logo).</p>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Rich text editor (Tiptap) for canned responses, signatures and auto
 * replies. Emits HTML; the server sanitizes on save. Remount with a `key`
 * to load different content.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something…",
  variables,
  allowImages = false,
  className,
  minHeight = 160,
  id,
  "aria-invalid": ariaInvalid,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  variables?: TemplateVariable[]
  allowImages?: boolean
  className?: string
  minHeight?: number
  id?: string
  "aria-invalid"?: boolean
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Placeholder.configure({ placeholder }),
      ...(allowImages ? [Image.configure({ inline: true })] : []),
    ],
    content: value,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class: cn(
          richTextClass,
          "px-3 py-2.5 outline-none [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"
        ),
        style: `min-height:${minHeight}px`,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  })

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            link: e.isActive("link"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
          }
        : null,
  })

  // Keep the editor in sync when the value is reset from outside (e.g. "Reset" in a save bar)
  useEffect(() => {
    if (!editor) return
    const current = editor.isEmpty ? "" : editor.getHTML()
    if (value !== current) editor.commands.setContent(value || "", { emitUpdate: false })
  }, [editor, value])

  return (
    <div
      aria-invalid={ariaInvalid}
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-surface/60 px-1.5 py-1" role="toolbar" aria-label="Formatting">
        {editor && state ? (
          <>
            <ToolbarButton label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold />
            </ToolbarButton>
            <ToolbarButton label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic />
            </ToolbarButton>
            <ToolbarButton label="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon />
            </ToolbarButton>
            <ToolbarButton label="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <LinkButton editor={editor} active={state.link} />
            {state.link && (
              <ToolbarButton label="Remove link" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
                <Unlink />
              </ToolbarButton>
            )}
            {allowImages && <ImageButton editor={editor} />}
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <ToolbarButton label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List />
            </ToolbarButton>
            <ToolbarButton label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered />
            </ToolbarButton>
            <ToolbarButton label="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote />
            </ToolbarButton>
            <ToolbarButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
              <RemoveFormatting />
            </ToolbarButton>
          </>
        ) : (
          <div className="h-7" />
        )}
      </div>
      <EditorContent editor={editor} />
      {variables && variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t bg-surface/40 px-2.5 py-2">
          <span className="mr-0.5 flex items-center gap-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            <Braces className="size-3" /> Variables
          </span>
          {variables.map((v) => (
            <button
              key={v.token}
              type="button"
              title={v.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().insertContent(v.token).run()}
              className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand/50 hover:bg-brand-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {v.token}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
