---
workflow: general-video
flow: automation
storyboard: no
message: "Dispatch turns team email chaos into one calm inbox your whole team can work from — open source."
destination: website
aspect: 1920x1080
language: en
audience: "Recruiters, clients and teams viewing a motion-design showreel for the Dispatch product"
length: 15s
angle: showreel
---

## Intent

User's words: "make a dynamic 15-second motion graphics video that shows what an incredible
motion designer you are, like it's your showreel for a résumé. go all out." — for Dispatch, the
open-source collaborative inbox in this repo.

Concept: **One line, one take.** The signal-green line from the Dispatch mark (an open "D" with a
green line entering it — "a message arriving in a shared inbox") is the thread through every shot:
it slices through inbox chaos, sorts it, drives the product, splits the pricing frame, becomes the
terminal cursor, and finally enters the D to lock up the logo. Every scene shows a different
motion-design discipline (3D depth, kinetic type, UI animation, data/ticker, typewriter, logo build).

## Assets

- ../../public/brand/mark.svg, logo.svg — official Dispatch mark (paths reused verbatim, never redrawn)
- ../../docs/screenshots/*.png — reference only for the recreated product UI
- Brand tokens from src/app/globals.css: paper #FAF9F5, ink #141414, signal green #4ADE80 / #16A34A; Geist + Geist Mono

## Customizations

- Music bed authored to the edit (120 BPM, synthesized offline — HeyGen not signed in, MusicGen deps missing)
- Bundled SFX on cuts, UI events, typing and the logo hit
- 60fps for showreel smoothness

## Notes

- Autonomous run ("go all out"): decisions stated, render still gated on user approval.
- Real product facts only: shared Gmail/Outlook/IMAP inboxes, internal comments, @mentions,
  assignments, realtime presence, rules, $50/month flat with unlimited users, free to self-host,
  AGPL-3.0, `docker compose up`.
