---
name: Safe Location
description: A consent-based personal safety tracker read like an instrument, not a dashboard.
colors:
  bg: "#0b0a14"
  bg-header: "#0e0c19"
  surface: "#15131f"
  panel: "rgb(21 19 31 / 0.86)"
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
  display:
    fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.5rem, 1.2rem + 1vw, 2rem)"
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
    fontSize: "0.9rem"
    fontWeight: 650
    lineHeight: 1.35
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
    fontWeight: 750
    letterSpacing: "0.02em"
rounded:
  xs: "6px"
  sm: "9px"
  md: "14px"
  lg: "18px"
  xl: "28px"
  device: "34px"
  pill: "999px"
spacing:
  hairline: "1px"
  phone-gap: "0.625rem"
  control-gap: "0.6rem"
  row: "0.75rem"
  panel-phone: "0.85rem"
  layout-gap: "1rem"
  panel: "1.1rem"
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
  button-ghost:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.35rem 0.7rem"
    height: "36px"
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
    rounded: "{rounded.sm}"
    height: "56px"
    width: "100%"
  button-hero:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "12px"
    padding: "0.55rem 1.4rem"
    height: "52px"
  button-sos-hover:
    backgroundColor: "{colors.danger-strong-hover}"
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
    height: "44px"
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
  panel-preview:
    backgroundColor: "rgb(21 19 31 / 0.92)"
    rounded: "{rounded.lg}"
    padding: "1.3rem"
  sheet:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "{spacing.panel}"
---

# Design System: Safe Location

<!-- Recorded after the build from the shipped code (style.css, landing.css, landing.js, index.html, welcome.html,
account.html, emergency.html, trips.html, signin.html, app.js renderCondition/renderSos/showTripPanel,
tests/landing.spec.js). Palette "Violet night". Rendered evidence: .impeccable/review/*.png, Playwright captures of
the real app against a throwaway local server with simulated GPS, not field photos or production data.
landing-desktop-hero.png, landing-mobile-full.png and tracker-desktop.png were captured after the Violet night
palette and the /welcome page shipped; the older desktop-*.png and mobile*.png captures predate the palette change. -->

## Overview

**Creative North Star: "The Status Instrument"**

Safe Location reads like an instrument panel on a dark violet night, not a dashboard of equal cards. One live panel
answers "am I being recorded, and is it reaching anyone?" before anything else: a single condition band carries the
overall tone in one plain sentence, a large state line names what is happening, and a ruled grid of label-over-value
readouts gives the evidence. Everything else (map, trip, recording settings, backup, details, history) sits below or
beside it at lower weight.

Density is moderate and calm. Panels are charcoal-violet sheets divided by hairline rules rather than stacks of
floating cards; colour is almost entirely neutral until something needs a person's attention, and then it appears in
exactly one place, with one meaning. The face is Geist, self-hosted and small (29 KB for Latin), so the product reads
like a modern SaaS tool without a font service; text shows at once in the system font and swaps when Geist arrives.
Behind everything lies the signal field: soft violet light falling from the top of the screen with a faint pink glow
at one corner, a point grid like a map graticule, and fine grain.

Motion follows a budget. The tracker stays open for hours on a phone battery, so it is nearly still: colour changes
ease over 400ms and the only thing that moves on its own is the breathing dot while recording is healthy. Motion lives
on the short-visit pages: the sign-in veil breathes, and the public landing page at /welcome (a Persuade-mode page in
the same world) drifts an aurora and animates a preview of the real tracker.

The world is honest about uncertainty. Readings show their age and accuracy in tabular numerals, gaps are drawn as
dashed lines, doubtful points are amber and left off the route, and nothing in the copy claims a message was
delivered unless the provider confirmed it. The landing page's previews only show states the product really shows.

**Key Characteristics:**
- One tone-carrying condition band per screen, driven by state (idle grey, calm violet, attention amber, alert red).
- Hairline-ruled grids and sheets with ruled sections instead of card stacks.
- Violet means working, amber means attention, red means emergency, failure or irreversible removal.
- Geist (self-hosted, system fallback), weights 600 to 750, tabular numerals for every reading.
- The signal field background: violet light from above, a pink side glow, a fading point grid, grain. CSS only.
- Flat, bordered surfaces in the tracker; depth only on map controls and markers.
- A tall red SOS always within thumb reach, with "Call 112" under it.
- Motion budget: the tracker nearly still, motion on the landing and sign-in pages, all of it off under reduced motion.

## Colors

A near-monochrome violet-black and charcoal field where three signal hues each own one meaning, plus one pink that
only ever glows.

### Primary
- **Working Violet** (accent, #8b5cf6): the healthy, working state. Calm-tone condition dot and band edge, the
  latest-position marker and live route line, active pills, checked switches and the accent colour of native controls.
- **Deep Working Violet** (accent-strong, #7c3aed): solid fill for the one primary action in a region (Start
  Tracking, Sign in, submit, the landing's "Open the tracker") and the brand mark; darkens to **Pressed Violet**
  (accent-hover, #6d28d9) on hover. White text on it is 5.7:1.
- **Lavender Text** (accent-text, #c4b5fd): violet text on dark ground: links, calm-tone condition sentence, success
  messages about local work, the emphasised word in the landing headline, step numbers.
- **Violet Wash** (accent-soft): tinted background behind active pills.
- **Aurora Pink** (accent-glow, #e879f9): light only. It appears inside the signal field's corner glow, the landing
  aurora and closing panel, and the end of the landing's step rail. It never fills a control, never carries text and
  never marks a state.

### Secondary
- **Attention Amber** (warning): anything that needs attention but is not an emergency: offline, weak or stale GPS,
  points waiting to upload, flagged positions ("GPS jump", "Low accuracy" badges, flagged marker), paused or delayed
  trips, simulated-mode banners. Always paired with **Amber Wash** (warning-soft) and a 0.35 to 0.55 alpha amber edge.

### Tertiary
- **Emergency Red** (danger-strong, #dc2626): the solid fill of the SOS button and of confirmed destructive submits
  (Stop tracking, Delete my account, Remove device), darkening to **Arterial Red** (danger-strong-hover, #b91c1c) on
  hover. White text on it is 4.83:1.
- **Alarm Red** (danger) with **Alarm Wash** (danger-soft) and **Alarm Text** (danger-text): alert-tone band and edge,
  denied permission and error readouts, "Rejected by server" badge, check-in requested, the Call 112 link and the
  outline-only removal buttons.
- **Confirmed Green** (success) and **Confirmed Green Text** (success-text): only for facts that are confirmed: GPS
  live, online, all uploaded, trip start marker, provider-confirmed delivery status, live-provider mode banner.

### Neutral
- **Night Violet** (bg, #0b0a14): page ground under the signal field, segmented-control well, message preview.
- **Header Violet** (bg-header): reference value for the sticky header, which is drawn as Night Violet at 0.72 alpha
  with a 14px backdrop blur so the signal field shows through while content stays legible.
- **Charcoal Violet** (surface, #15131f): the instrument, readout cells and dialogs, opaque.
- **Veiled Charcoal** (panel, Charcoal Violet at 0.86 alpha): sheets and cards, so the field's light tints them.
- **Raised Charcoal** (surface-raised, #1d1a2b): inputs, selects, secondary and ghost buttons, hover rows, popups.
- **Map Ground** (map-bg, #120f1d): map container before tiles load.
- **Hairline** (border) and **Strong Hairline** (border-strong): panel edges, section rules, readout grid lines.
- **Control Outline** (control-border, #7a7299): input, select and switch outlines; 3.8:1 against Raised Charcoal
  (WCAG 1.4.11).
- **Ink** (text), **Muted Ink** (text-muted), **Faint Ink** (text-faint): primary text, labels and secondary copy,
  notes and the idle-tone dot. Faint Ink on Charcoal Violet is 5.32:1; every text pair passes WCAG AA.
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

**Character:** A clean, geometric-leaning grotesk with a contemporary SaaS feel, set heavy (600 to 750) and slightly
tight in large sizes so it reads in sun and at night. Self-hosted from `/fonts/` under the SIL Open Font License
(`fonts/LICENSE-Geist.txt`): Latin (29 KB) always, Latin Extended (16 KB, includes ₦) and the dot-below set
(8 KB: ẹ, ọ, ṣ, ị, ụ for Yoruba and Igbo names) only when a page uses those letters. `font-display: swap`, a preload
on every page, 30-day caching and a service-worker copy keep it cheap on mobile data and available offline.

### Hierarchy
- **Hero** (650, clamp(2.6rem, 1.4rem + 4.4vw, 5.1rem), 1.02, -0.04em, balanced): the landing page's one headline.
- **Section** (650, clamp(1.9rem, 1.2rem + 2.4vw, 3.1rem), 1.06, -0.035em, balanced): landing band headings.
- **Lead** (400, clamp(1.05rem, 1rem + 0.3vw, 1.2rem), 1.6, Muted Ink): the landing intro; band copy is 1.06rem.
- **Display** (700, clamp(1.5rem, 1.2rem + 1vw, 2rem), 1.15, -0.025em): the instrument's state line ("Tracking
  active", "Not tracking"); 1.35rem below 360px.
- **Headline** (700, clamp(1.5rem, 1.2rem + 1vw, 1.9rem), -0.025em): page titles on account, emergency and trips
  pages; sign-in cards use 1.5rem.
- **Title** (650, 1.0625rem, -0.01em): section headings inside sheets and cards; landing step and feature titles use
  1.2rem, -0.02em.
- **Condition** (650, 0.9rem, 1.35): the condition band sentence; 0.86rem on phones.
- **Reading** (650, 1rem, 1.35, tabular numerals): readout values; 0.9rem below 560px. Detail values use 0.98rem;
  the large reading (650, 1.375rem, 1.25) is for headline statistics.
- **Body** (400, 15px, 1.5): running text, messages (0.88rem), help text (0.78rem).
- **Label** (600, 0.76rem): definition-term labels over values; readout labels are 0.72rem. Sentence case, no
  tracking, no uppercase.
- **Button** (650, 0.92rem): all buttons; primary instrument and rail actions step up to 1rem at 50px height; landing
  hero buttons are 1rem at 52px.
- **SOS** (750, 1.1rem, 0.02em): the SOS button; the narrow phone column shows the word "SOS" at 800, 1.85rem, 0.04em.

### Named Rules
**The Tabular Reading Rule.** Every number that updates (times, countdowns, accuracy, coordinates, counts) is set with
tabular numerals so live readings tick without layout shift. This holds inside the landing previews too.

**The Light Font Rule.** One self-hosted family only (Geist), subset by script and loaded with `swap`, so text never
waits for a download. No font services, no icon fonts, no second display family.

## Layout

The tracker is a named-area grid. Above 900px: the instrument and the SOS card share the top row; the map sits under
the instrument at the window's remaining height (clamp(420px, 100vh - 360px, 760px)); a right rail
(clamp(320px, 27vw, 380px)) holds Trip Mode, Recording and Backup as one sheet; latest location and statistics sit
side by side in a second sheet under the map; history spans the full width last. Rows are auto, auto, 1fr, auto so a
tall rail adds space under the details, not above them. Content width is min(100% - 2rem, 1440px).

The four readouts sit in one row (1.7fr plus three 1fr) above 1180px, and in a 2x2 grid below. From 900px down,
instrument and SOS stay side by side with SOS in a narrow column (clamp(6.75rem, 30vw, 15rem); 6.25rem below 360px),
then map, rail, details and history stack. While an SOS is sending or active, the SOS card takes the full width under
the instrument. Below 720px gaps tighten to 0.625rem, the details sheet stacks, and controls grow to 44px. Below 560px
the map toolbar is a single row, Recenter and Fit route become 44px icon-only buttons that keep their accessible
names, and panel padding drops from 1.1rem to 0.85rem.

Account, emergency and trips pages are a single column at min(100% - 2rem, 880px); sign-in is one centred card up to
27rem wide. The landing page is min(100% - 2.5rem, 1200px) wide (2rem margin below 720px) with bands of
clamp(4rem, 9vw, 7.5rem) vertical padding; see Landing Page below.

### Named Rules
**The Instrument First Rule.** On every viewport the condition band, state line and readouts come before the map,
with SOS beside them within thumb reach.

## Elevation & Depth

The tracker is flat. Surfaces are separated by tone (Night Violet ground, Charcoal Violet panels, Raised Charcoal
controls) and by 1px hairlines, never by shadow. Shadow exists only where something floats over the map, and as the
focus ring. The landing page's illustrative previews are the one place soft depth is allowed (see Landing Page).

### Shadow Vocabulary
- **Focus ring** (`box-shadow: 0 0 0 3px rgb(167 139 250 / 0.55)`): every focusable element, replacing the outline.
- **Map control lift** (`box-shadow: 0 4px 14px rgb(0 0 0 / 0.35)`): Leaflet zoom bars only.
- **Marker halo** (`box-shadow: 0 0 0 6px rgb(139 92 246 / 0.25), 0 2px 6px rgb(0 0 0 / 0.5)`): latest-position
  marker; amber halo when the point is flagged.

### The Signal Field (page background)
Drawn by `body::before` and `body::after`, fixed behind everything, in pure CSS (no image downloads, no script):
- **Veil:** an elliptical radial gradient of Working Violet at 0.24 alpha falling from just above the top centre, with
  two fainter glows near the top corners: Aurora Pink at 0.10 alpha on the left, light violet (rgb(167 139 250)) at
  0.09 on the right.
- **Point grid:** 1px points of Muted Ink at 0.16 alpha every 24px, like a map graticule, fading towards the bottom of
  the screen through a vertical mask.
- **Grain:** an inline SVG noise tile at 0.06 opacity in overlay blend, so the dark ground never bands.
- Sheets and cards are Veiled Charcoal with a faint lavender top sheen (0.045 alpha) and a 1px inner top highlight, so
  the field tints them slightly; the instrument stays opaque because its readout grid relies on an opaque surface.
- **Motion:** static on the tracker. On the sign-in pages the veil breathes between 0.8 and 1 opacity over 14s; on the
  landing page the aurora replaces it. Off under reduced motion.

### Named Rules
**The Ruled Not Stacked Rule.** Group related panels as one sheet whose sections are divided by hairlines, and lay
readings on a grid whose 1px gaps show the border colour. Do not stack floating, shadowed cards.

**The Motion Budget Rule.** The tracker stays nearly still because it runs for hours on a phone battery: only the
calm-tone breathing dot, the map spinner and short colour transitions. Ambient motion belongs to short-visit pages
(sign-in, landing). Everywhere, `prefers-reduced-motion: reduce` stops every animation, and content never depends on
motion to be visible.

## Shapes

Gently rounded panels (14px) hold gently rounded controls (9px); segmented options and the brand outline use 6px.
Status pills, badges, switch tracks and dots are fully round. The landing scales up: hero buttons 12px, preview
panels 18px, the closing panel 28px, the device frame 34px (screen 25px). Hairlines are always 1px; dashed lines are
reserved for data gaps, simulated-mode banners and development hints (and the untravelled route in the landing
preview).

## Logo

**The Circle of trust.** A white mark on a Deep Working Violet (`#7c3aed`) tile: a solid dot in the centre (you) and
three smaller dots on a ring around it (the people you trust). The ring breaks where each person sits. It is drawn on a
64 x 64 grid: ring radius 19 with 4-unit round-capped strokes, people dots radius 4.2 at 12, 4 and 8 o'clock, centre
dot radius 7.5. Web tiles round at radius 15 of 64; the app-store icon is square and full-bleed with the mark at 70%.
All files and their uses are in `brand/README.md`. Never stretch it, recolour the mark, add effects, or put the white
mark on a light background (use `brand/logo-mark-violet.svg` there).

## Components

### Buttons
Solid and quiet: no gradients, no transforms.
- **Shape:** gently rounded (9px), minimum 44px tall; instrument and rail actions 50px; SOS 56px.
- **Primary:** Deep Working Violet fill, white 650 text, 0.55rem 1rem padding; one per region.
- **Secondary:** Raised Charcoal with a Strong Hairline edge; edge turns Working Violet on hover.
- **Ghost:** 36px Raised Charcoal with a Hairline edge, for toolbar tools; text turns Lavender on hover. On phones
  the label is visually hidden and the button is a 44px square icon.
- **Danger ghost:** transparent with Alarm Red text; Alarm Wash and red edge on hover. For removal only.
- **Hover / Focus:** 150ms colour transitions; focus is the 3px violet ring. Disabled is 0.45 opacity.
- **Landing hero:** the same primary and secondary buttons at 52px, 12px corners, 1.4rem side padding, full width
  below 720px. Only the landing's primary carries a soft violet glow
  (`0 10px 30px -10px rgb(124 58 237 / 0.8)` plus a 1px inner highlight); tracker buttons stay shadowless.

### Chips (status pills and badges)
- **Pills:** fully round, Charcoal Violet with a hairline, a 7px dot in the state colour and 600 0.8rem text.
- **Badges:** fully round, 650 0.72rem; amber variant for doubtful data, red variant only for failures and active SOS.
- **Trip badges:** green when active, amber when paused, delayed or offline, red only for check-in requested.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** Veiled Charcoal (sheets), Charcoal Violet (instrument).
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px Hairline; red-tinted edge (0.35 alpha) for SOS and danger-zone containers.
- **Internal Padding:** 1.1rem; 0.85rem in the phone instrument.

### Inputs / Fields
- **Style:** Raised Charcoal, 1px Control Outline, 9px corners, 44px tall (selects 42px); label above in 600 0.82rem
  Muted Ink, help below in 0.78rem Faint Ink.
- **Focus:** border turns Working Violet plus the focus ring.
- **Error / Disabled:** errors are stated in a message or notice in Alarm Text; disabled fields drop to 0.6 opacity.

### Navigation
A sticky Header Violet bar (64px, 56px on phones) with the Circle of trust mark and name at left and status pills or the
account pill at right. The tracker header carries a quiet "How it works" link to /welcome; the tracker footer and the
sign-in card link there too. No tab bars; secondary pages are reached from links in section headings. The landing
header adds in-page links (How it works, Trip Mode, SOS, Privacy; hidden below 980px), "Sign in" (hidden below 720px)
and a compact 40px "Open the tracker" primary.

### Status Instrument (signature)
A panel whose edge and condition band take one tone from the state: idle (grey), calm (violet), attention (amber),
alert (red). The band holds a dot and one sentence ("Not recording: nothing is being saved or shared", "Trip to X:
recording every 1 minute", "Recording offline: points wait on this phone", "SOS active: ..."); the alert tone wins over
attention, attention over calm. Under it: the state line, a next-reading countdown, four readouts (GPS, Connection,
Backup, and Trip or Saved here) on a ruled grid, an event message line, and the action row (Start or Stop tracking,
Start a trip; while a trip is open, its main action sits here). Tone changes ease over 400ms
(cubic-bezier(0.16, 1, 0.3, 1)).

### SOS Column (signature)
A red-edged card holding the Emergency Red SOS button and an outlined "Call 112" link pinned to its bottom. In the
narrow phone column it becomes a tall button with the word "SOS", a short label and a one-line summary; the full
sentences stay available to screen readers. While sending or active it goes full width.

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
- **Do** let one condition band per screen carry the overall tone, with a plain sentence that names what is happening.
- **Do** use Working Violet for working state, Attention Amber for attention, and red only for emergency, failure and irreversible removal.
- **Do** keep Aurora Pink as light only: field glows, aurora, rail ends; never a fill, text colour or state.
- **Do** set every live reading in tabular numerals at 650 weight, label over value, on a hairline-ruled grid.
- **Do** group related sections into one sheet divided by 1px hairlines.
- **Do** keep primary controls at least 44px tall and keep accessible names when a label is visually hidden.
- **Do** honour reduced motion everywhere: stop the breathing dot, spinner, veil, aurora, previews and colour transitions, and keep content visible without motion or JavaScript.
- **Do** make landing previews show only states the product really shows, in the same honest delivery language.
- **Do** show age and accuracy with every location and say "simulated" or "submitted" until a provider confirms delivery.

### Don't:
- **Don't** use red for a doubtful reading such as a GPS jump or low accuracy; that is amber.
- **Don't** add ambient motion to the tracker; the breathing dot in the calm tone is the only thing that moves there on its own. Motion belongs to the landing and sign-in pages.
- **Don't** add eyebrows or kickers (small uppercase labels above headings); section titles stand alone in sentence case.
- **Don't** stack shadowed, same-weight cards where a ruled sheet will do, and don't carry landing glows and shadows into the tracker.
- **Don't** add font services, a second family or icon fonts; use self-hosted Geist and inline SVG icons.
- **Don't** claim a message was delivered, or that someone is safe or in danger, without provider confirmation or the person's own action.
- **Don't** fabricate streets, routes, accuracy or results to fill an empty state; say what is unknown.
