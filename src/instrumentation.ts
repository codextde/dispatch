/**
 * Runs once when the Next.js server starts. On a fresh instance, print the
 * one-time setup code to the logs so only the server operator can claim the
 * instance at /setup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  try {
    const { isSetupComplete } = await import("@/server/settings")
    if (await isSetupComplete()) return
    const setup = (await import("@/server/setup")) as { printSetupBanner?: () => Promise<void> | void }
    await setup.printSetupBanner?.()
  } catch (err) {
    // The database may not be migrated yet on the very first request; /setup prints the code again.
    console.warn("[dispatch] could not print setup banner:", err instanceof Error ? err.message : err)
  }
}
