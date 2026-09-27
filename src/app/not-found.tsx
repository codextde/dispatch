import Link from "next/link"
import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <LogoMark className="size-10" />
      <p className="mt-8 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Error 404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-display sm:text-5xl">
        Lost in the inbox. <span className="text-quiet">This page doesn&apos;t exist.</span>
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        The link may be broken, or you might not have access to this workspace.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild className="rounded-none px-5">
          <Link href="/login">Go to my inbox</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-none px-5">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  )
}
