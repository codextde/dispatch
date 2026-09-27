import { Skeleton } from "@/components/ui/skeleton"

export default function AnalyticsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-6 md:pt-8 lg:px-10" aria-busy="true" aria-label="Loading analytics">
      <Skeleton className="mb-3 h-3 w-16" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 mb-5 flex flex-wrap gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-40 lg:ml-auto" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-2 h-3 w-64" />
        <Skeleton className="mt-6 h-[220px] w-full" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-56" />
            <Skeleton className="mt-6 h-[180px] w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
