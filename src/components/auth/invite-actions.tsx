"use client"

import { useState, useTransition } from "react"
import { ArrowRight, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { acceptInviteAction, switchAccountAction } from "@/app/invite/[token]/actions"

/** Buttons of the invitation page. Both actions redirect on success. */
export function InviteActions({ token, mode, orgName }: { token: string; mode: "accept" | "switch"; orgName: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: typeof acceptInviteAction) {
    setError(null)
    startTransition(async () => {
      const res = await fn({ token })
      if (res && !res.ok) setError(res.error)
    })
  }

  return (
    <div>
      {mode === "accept" ? (
        <Button size="lg" className="h-10 w-full rounded-md" disabled={pending} onClick={() => run(acceptInviteAction)} autoFocus>
          {pending ? <Spinner /> : null}
          Join {orgName}
          {!pending && <ArrowRight />}
        </Button>
      ) : (
        <Button size="lg" variant="outline" className="h-10 w-full rounded-md bg-card" disabled={pending} onClick={() => run(switchAccountAction)}>
          {pending ? <Spinner /> : <LogOut />}
          Sign out and continue
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
