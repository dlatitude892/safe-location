---
name: Safe Location
description: A consent-based personal safety tracker, map first, with its status read like an instrument and SOS always one tap away.
colors:
  bg: "#0b0a14"
  bg-header: "#0e0c19"
  surface: "#15131f"
  panel: "rgb(21 19 31 / 0.86)"
  sheet: "#17141f"
  surface-raised: "#1d1a2b"
  map-bg: "#120f1d"
  border: "#2a2640"
  border-strong: "#3b3557"
  control-border: "#7a7299"
  text: "#eeeaf7"
  text-muted: "#b0a9c6"
  text-faint: "#8d86a6"
  accent: "#8b5cf6"
  accent-strong: "#7c3aed"
  accent-hover: "#6d28d9"
  accent-text: "#c4b5fd"
  accent-soft: "rgb(139 92 246 / 0.14)"
  accent-glow: "#e879f9"
  success: "#34d399"
  success-text: "#8ef0c9"
  warning: "#f5b544"
  warning-soft: "rgb(245 181 68 / 0.12)"
  danger: "#f87171"
  danger-text: "#ffb4b4"
  danger-soft: "rgb(248 113 113 / 0.12)"
  danger-strong: "#dc2626"
  danger-strong-hover: "#b91c1c"
  gap: "#a8a2bd"
  old-route: "#8a7fb8"
typography:
  hero:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2.6rem, 1.4rem + 4.4vw, 5.1rem)"
    fontWeight: 650
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  section:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.9rem, 1.2rem + 2.4vw, 3.1rem)"
    fontWeight: 650
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  lead:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.05rem, 1rem + 0.3vw, 1.2rem)"
    fontWeight: 400
    lineHeight: 1.6
  countdown:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 750
    lineHeight: 1
    fontFeature: "tnum"
  display:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.5rem, 1.2rem + 1vw, 1.9rem)"
    fontWeight: 700
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
    letterSpacing: "-0.01em"
  condition:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  reading:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.35
    fontFeature: "tnum"
  reading-lg:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  body:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 650
  label:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.76rem"
    fontWeight: 600
  sos:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 800
    letterSpacing: "0.06em"
rounded:
  xs: "6px"
  sm: "9px"
  float: "12px"
  md: "14px"
  lg: "18px"
  sheet: "22px"
  xl: "28px"
  device: "34px"
  pill: "999px"
spacing:
  hairline: "1px"
  float-gap: "8px"
  control-gap: "10px"
  map-inset: "12px"
  row: "0.75rem"
  layout-gap: "1rem"
  panel: "1.1rem"
  sheet-pad: "18px"
  landing-band: "clamp(4rem, 9vw, 7.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1rem"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1rem"
    height: "44px"
  button-sheet-action:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: "50px"
  button-ghost:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.35rem 0.7rem"
    height: "36px"
  button-map-tool:
    backgroundColor: "rgb(21 19 31 / 0.92)"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    size: "44px"
  button-danger-ghost:
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.8rem"
    height: "38px"
  button-stop:
    backgroundColor: "{colors.danger-strong}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1rem"
    height: "44px"
  button-sos:
    backgroundColor: "{colors.danger-strong}"
    textColor: "#ffffff"
    typography: "{typography.sos}"
    rounded: "{rounded.pill}"
    size: "72px"
  button-sos-sheet:
    backgroundColor: "{colors.danger-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  button-sos-confirm:
    backgroundColor: "{colors.danger-strong}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: "52px"
    width: "300px"
  button-sos-confirm-hover:
    backgroundColor: "{colors.danger-strong-hover}"
  call-112-pill:
    backgroundColor: "rgb(21 19 31 / 0.92)"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  button-hero:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "12px"
    padding: "0.55rem 1.4rem"
    height: "52px"
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
    height: "44px"
  status-pill:
    backgroundColor: "rgb(21 19 31 / 0.9)"
    textColor: "{colors.text-muted}"
    typography: "{typography.condition}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  status-pill-calm:
    textColor: "{colors.accent-text}"
  status-pill-attention:
    textColor: "{colors.warning}"
  status-pill-alert:
    backgroundColor: "rgb(48 14 22 / 0.92)"
  pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "0.3rem 0.7rem"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.pill}"
    padding: "0.12rem 0.5rem"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "0.12rem 0.5rem"
  readout:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.reading}"
    padding: "0.6rem 0.75rem 0.65rem"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.sheet-pad}"
  overlay-card:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "22px"
    width: "440px"
  panel-preview:
    backgroundColor: "rgb(21 19 31 / 0.92)"
    rounded: "{rounded.lg}"
    padding: "1.3rem"
---

# Design System: Safe Location

<!-- Recorded after the build from the shipped code. Phase 8 (map-first tracker, approved prototype
prototypes/tracker-a.html, Layout A v1): index.html, style.css sections "Map-first tracker (Phase 8)" and "Phase 8
refinements", app.js "11b. The sheet", renderSos, renderCondition, renderTrip and the map drawing. Earlier surfaces:
landing.css, landing.js, welcome.html, account.html, emergency.html, trips.html, signin.html, tests/landing.spec.js.
Palette "Violet night". Rendered evidence: .impeccable/review/phase8-mobile-*.png (390x844) and
phase8-desktop-*.png (1440x900), Playwright captures of the real app against a throwaway local server with simulated
GPS (the 11-checkin capture had its check-in request injected client-side); landing-desktop-hero.png and
landing-mobile-full.png for /welcome. Older desktop-*.png, mobile*.png and tracker-desktop.png captures show the
pre-Phase 8 tracker layout and are superseded. -->

## Overview

**Creative North Star: "The Status Instrument"**

Safe Location is a map at night with an instrument laid over it. The map fills the screen and shows where you have
been; the instrument answers "am I being recorded, and is it reaching anyone?" in two places that never scroll away: a
floating status pill that carries the overall tone in one short line, and the top of the sheet, where a large state
line, the next-reading countdown, an event message and the main actions sit. Readings, trip, history and settings live
further down the same sheet at lower weight. SOS floats on the map in thumb reach, red and round, with Call 112 above it.

Density is moderate and calm. The sheet is one charcoal-violet surface divided by hairline rules rather than a stack of
floating cards; colour is almost entirely neutral until something needs a person's attention, and then it appears in
exactly one place, with one meaning. The face is Geist, self-hosted and small (29 KB for Latin), so the product reads
like a modern SaaS tool without a font service; text shows at once in the system font and swaps when Geist arrives.
The tracker's ground is now the dark map itself, tinted violet-black; the signal field (violet light from above, pink
corner glow, point grid, grain) remains the ground of the account, sign-in and landing pages.

Motion follows a budget. The tracker stays open for hours on a phone battery, so it moves only to say something: the
sheet slides, the pill changes tone, the status dot breathes while recording is healthy, the latest-position marker
pings, and a hidden active SOS pulses so it is never forgotten. Nothing drifts in the background. Ambient motion lives
on the short-visit pages: the sign-in veil breathes, and the public landing page at /welcome (a Persuade-mode page in
the same world) drifts an aurora and animates a preview of the real tracker.

The world is honest about uncertainty. Readings show their age and accuracy in tabular numerals, gaps are drawn as
dashed lines, doubtful points are amber and left off the route, and nothing in the copy claims a message was
delivered unless the provider confirmed it. The landing page's previews only show states the product really shows.

**Key Characteristics:**
- Map first: a full-screen dark map on phones, a 400px panel beside the map on computers.
- One tone-carrying status pill per screen, driven by state (idle grey, calm violet, attention amber, alert red).
- One sheet of hairline-ruled sections instead of card stacks; peek, half and full heights on phones.
- Violet means working, amber means attention, red means emergency, failure or irreversible removal.
- Geist (self-hosted, system fallback), weights 600 to 800, tabular numerals for every reading.
- Flat, bordered surfaces inside the sheet; soft shadow only on things that float over the map.
- A round red SOS always one tap away, with Call 112 beside it.
- Motion budget: tracker motion only to carry state, ambient motion on the landing and sign-in pages, all of it off under reduced motion.

## Colors

A near-monochrome violet-black and charcoal field where three signal hues each own one meaning, plus one pink that
only ever glows.

### Primary
- **Working Violet** (accent): the healthy, working state. Calm-tone pill dot and edge, the latest-position marker
  and its ping, the current route line, active pills, checked switches and the accent colour of native controls.
- **Deep Working Violet** (accent-strong): solid fill for the one primary action in a region (Start Tracking, End
  trip, I'm OK, "I'm safe: cancel SOS", Sign in, submit, the landing's "Open the tracker") and the brand mark; darkens
  to **Pressed Violet** (accent-hover) on hover. White text on it is 5.7:1.
- **Lavender Text** (accent-text): violet text on dark ground: links, the calm-tone pill line, the "Check-in options"
  disclosure, success messages about local work, the emphasised word in the landing headline, step numbers.
- **Violet Wash** (accent-soft): tinted background behind active pills.
- **Aurora Pink** (accent-glow): light only. It appears inside the signal field's corner glow, the landing aurora and
  closing panel, and the end of the landing's step rail. It never fills a control, never carries text and never marks
  a state.

### Secondary
- **Attention Amber** (warning): anything that needs attention but is not an emergency: offline, weak or stale GPS,
  points waiting to upload, flagged positions ("GPS jump", "Low accuracy" badges, flagged marker and its amber ping),
  paused or delayed trips, the storage notice and SOS unavailable messages floating over the map, simulated-mode
  banners. Always paired with **Amber Wash** (warning-soft) or a dark amber ground (rgb(26 22 12 / 0.95)) and a 0.35
  to 0.6 alpha amber edge.

### Tertiary
- **Emergency Red** (danger-strong): the fill of every SOS control (the round SOS dock, the sheet's SOS pill, Send
  now) and of confirmed destructive submits (Delete my account, Remove device),
  darkening to **Arterial Red** (danger-strong-hover) on hover. White text on it is 4.83:1. The SOS countdown screen
  washes the whole view in it (rgb(220 38 38 / 0.5) falling to near-black).
- **Alarm Red** (danger) with **Alarm Wash** (danger-soft) and **Alarm Text** (danger-text): alert-tone pill edge and
  the alert pill's dark red ground (rgb(48 14 22 / 0.92)), the live-SOS banner in the sheet, the check-in card's edge,
  the SOS panel's edge, the hidden-SOS pulse ring, denied permission and error readouts, "Rejected by server" badge, the
  Call 112 pills and the outline-only removal buttons.
- **Confirmed Green** (success) and **Confirmed Green Text** (success-text): only for facts that are confirmed: GPS
  live, online, all uploaded, trip start marker, provider-confirmed delivery status, live-provider mode banner.

### Neutral
- **Night Violet** (bg): page ground under the signal field, the top bar's fade (0.75 alpha to clear), the theme
  colour, segmented-control well, message preview.
- **Header Violet** (bg-header): reference value for the sticky header on account, emergency, trips and sign-in pages,
  drawn as Night Violet at 0.72 alpha with a 14px backdrop blur.
- **Sheet Violet** (sheet): the tracker's sheet and computer panel, the brand header above the panel, the SOS and
  check-in overlay cards. Opaque, with a faint lavender sheen in the sheet's first 140px.
- **Charcoal Violet** (surface): readout cells and dialogs; at 0.9 to 0.92 alpha with a 10 to 12px blur it is the
  ground of everything that floats over the map (status pill, Recenter, account initials, Call 112 pill).
- **Veiled Charcoal** (panel, Charcoal Violet at 0.86 alpha): sheets and cards on the account, emergency and trips
  pages, so the field's light tints them.
- **Raised Charcoal** (surface-raised): inputs, selects, secondary and ghost buttons, hover rows, popups.
- **Map Ground** (map-bg): map container before tiles load.
- **Hairline** (border) and **Strong Hairline** (border-strong): section rules, readout grid lines, the panel's right
  edge, the sheet's top edge, the grab handle and floating-control edges.
- **Control Outline** (control-border): input, select and switch outlines (3.8:1 against Raised Charcoal, WCAG
  1.4.11); the grab handle on hover.
- **Ink** (text), **Muted Ink** (text-muted), **Faint Ink** (text-faint): primary text, labels and secondary copy,
  notes, the footer and the idle-tone dot. Faint Ink on Charcoal Violet is 5.32:1; every text pair passes WCAG AA.
- **Gap Haze** (gap) and **Earlier Route** (old-route): dashed gap lines and previous trips on the map.

### Named Rules
**The Red Means Danger Rule.** Red appears only for an emergency (SOS, Call 112, alert tone, check-in requested), a
failure (denied permission, rejected upload, error) or an irreversible removal (delete, remove, clear, cancel trip).
Removal is outline-only red unless it is the confirmed final submit. A merely doubtful reading is amber, never red.

**The One Meaning Per Hue Rule.** Violet is working state, amber is attention, green is confirmed fact. A hue never
borrows another's meaning, and state is never carried by colour alone: every tone has a sentence or a label. Aurora
Pink is light, not a state, so it carries no meaning at all.

## Typography

**Display Font:** Geist (variable, weights 100 to 900), falling back to system-ui, -apple-system,
BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif
**Body Font:** the same stack
**Label/Mono Font:** none; numbers use Geist with tabular numerals

**Character:** A clean, geometric-leaning grotesk with a contemporary SaaS feel, set heavy (600 to 800) and slightly
tight in large sizes so it reads in sun and at night. Self-hosted from `/fonts/` under the SIL Open Font License
(`fonts/LICENSE-Geist.txt`): Latin (29 KB) always, Latin Extended (16 KB, includes ₦) and the dot-below set
(8 KB: ẹ, ọ, ṣ, ị, ụ for Yoruba and Igbo names) only when a page uses those letters. `font-display: swap`, a preload
on every page, 30-day caching and a service-worker copy keep it cheap on mobile data and available offline.

### Hierarchy
- **Hero** (650, clamp(2.6rem, 1.4rem + 4.4vw, 5.1rem), 1.02, -0.04em, balanced): the landing page's one headline.
- **Section** (650, clamp(1.9rem, 1.2rem + 2.4vw, 3.1rem), 1.06, -0.035em, balanced): landing band headings.
- **Lead** (400, clamp(1.05rem, 1rem + 0.3vw, 1.2rem), 1.6, Muted Ink): the landing intro; band copy is 1.06rem.
- **Countdown** (750, 4.5rem, 1, tabular numerals): the seconds inside the SOS countdown ring, nothing else.
- **Display** (700, 1.6rem, 1.15, -0.025em): the sheet's state line ("Tracking active", "Not tracking"). The check-in
  card's "Are you OK?" uses 1.5rem, -0.02em; the active SOS heading ("SOS active since…") 1.35rem, 700, -0.015em.
- **Headline** (700, clamp(1.5rem, 1.2rem + 1vw, 1.9rem), -0.025em): page titles on account, emergency and trips
  pages; sign-in cards use 1.5rem.
- **Title** (650, 1.0625rem, -0.01em): sheet section headings (Trip Mode, Location history, Recording...); the SOS
  panel heading uses 1.15rem; landing step and feature titles use 1.2rem, -0.02em.
- **Condition** (600, 0.875rem): the status pill line; one line, truncated with an ellipsis, the full sentence kept
  for screen readers.
- **Reading** (650, 1rem, 1.35, tabular numerals): readout values; the next-reading countdown is 0.9rem tabular
  Muted Ink. The large reading (650, 1.375rem, 1.25) is for headline statistics.
- **Body** (400, 15px, 1.5): running text, messages (0.88rem), help text (0.78rem), the footer (0.78rem Faint Ink).
- **Label** (600, 0.76rem): definition-term labels over values; readout labels are 0.72rem. Sentence case, no
  tracking, no uppercase.
- **Button** (650, 0.92rem): all buttons; the sheet's 50px actions step up to 1rem, I'm OK to 1.05rem; landing hero
  buttons are 1rem at 52px.
- **SOS** (800, 1.1rem, 0.06em): the word "SOS" on the round dock; the sheet's SOS pill is 700, 0.9rem, 0.05em.

### Named Rules
**The Tabular Reading Rule.** Every number that updates (times, countdowns, accuracy, coordinates, counts) is set with
tabular numerals so live readings tick without layout shift. This holds inside the landing previews too.

**The Light Font Rule.** One self-hosted family only (Geist), subset by script and loaded with `swap`, so text never
waits for a download. No font services, no icon fonts, no second display family.

## Layout

The tracker is a map-first shell that never scrolls: the shell is exactly the viewport (100dvh, overflow clipped) and
only the sheet's content scrolls. One breakpoint at 960px splits phones from computers.

**Phones (below 960px).** The Leaflet map fills the screen. Over it, from the top:
- **Top bar:** a 44px logo button (name visually hidden), the status pill stretching between, and the account as a
  round 44px button with the person's initials (the full name is its accessible name; "Sign in" when signed out). The
  bar sits on a Night Violet fade from 0.75 alpha to clear, 12px side insets, 8px gaps, below the safe-area inset.
  "How it works" is hidden here and lives in the sheet footer.
- **Map tools:** only Recenter floats, a 44px round icon button 12px from the right, just under the top bar. Leaflet's
  zoom buttons are hidden; people pinch. Recenter turns Follow my position on. The map tools fade out whenever the
  sheet is raised past peek, because the map is then a strip and SOS needs the room.
- **SOS dock:** bottom-right, 12px in, riding 14px above the sheet's visible top, but never higher than the sheet's
  half height. The Call 112 pill sits above the 72px SOS button.
- **The sheet:** a bottom sheet with 22px top corners whose height stops at three points: **peek** (state line, next
  reading, message, and the actions row of two 50px buttons, measured to the end of that block), **half** (peek plus
  the readouts; 56% of the screen, at least 120px more than peek) and **full** (everything, up to just under the top
  bar). A 30px grab handle (40 x 5px bar) moves it: drag to any height and it settles on the nearest stop; tap or
  press Enter to step peek, half, full, peek; tabbing past the visible part opens it fully. Tapping the status pill
  toggles peek and half. At full height the floating SOS dock hides and a sticky "SOS · Call 112" row (two 44px
  pills, right-aligned) holds the top of the sheet.

**Computers (960px and wider).** A 400px panel on the left holds the sheet with no handle, a 1px Hairline right edge
and no shadow; above it a 72px brand header (36px mark, name, "How it works", the account pill) in Sheet Violet. The
map fills the rest. The status pill floats over the map's top-left, 16px in; Recenter is a labelled pill at the
top-right, 16px in; Leaflet zoom stays, below the pill; the SOS dock sits bottom-right, 20px in and 36px up. Tapping
the pill scrolls the panel back to the top.

**Sheet order** (both layouts): the status block (the live-SOS banner while an SOS is in progress, then the state line
and next reading, the message, the actions: Start Tracking, Stop tracking and Start a trip, or a trip's Pause and End
trip; then the four readouts GPS, Connection, Backup, and Trip or Saved here on a 2x2 ruled grid), Trip Mode (with its
form and the "Check-in options" disclosure), Location history (Fit route icon and Clear history), Recording, Backup
and sync, Latest saved location, Statistics, Map (Dark or Street, Follow my position, the key), then the footer.
Sections are 18px padded and divided by Hairline rules.

Account, emergency and trips pages are a single column at min(100% - 2rem, 880px); sign-in is one centred card up to
27rem wide; below 720px those pages tighten gaps and grow controls to 44px. The landing page is
min(100% - 2.5rem, 1200px) wide (2rem margin below 720px) with bands of clamp(4rem, 9vw, 7.5rem) vertical padding; see
Landing Page below.

### Named Rules
**The Status First Rule.** On every viewport the status pill and the peek sheet's state line and actions are visible
without scrolling, and SOS and Call 112 are always one tap away: floating on the map, or pinned at the top of the
sheet when it is full.

**The Map Stays Clear Rule.** Only the status pill, Recenter, the SOS dock and transient notices float over the map.
Everything else lives in the sheet; floating controls step aside when the sheet rises.

## Elevation & Depth

Two layers. Inside the sheet the system is flat: sections are separated by tone and 1px hairlines, never by shadow.
Everything that floats over the map gets a soft dark drop shadow and, where it is translucent, a backdrop blur, so it
reads against any tile. Full-screen overlays (SOS, check-in) dim and blur the whole app behind a card. The landing
page's illustrative previews remain the only place soft decorative depth is allowed (see Landing Page).

### Shadow Vocabulary
- **Focus ring** (`box-shadow: 0 0 0 3px rgb(167 139 250 / 0.55)`): every focusable element, replacing the outline.
- **Float** (`box-shadow: 0 10px 26px -14px rgb(0 0 0 / 0.85)`): the status pill; Recenter uses
  `0 8px 20px -10px rgb(0 0 0 / 0.8)` and the Call 112 pill and floating messages `0 10px 24px -12px rgb(0 0 0 / 0.8)`.
- **Sheet lift** (`box-shadow: 0 -18px 40px -18px rgb(0 0 0 / 0.75)`): the phone sheet's upward shadow; none on the
  computer panel.
- **Overlay card** (`box-shadow: 0 30px 60px -24px rgb(0 0 0 / 0.85)`): SOS panel and check-in card, over a
  rgb(8 6 16 / 0.72 to 0.75) scrim with a 6px blur.
- **SOS glow** (`box-shadow: 0 14px 30px -10px rgb(220 38 38 / 0.9), inset 0 2px 0 rgb(255 255 255 / 0.22), 0 0 0 5px rgb(220 38 38 / 0.18)`):
  the round SOS dock only, over a radial fill from #ef4444 at the upper left to Emergency Red.
- **Route glow** (`filter: drop-shadow(0 0 6px rgb(139 92 246 / 0.65))`): the current route line only.
- **Map control lift** (`box-shadow: 0 4px 14px rgb(0 0 0 / 0.35)`): Leaflet zoom bars (computers only).
- **Marker halo** (`box-shadow: 0 0 0 6px rgb(139 92 246 / 0.25), 0 2px 6px rgb(0 0 0 / 0.5)`): latest-position
  marker; amber halo when the point is flagged.

### The map ground
Dark is the default map style. Without a CARTO key the OpenStreetMap tiles are filtered violet-black
(`invert(1) grayscale(1) sepia(0.5) hue-rotate(210deg) saturate(1.7) brightness(0.68) contrast(1.08)`); with a key
the tiles are CARTO dark_all. Street is the light alternative. The current trip is a 6px Working Violet line at 0.95
opacity with the route glow; earlier trips are 3px Earlier Route at 0.6; gaps are 3px round dashes (2 9), light on
the dark map and slate on the street map. The latest-position marker pings: a 2px violet ring (amber when flagged)
grows to 3x and fades over 2.4s.

### The Signal Field (page background, other pages)
Drawn by `body::before` and `body::after`, fixed behind everything, in pure CSS (no image downloads, no script). The
tracker hides it, because the map is its ground.
- **Veil:** an elliptical radial gradient of Working Violet at 0.24 alpha falling from just above the top centre, with
  two fainter glows near the top corners: Aurora Pink at 0.10 alpha on the left, light violet (rgb(167 139 250)) at
  0.09 on the right.
- **Point grid:** 1px points of Muted Ink at 0.16 alpha every 24px, like a map graticule, fading towards the bottom of
  the screen through a vertical mask.
- **Grain:** an inline SVG noise tile at 0.06 opacity in overlay blend, so the dark ground never bands.
- Sheets and cards on these pages are Veiled Charcoal with a faint lavender top sheen (0.045 alpha) and a 1px inner
  top highlight, so the field tints them slightly.
- **Motion:** on the sign-in pages the veil breathes between 0.8 and 1 opacity over 14s; on the landing page the
  aurora replaces it. Off under reduced motion.

### Named Rules
**The Ruled Not Stacked Rule.** Group related panels as one sheet whose sections are divided by hairlines, and lay
readings on a grid whose 1px gaps show the border colour. Do not stack floating, shadowed cards.

**The Float Only Over The Map Rule.** Shadow and blur belong to things that float over the map and to overlay cards.
Nothing inside the sheet casts a shadow.

**The Motion Budget Rule.** The tracker runs for hours on a phone battery, so it moves only to carry state: the sheet
sliding (420ms, cubic-bezier(0.16, 1, 0.3, 1)), the pill's tone easing over 400ms, the breathing dot while recording
is healthy (2.4s), the latest-marker ping (2.4s), the pulse on a hidden active SOS and the live-SOS dot (1.6s), the
countdown ring emptying, overlays fading in (200ms) and rising (320ms). No ambient background motion. Everywhere,
`prefers-reduced-motion: reduce` stops every animation and transition, and content never depends on motion to be
visible.

## Shapes

The tracker is round where it floats and gently rounded where it sits. Floating controls are full pills or circles:
the status pill, Recenter, the account initials, Call 112, the 72px SOS dock and the sheet's SOS pill. The sheet and
the overlay cards share 22px corners (the phone sheet only at the top; the computer panel is square). Sheet actions
and the live-SOS banner use 14px; ordinary buttons, inputs and readout grids 9px; the logo tile and floating notices
12px; segmented options 6px. The SOS countdown is a 190px ring, 8 to 9px thick. Status dots, badges and switch tracks
are fully round. The landing scales up: hero buttons 12px, preview panels 18px, the closing panel 28px, the device
frame 34px (screen 25px). Hairlines are always 1px; dashed lines are reserved for data gaps, simulated-mode banners
and development hints (and the untravelled route in the landing preview).

## Logo

**The Circle of trust.** A white mark on a Deep Working Violet (`#7c3aed`) tile: a solid dot in the centre (you) and
three smaller dots on a ring around it (the people you trust). The ring breaks where each person sits. It is drawn on a
64 x 64 grid: ring radius 19 with 4-unit round-capped strokes, people dots radius 4.2 at 12, 4 and 8 o'clock, centre
dot radius 7.5. Web tiles round at radius 15 of 64; the app-store icon is square and full-bleed with the mark at 70%.
All files and their uses are in `brand/README.md`. Never stretch it, recolour the mark, add effects, or put the white
mark on a light background (use `brand/logo-mark-violet.svg` there).

## Components

### Buttons
Solid and quiet: no gradients, no transforms, except the SOS dock.
- **Shape:** gently rounded (9px), minimum 44px tall; the sheet's actions are 50px with 14px corners and 1rem text.
- **Primary:** Deep Working Violet fill, white 650 text, 0.55rem 1rem padding; one per region.
- **Secondary:** Raised Charcoal with a Strong Hairline edge; edge turns Working Violet on hover. Stop tracking and
  Pause are secondary in the sheet.
- **Ghost:** 36px Raised Charcoal with a Hairline edge, for tools; text turns Lavender on hover. Icon-only ghosts
  (Fit route, 40 x 38px) keep their label as the accessible name.
- **Map tool:** Recenter. A 44px circle of Charcoal Violet at 0.92 alpha, 10px blur, Strong Hairline edge and the
  float shadow; icon only on phones, a labelled pill on computers. Disabled (no location yet) it stays solid with
  Faint Ink, not faded.
- **Danger ghost:** transparent with Alarm Red text; Alarm Wash and red edge on hover. For removal only.
- **Hover / Focus:** 150ms colour transitions; focus is the 3px violet ring. Disabled is 0.45 opacity.
- **Landing hero:** the same primary and secondary buttons at 52px, 12px corners, 1.4rem side padding, full width
  below 720px. Only the landing's primary carries a soft violet glow
  (`0 10px 30px -10px rgb(124 58 237 / 0.8)` plus a 1px inner highlight).

### Chips (pills and badges)
- **Pills:** fully round, Charcoal Violet with a hairline, a 7px dot in the state colour and 600 0.8rem text (account
  and other pages); in the tracker top bar the account pill is 44px tall, 0.85rem, and on phones shows initials (700).
- **Badges:** fully round, 650 0.72rem; amber variant for doubtful data, red variant only for failures and active SOS.
- **Trip badges:** green when active, amber when paused, delayed or offline, red only for check-in requested.

### Cards / Containers
- **The sheet:** Sheet Violet, 22px top corners on phones, a Strong Hairline top edge and the sheet lift; square with
  a Hairline right edge on computers. Sections are 18px padded and ruled by Hairlines.
- **Readouts:** a 2x2 grid of Charcoal Violet cells with 1px Hairline gaps and 9px outer corners, label over value.
- **Overlay cards:** Sheet Violet, 22px corners, up to 440px wide, 20 to 22px padding, the overlay-card shadow,
  rising 24px into place; anchored to the bottom on phones and centred on computers.
- **Other pages:** 14px corners, Veiled Charcoal, 1px Hairline, 1.1rem padding, no shadow; red-tinted edge (0.35 alpha)
  for danger-zone containers.

### Inputs / Fields
- **Style:** Raised Charcoal, 1px Control Outline, 9px corners, 44px tall (selects 42px); label above in 600 0.82rem
  Muted Ink, help below in 0.78rem Faint Ink.
- **Focus:** border turns Working Violet plus the focus ring.
- **Error / Disabled:** errors are stated in a message or notice in Alarm Text; disabled fields drop to 0.6 opacity.
- **Disclosure:** "Check-in options" in Trip Mode is a native disclosure under a Hairline: a 44px Lavender summary
  with a 2px chevron that turns over 200ms, and below the title a one-line Muted Ink summary of the current defaults
  ("Ask after 15 min · tell contacts if no answer in 10 min").

### Navigation
On the tracker there is no page header: the floating top bar (phones) or the 72px brand header over the left panel
(computers) carries the Circle of trust mark, the status pill and the account; "How it works" links to /welcome from
the computer header and from the sheet footer. Account, emergency, trips and sign-in pages keep a sticky Header Violet
bar (64px, 56px on phones) with the mark and name at left and the account pill at right. No tab bars; secondary pages
are reached from links in section headings. The landing header adds in-page links (How it works, Trip Mode, SOS,
Privacy; hidden below 980px), "Sign in" (hidden below 720px) and a compact 40px "Open the tracker" primary.

### Status Pill (signature)
The instrument's face. A 44px full pill of Charcoal Violet at 0.9 alpha with a 12px blur and the float shadow, holding
a 10px tone dot and one line in 600 0.875rem. Its edge, dot and text take one tone from the state: idle (Faint Ink dot,
Muted Ink text, Strong Hairline edge), calm (Working Violet dot, Lavender text, violet edge at 0.6), attention (amber
dot, text and edge at 0.6), alert (Alarm Red dot and edge on a dark red ground). The alert tone wins over attention,
attention over calm. The visible line is short ("Recording · every 1 minute", "Not recording"); the full sentence is
kept for screen readers in the same live status. Tone changes ease over 400ms; in the calm tone the dot breathes (a
2px ring growing from 0.6x to 1.6x over 2.4s). The whole pill is a button that toggles the sheet between peek and half
on phones and scrolls the panel to the top on computers.

### Sheet Status Block (signature)
The top of the sheet, always inside the peek height. The state line (Display) with the next-reading countdown at its
baseline on the right, the event message (0.88rem, its tone's colour, hidden when empty), and the actions row: two
equal 50px buttons with 14px corners and 10px gaps. Start Tracking is the primary; while tracking, Stop tracking and
Start a trip; while a trip is open, the trip's Pause (secondary) and End trip (primary). The 2x2 readouts sit below
the peek line. While an SOS is in progress, a red banner opens the block: a 1px Alarm Red edge on Emergency Red at
0.14, 14px corners, a pulsing red dot, "SOS active since 14:02 · Mum: delivered" in 650 0.9rem, and a 40px Show button
when the SOS panel is hidden.

### SOS Dock (signature)
Bottom-right over the map. A 72px Emergency Red circle with a radial highlight, the SOS glow and a 5px faint red ring,
the word "SOS" in 800 1.1rem 0.06em (its accessible name is "Send SOS"); it presses to 0.94 scale. Above it, the Call
112 pill (40px, Charcoal Violet at 0.92 with blur, Alarm Text, 0.875rem) and any short SOS note in an amber-edged
floating message. Before SOS is ready, and while an active SOS is hidden, the circle opens the SOS panel instead; a
hidden active SOS wears a 3px Alarm Red ring pulsing outwards every 1.6s. The dock rides the sheet's top edge on
phones, never above half height, and hides when the sheet is full, where the sheet's own sticky SOS and Call 112 pills
take over.

### SOS Overlays (signature)
- **Countdown:** the whole screen goes red: a radial wash of Emergency Red at 0.5 falling to rgb(8 6 16 / 0.94), a
  6px blur, no panel chrome and no header. "Sending SOS in" over a 190px white ring that empties clockwise as the
  seconds run out, with the number at 4.5rem 750 tabular in its centre, then the location fix status, then Cancel
  (secondary) above Send now (Emergency Red), both 52px and up to 300px wide, then the Call 112 link and the note that
  Safe Location does not contact emergency services.
- **Active:** an overlay card with a red edge whose heading is the status line itself ("SOS active since…", 1.35rem
  700; the "Emergency" label stays for screen readers), the location, the per-contact delivery list, and a 50px pair:
  Hide (narrow, secondary) and "I'm safe: cancel SOS" (primary), then Full details and Call 112.
- **Unavailable:** opened from the map button, the card states what is missing (sign in, add a contact) with
  "Contacts and settings" and a Close button in its head.

### Trip Check-in (signature)
Asked over everything: a full-screen scrim (rgb(8 6 16 / 0.75), 6px blur) and an overlay card with a 1px Alarm Red
edge. "Are you OK?" (1.5rem), then one Muted Ink sentence with the concrete reason and the consequence ("No location has
reached the server for 15 minutes. If you don't answer soon, Mum will be told."), then a full-width 52px I'm OK primary
at 1.05rem. I'm OK takes focus when the card appears.

## Landing Page (/welcome)

`welcome.html` with `landing.css` (loaded after `style.css`, so it inherits every token, button and the header) and
`landing.js`. A Persuade-mode page inside the same world: same palette, face, hairlines and signal hues, with more
scale and more motion than the tracker because it is a short visit. It is complete without JavaScript; the script
only adds motion and never talks to the server.

- **Aurora:** three blurred colour fields (Working Violet at 0.75, Aurora Pink at 0.45, indigo rgb(99 102 241) at 0.4,
  each a closest-side radial gradient under an 80px blur, 60px on phones, at 0.55 opacity) drifting on 26s, 32s and
  38s alternate loops. It replaces the veil's breathing; the point grid and grain still show.
- **Hero:** a two-column grid (copy 1.05fr, preview 0.95fr; one column below 980px). The hero headline with one word
  in Lavender, a lead, "Open the tracker" (primary) and "Create an account" (secondary), and three plain facts with
  small violet dots. No label above the headline.
- **Device preview** (decorative, one `role="img"` label): a 34px-radius frame tilted in perspective and floating on
  a 9s loop (flat and still below 980px), holding a miniature of the real tracker. Its condition band cycles every
  4s through states the product really shows: calm "Trip to Lekki: recording every 1 minute", attention "offline,
  points wait on this phone" (Connection Offline, Backup "3 waiting" in amber), calm "Back online: 3 points
  uploaded"; the sentence swaps in with a 500ms rise. The next-reading countdown and reading age tick in tabular
  numerals. The route draws over 9s with an SVG stroke-dashoffset, the pin rides it by SMIL `animateMotion` with two
  pulsing rings, the start marker is Confirmed Green, and the untravelled route is a dotted ghost. SOS and Call 112
  sit at the bottom as in the tracker.
- **How it works:** three numbered steps (46px round numbers in Lavender on a ringed dark disc) joined by a 2px rail
  that fills from Working Violet to Aurora Pink over 1.6s when the list scrolls in; the rail turns vertical below
  720px.
- **Feature bands** (copy beside a living preview, alternating sides, a hairline between bands, tick lists with an
  inline-SVG check):
  - *Trip check-in:* a red-edged check-in-requested card whose answer timer depletes amber to red over 7s, then
    "I'm OK" (Deep Working Violet) is pressed.
  - *SOS:* a red disc with two expanding waves, a 5-second countdown, and a delivery list that keeps submitted and
    confirmed apart; a red-tinted note links Call 112.
  - *Offline queue:* points rise from a phone card ("waiting" count in amber) to the account, one every 0.8s.
- **"What Safe Location will never do":** a ruled two-column list (one column below 720px) of a bold promise plus a
  Muted Ink explanation, a hairline above each item. Not a card grid.
- **Closing:** a 28px panel lit by a violet top glow and a pink corner glow, the two hero buttons, and an outlined
  "In immediate danger? Call 112" link. Then a hairline footer in Faint Ink.
- **Reveals:** `landing.js` adds `.motion` to the root only when motion is allowed; only then do `[data-reveal]`
  blocks start hidden (opacity 0, 28px down, 8px blur) and ease in once over 900ms, staggered 90 to 280ms. Without
  JavaScript, or with reduced motion, everything is visible by default.
- **Reduced motion:** every CSS animation stops, waves and pin rings are hidden, one queue dot rests mid-track, and
  the SVG previews are paused at their finished frame (route drawn, pin at its end). `tests/landing.spec.js` asserts
  zero running animations and that the promises are visible.
- **Depth on the landing:** soft and illustrative only: the device's long drop shadow, the preview panels' soft
  shadow and inner highlight, glows pooled under previews, the hero primary's violet glow and the SOS disc's red glow.
  None of it migrates to tracker components.

## Do's and Don'ts

### Do:
- **Do** let one status pill per screen carry the overall tone, with a short line on screen and the full plain sentence for screen readers.
- **Do** keep the state line and the main actions inside the sheet's peek height, and SOS and Call 112 one tap away at every sheet height.
- **Do** use Working Violet for working state, Attention Amber for attention, and red only for emergency, failure and irreversible removal.
- **Do** keep Aurora Pink as light only: field glows, aurora, rail ends; never a fill, text colour or state.
- **Do** set every live reading in tabular numerals at 650 weight, label over value, on a hairline-ruled grid.
- **Do** group related sections into one sheet divided by 1px hairlines, and keep everything but the status pill, Recenter and SOS off the map.
- **Do** keep primary controls at least 44px tall and keep accessible names when a label is visually hidden.
- **Do** honour reduced motion everywhere: stop the sheet slide, tone transitions, breathing dot, marker ping, SOS pulses, overlay entrances, spinner, veil, aurora and previews, and keep content visible without motion or JavaScript.
- **Do** make landing previews show only states the product really shows, in the same honest delivery language.
- **Do** show age and accuracy with every location and say "simulated" or "submitted" until a provider confirms delivery.

### Don't:
- **Don't** use red for a doubtful reading such as a GPS jump or low accuracy; that is amber.
- **Don't** add ambient background motion to the tracker; motion there only carries state (sheet, tone, recording, latest position, live SOS). Ambient motion belongs to the landing and sign-in pages.
- **Don't** add eyebrows or kickers (small uppercase labels above headings); section titles stand alone in sentence case.
- **Don't** stack shadowed, same-weight cards where a ruled sheet will do; shadows belong only to things floating over the map and to overlay cards, and landing glows stay on the landing.
- **Don't** put more controls on the map (zoom buttons on phones, layer switchers, extra floating buttons); they go in the sheet.
- **Don't** add font services, a second family or icon fonts; use self-hosted Geist and inline SVG icons.
- **Don't** claim a message was delivered, or that someone is safe or in danger, without provider confirmation or the person's own action.
- **Don't** fabricate streets, routes, accuracy or results to fill an empty state; say what is unknown.
