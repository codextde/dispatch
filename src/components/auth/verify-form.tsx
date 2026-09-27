"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowRight, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { verifyMagicLinkAction, type VerifyLinkState } from "@/app/login/actions"

/** "Continue as …" confirmation for a magic link; the POST consumes the token. */
export function VerifyForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState<VerifyLinkState, FormData>(verifyMagicLinkAction, { error: null })

  if (state.error) {
    return (
      <div>
        <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive" role="alert">
          <TriangleAlert className="mt-px size-4 shrink-0" />
          {state.error}
        </div>
        <Button asChild size="lg" className="mt-5 h-10 w-full rounded-md">
          <Link href={`/login?email=${encodeURIComponent(email)}`}>Request a new link</Link>
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" className="h-10 w-full rounded-md" disabled={pending} autoFocus>
        {pending ? <Spinner /> : null}
        {pending ? "Signing you in…" : "Continue"}
        {!pending && <ArrowRight />}
      </Button>
    </form>
  )
}
