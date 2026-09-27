"use server"

import { z } from "zod"
import { adminAction } from "@/server/admin/guard"
import { deleteJob, retryJobs } from "@/server/admin/system"
import { ApiError } from "@/server/api"

/** Reset a failed job so the worker runs it again. */
export const retryJobAction = adminAction(z.object({ id: z.uuid() }), async ({ id }, admin) => {
  const retried = await retryJobs([id])
  if (!retried.length) throw new ApiError(404, "Job not found or already completed.")
  await admin.audit("admin.job_retried", {
    targetType: "job",
    targetId: id,
    metadata: { type: retried[0]!.type },
  })
  return { count: retried.length }
})

/** Retry every job that ran out of attempts. */
export const retryAllFailedJobsAction = adminAction(z.object({}), async (_input, admin) => {
  const retried = await retryJobs("all_failed")
  if (retried.length) {
    await admin.audit("admin.job_retried", {
      targetType: "job",
      metadata: {
        count: retried.length,
        types: [...new Set(retried.map((j) => j.type))],
        ids: retried.map((j) => j.id).slice(0, 100),
      },
    })
  }
  return { count: retried.length }
})

/** Permanently remove a job that hasn't completed. */
export const deleteJobAction = adminAction(z.object({ id: z.uuid() }), async ({ id }, admin) => {
  const deleted = await deleteJob(id)
  if (!deleted) throw new ApiError(404, "Job not found or already completed.")
  await admin.audit("admin.job_deleted", {
    targetType: "job",
    targetId: id,
    metadata: { type: deleted.type },
  })
  return { id }
})
