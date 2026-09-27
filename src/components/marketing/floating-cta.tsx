"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "motion/react"
import { ArrowRight, Star } from "lucide-react"
import { APP_ENTRY, GITHUB_URL } from "@/content/marketing/site"
import { GitHubMark } from "./primitives"

/**
 * Dark pill pinned to the bottom of the viewport once the visitor has
 * scrolled past the hero; hides again when the footer comes into view.
 */
export function FloatingCta({ signedIn, stars }: { signedIn: boolean; stars: string | null }) {
  const [pastHero, setPastHero] = useState(false)
  const [footerVisible, setFooterVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > Math.min(720, window.innerHeight * 0.9))
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    const footer = document.getElementById("site-footer")
    const io = footer
      ? new IntersectionObserver(([entry]) => setFooterVisible(entry.isIntersecting), {
          rootMargin: "0px 0px -40px 0px",
        })
      : null
    if (footer && io) io.observe(footer)
    return () => {
      window.removeEventListener("scroll", onScroll)
      io?.disconnect()
    }
  }, [])

  const show = pastHero && !footerVisible

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {show && (
            <m.aside
              aria-label="Get started"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="safe-bottom pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:bottom-5"
            >
              <div className="mk-dark pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#161616]/95 p-1 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md">
                <Link
                  href={APP_ENTRY}
                  className="group inline-flex h-9 items-center gap-1.5 rounded-full bg-[#faf9f5] px-4 text-[13px] font-medium text-[#141414] outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {signedIn ? "Open app" : "Start free"}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/self-hosting"
                  className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Self-host
                </Link>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={stars ? `Dispatch on GitHub, ${stars} stars` : "Dispatch on GitHub"}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <GitHubMark className="size-3.5" />
                  {stars ? (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Star className="size-3 fill-current text-brand" aria-hidden />
                      {stars}
                    </span>
                  ) : (
                    <span className="hidden sm:inline">GitHub</span>
                  )}
                </a>
              </div>
            </m.aside>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  )
}
