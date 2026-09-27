"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ConfirmButton, useAdminAction } from "@/components/admin/client"
import { LocalTime } from "@/components/app/local-time"
import { deleteJobAction, retryAllFailedJobsAction, retryJobAction } from "@/app/admin/system/actions"
import { cn } from "@/lib/utils"

/** Re-renders the page on the server (re-runs every health check). */
export function RecheckButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button variant="outline" size="sm" onClick={() => startTransition(() => router.refresh())} disabled={pending}>
      {pending ? <Spinner /> : <RefreshCw />} Re-run checks
    </Button>
  )
}

export type FailedJobView = {
  id: string
  type: string
  attempts: number
  maxAttempts: number
  lastError: string | null
  payloadJson: string
  createdAt: string
  runAt: string
}

export function RetryAllButton({ count }: { count: number }) {
  return (
    <ConfirmButton
      title={`Retry ${count} failed ${count === 1 ? "job" : "jobs"}?`}
      description="Their attempt counters are reset and the worker picks them up right away."
      confirmLabel="Retry all"
      variant="outline"
      action={() => retryAllFailedJobsAction({})}
      success="Failed jobs queued for retry"
    >
      <RotateCcw /> Retry all
    </ConfirmButton>
  )
}

function JobRow({ job }: { job: FailedJobView }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useAdminAction()
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code className="font-mono text-[13px] font-medium">{job.type}</code>
              <span className="font-mono text-[11px] text-muted-foreground">
                {job.attempts}/{job.maxAttempts} attempts
              </span>
              <span className="text-[11px] text-muted-foreground">
                · created <LocalTime date={job.createdAt} format="relative" />
              </span>
            </span>
            <span className={cn("mt-1 block text-[13px] text-destructive", !open && "line-clamp-2")}>
              {job.lastError ?? "No error recorded"}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5 pl-6 sm:pl-0">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => retryJobAction({ id: job.id }), {
                success: `Retrying ${job.type}`,
              })
            }
          >
            {pending ? <Spinner /> : <RotateCcw />} Retry
          </Button>
          <ConfirmButton
            title="Delete this job?"
            description={
              <>
                The <code className="font-mono">{job.type}</code> job is removed permanently and won&apos;t run again.
              </>
            }
            confirmLabel="Delete job"
            destructive
            variant="ghost"
            action={() => deleteJobAction({ id: job.id })}
            success="Job deleted"
          >
            <Trash2 />
            <span className="sr-only sm:not-sr-only">Delete</span>
          </ConfirmButton>
        </div>
      </div>
      {open && (
        <div className="mt-3 ml-6 grid gap-2 text-[13px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>
              Created <LocalTime date={job.createdAt} />
            </span>
            <span>
              Last scheduled <LocalTime date={job.runAt} format="relative" titleFormat="datetime" />
            </span>
            <span className="font-mono text-xs">{job.id}</span>
          </div>
          <pre className="scrollbar-thin max-h-56 overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
            {job.payloadJson}
          </pre>
        </div>
      )}
    </li>
  )
}

export function FailedJobsList({ jobs }: { jobs: FailedJobView[] }) {
  return (
    <ul className="divide-y divide-border">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </ul>
  )
}
