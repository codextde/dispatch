import type { Metadata } from "next"
import { Check, Globe, Monitor, Smartphone, TabletSmartphone } from "lucide-react"
import { BentoCard } from "@/components/marketing/bento"
import { CtaSection } from "@/components/marketing/cta-section"
import {
  AndroidMenu,
  BrowserWindow,
  DesktopInbox,
  DesktopInstallPrompt,
  HomeScreen,
  IosShareSheet,
  NotificationToast,
  PhoneFrame,
  PhoneInbox,
} from "@/components/marketing/devices"
import { FaqSection } from "@/components/marketing/faq"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, GitHubMark, MonoLabel, Section, SectionHeading, StepLabel } from "@/components/marketing/primitives"
import { FeatureVisual } from "@/components/marketing/visuals"
import { InboxVisual } from "@/components/marketing/visuals/platform"
import { APP_ENTRY, GITHUB_DISCUSSIONS_URL } from "@/content/marketing/site"
import type { Faq } from "@/content/marketing/types"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Download",
  description:
    "Use Dispatch in any browser and install it as an app on macOS, Windows, Linux, iPhone, iPad and Android. Step-by-step install instructions for every platform.",
  alternates: { canonical: "/download" },
}

const platforms = [
  { id: "desktop", icon: Monitor, name: "Desktop", how: "Install from Chrome, Edge or Safari", status: "Installable" },
  { id: "ios", icon: TabletSmartphone, name: "iPhone & iPad", how: "Safari → Add to Home Screen", status: "Installable" },
  { id: "android", icon: Smartphone, name: "Android", how: "Chrome → Add to Home screen", status: "Installable" },
  { id: "browser", icon: Globe, name: "Any browser", how: "Chrome, Edge, Safari, Firefox", status: "Works today" },
]

type Guide = {
  id: string
  label: string
  title: string
  quiet: string
  intro: string
  steps: React.ReactNode[]
  note?: React.ReactNode
  visual: React.ReactNode
  alt: string
}

const guides: Guide[] = [
  {
    id: "desktop",
    label: "macOS · Windows · Linux · ChromeOS",
    title: "Install it on your desktop.",
    quiet: "Its own window, in the dock.",
    intro:
      "Installed, Dispatch opens in its own window without tabs or an address bar, gets an icon in your dock, taskbar or app launcher, and stays signed in with your browser session.",
    steps: [
      <>Open your Dispatch address in <strong>Chrome</strong> or <strong>Edge</strong> and sign in.</>,
      <>
        Click the <strong>install icon</strong> at the right end of the address bar. No icon? In Chrome open{" "}
        <strong>⋮ → Cast, save, and share → Install page as app</strong>; in Edge, <strong>… → Apps → Install this site as an app</strong>.
      </>,
      <>Confirm with <strong>Install</strong>. Dispatch opens in its own window; pin it to the dock or taskbar.</>,
    ],
    note: (
      <>
        <strong>Safari on a Mac</strong> (macOS Sonoma or later): <strong>File → Add to Dock</strong>. Firefox doesn&apos;t install web
        apps, but Dispatch works fine in a pinned tab.
      </>
    ),
    visual: <DesktopInstallPrompt />,
    alt: "A browser window with the install icon highlighted in the address bar and an Install app dialog for Dispatch",
  },
  {
    id: "ios",
    label: "iPhone · iPad",
    title: "Put it on your home screen.",
    quiet: "Full screen, no app store.",
    intro:
      "On iPhone and iPad, Safari adds Dispatch to the home screen. It opens full screen like any other app, and updates arrive with the server, not the App Store.",
    steps: [
      <>Open your Dispatch address in <strong>Safari</strong>.</>,
      <>Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>. Scroll down the share sheet if you don&apos;t see it.</>,
      <>Tap <strong>Add</strong>, open Dispatch from the home screen and sign in once more.</>,
    ],
    note: (
      <>
        Home-screen apps on iOS keep their own sign-in, separate from Safari. That&apos;s why you sign in again after
        adding it; the session then lasts as long as on any other device.
      </>
    ),
    visual: (
      <PhoneFrame>
        <IosShareSheet />
      </PhoneFrame>
    ),
    alt: "Safari's share sheet on an iPhone with Add to Home Screen highlighted",
  },
  {
    id: "android",
    label: "Android",
    title: "Install it on Android.",
    quiet: "One tap from Chrome.",
    intro:
      "Chrome installs Dispatch as an app with its own icon in the launcher and app switcher, and opens it without browser controls.",
    steps: [
      <>Open your Dispatch address in <strong>Chrome</strong> and sign in.</>,
      <>Tap <strong>⋮</strong> in the top right and choose <strong>Add to Home screen</strong> (some versions say <strong>Install app</strong>).</>,
      <>Tap <strong>Install</strong>. Dispatch appears on your home screen and in the app drawer.</>,
    ],
    note: <>Other Android browsers, such as Samsung Internet, Edge and Firefox, have a similar option in their menus.</>,
    visual: (
      <PhoneFrame>
        <AndroidMenu />
      </PhoneFrame>
    ),
    alt: "Chrome's menu on an Android phone with Add to Home screen highlighted",
  },
]

const faq: Faq[] = [
  {
    q: "Is there a native app for iPhone or Android?",
    a: "Not yet. Native iOS and Android apps are on the roadmap. Today Dispatch installs from the browser as a web app with its own icon and full-screen window, and it's the same app your team uses on desktop.",
  },
  {
    q: "Do I need to download anything?",
    a: "No. Dispatch runs in any modern browser, and installing it is optional. There is nothing to update on each device: every browser and installed app runs the version on the server.",
  },
  {
    q: "Which browsers are supported?",
    a: "Current versions of Chrome, Edge, Safari and Firefox. Installing as an app works in Chrome and Edge on desktop and Android, in Safari on iPhone and iPad, and in Safari on a Mac with macOS Sonoma or later.",
  },
  {
    q: "Will I get notifications?",
    a: "While Dispatch is open, it can show desktop notifications for mentions and assignments; turn them on in your notification settings. If a mention or assignment is still unread after a minute, Dispatch also emails it to you. Push notifications to a closed app aren't supported yet.",
  },
  {
    q: "Does it work offline?",
    a: "No. Dispatch needs a connection to sync mail and to show your team's changes in real time.",
  },
  {
    q: "We self-host Dispatch. Can we install it too?",
    a: "Yes. Open your own instance's address and follow the same steps. The installed app opens your instance, and your mail never touches our servers.",
  },
  {
    q: "How long do I stay signed in?",
    a: "Each device gets its own session, which stays signed in for up to a year by default. You can see and revoke your devices at any time, and admins can shorten the session length.",
  },
]

export default async function DownloadPage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        align="center"
        eyebrow={<MonoLabel>Download</MonoLabel>}
        title="Dispatch everywhere."
        quiet="Browser, desktop and phone."
        description="Dispatch runs in any modern browser and installs as an app on your Mac, PC, iPhone, iPad or Android phone. No app store, no installer, nothing to update on each device."
        actions={
          <>
            <ButtonLink href={APP_ENTRY} size="lg" arrow>
              Open Dispatch
            </ButtonLink>
            <ButtonLink href="#install" size="lg" variant="secondary">
              How to install
            </ButtonLink>
          </>
        }
      >
        <div
          role="img"
          aria-label="Dispatch in a desktop browser window with a three-pane inbox, and the same inbox on a phone"
          className="relative mx-auto max-w-[900px] pb-16 sm:pb-24"
        >
          <div aria-hidden className="mk-glow">
            <BrowserWindow url="mail.acme.example/w/acme/inbox">
              <DesktopInbox />
            </BrowserWindow>
          </div>
          <div aria-hidden className="absolute right-2 bottom-4 origin-bottom-right scale-[0.62] sm:right-6 sm:bottom-8 sm:scale-90 lg:-right-10 lg:scale-100">
            <PhoneFrame>
              <PhoneInbox />
            </PhoneFrame>
          </div>
        </div>
      </PageHero>

      <Section padding="none" aria-label="Platforms">
        <ul className="-mx-5 grid grid-cols-2 sm:-mx-8 lg:-mx-12 lg:grid-cols-4">
          {platforms.map((p, i) => (
            <li
              key={p.id}
              className={cn(
                "border-border",
                i % 2 === 0 && "border-r",
                i < 2 && "border-b lg:border-b-0",
                i < 3 && "lg:border-r"
              )}
            >
              <a
                href={p.id === "browser" ? "#screens" : `#${p.id}`}
                className="group flex h-full flex-col gap-3 p-5 transition-colors hover:bg-surface/60 sm:p-6"
              >
                <p.icon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
                <span>
                  <span className="block text-[15px] font-semibold tracking-tight">{p.name}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{p.how}</span>
                </span>
                <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-(--brand-ink)">
                  <Check className="size-3" aria-hidden /> {p.status}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <div id="install" className="scroll-mt-16" />
      {guides.map((g, i) => (
        <Section key={g.id} id={g.id} padding="md" className="scroll-mt-16" aria-labelledby={`${g.id}-title`}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={cn(i % 2 === 1 && "lg:order-last")}>
              <StepLabel label={g.label} />
              <h2 id={`${g.id}-title`} className="mt-5 text-[28px] leading-[1.08] font-semibold tracking-display text-balance sm:text-[36px]">
                {g.title} <span className="text-quiet">{g.quiet}</span>
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{g.intro}</p>
              <ol className="mt-6 space-y-2">
                {g.steps.map((s, n) => (
                  <li key={n} className="flex items-start gap-3 rounded-[6px] border border-border bg-card px-4 py-3.5 text-[14.5px] leading-relaxed">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-[10.5px] text-(--brand-ink)">
                      {n + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {g.note && <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">{g.note}</p>}
            </div>
            <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface p-6 sm:min-h-[440px] sm:p-10">
              <div aria-hidden className="mk-dots absolute inset-0 opacity-60 mk-fade-bottom" />
              <div role="img" aria-label={g.alt} className="relative flex w-full justify-center">
                <div aria-hidden className="contents">
                  {g.visual}
                </div>
              </div>
            </div>
          </div>
        </Section>
      ))}

      <Section id="screens" padding="lg" tone="surface" className="scroll-mt-16" aria-labelledby="screens-title">
        <SectionHeading
          id="screens-title"
          eyebrow={<StepLabel label="Every screen" />}
          title="One app, tuned for"
          quiet="the device in front of you."
          description="The same Dispatch in every browser: keyboard-first on a laptop, thumb-friendly on a phone, light or dark wherever you are."
          align="center"
        />
        <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <BentoCard
            className="bg-background md:col-span-2 lg:col-span-4"
            layout="row"
            title="Keyboard-first on desktop."
            quiet="J and K to move, E to close, R to reply, ⌘K for everything else. Prefer Gmail's keys? Switch the scheme."
            visual="shortcuts"
          />
          <BentoCard
            className="bg-background lg:col-span-2"
            title="Desktop notifications."
            quiet="Mentions and assignments pop up while Dispatch is open."
          >
            <div aria-hidden className="flex justify-center">
              <NotificationToast />
            </div>
          </BentoCard>
          <BentoCard
            className="bg-background lg:col-span-2"
            title="Made for thumbs."
            quiet="Every screen works at phone width, from the inbox to the composer."
          >
            <div className="flex justify-center">
              <FeatureVisual kind="mobile" />
            </div>
          </BentoCard>
          <BentoCard
            className="bg-background lg:col-span-4"
            layout="row"
            title="Dark mode."
            quiet="Light, dark or follow your system, switched from the account menu."
          >
            <div aria-hidden className="mk-dark flex justify-center rounded-[8px] bg-background p-3 sm:p-5">
              <InboxVisual />
            </div>
          </BentoCard>
        </div>
      </Section>

      <Section tone="dark" padding="lg" className="relative overflow-hidden" aria-labelledby="native-title">
        <div aria-hidden className="mk-dots pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <StepLabel label="Roadmap" />
            <h2 id="native-title" className="mt-5 text-[34px] leading-[1.04] font-semibold tracking-display text-balance sm:text-[46px]">
              Native apps are on the roadmap. <span className="text-quiet">The web app is here today.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              We&apos;re planning native iOS and Android apps. Until they ship, the installable web app gives you the full
              product on every device, updated as soon as the server is. We&apos;ll announce the native apps in the
              changelog.
            </p>
            <ul className="mt-6 grid gap-2 text-[14px] sm:grid-cols-2">
              {["Same features as desktop", "Realtime updates", "Stays signed in for up to a year", "Works with self-hosted instances"].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
              <ButtonLink href="/changelog" size="lg" arrow>
                Read the changelog
              </ButtonLink>
              <ButtonLink href={GITHUB_DISCUSSIONS_URL} external size="lg" variant="secondary">
                <GitHubMark /> Discuss on GitHub
              </ButtonLink>
            </div>
          </div>
          <div role="img" aria-label="An Android home screen with the Dispatch app icon" className="flex justify-center">
            <div aria-hidden className="contents">
              <PhoneFrame className="border-[#2a2a2a]">
                <HomeScreen />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </Section>

      <Section padding="lg">
        <FaqSection items={faq} />
      </Section>

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
