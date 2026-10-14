---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Tracker (index.html): surface brief

Mode: Operate. Audience: one person on a phone, on the move, often stressed, glancing; secondary review on a laptop.
Job: know at a glance whether recording is on and reaching the server, reach SOS in one tap, run a trip, then (lower)
inspect the map, details, backup and history. Constraints: every existing feature, ID and accessible name stays
(57 browser tests); navy/charcoal world with blue accent and red reserved for emergency; no invented data.

## Direction contract

THESIS: The tracker is an instrument, not a dashboard of equal cards. One live panel answers "am I being recorded,
and is it reaching anyone?" before anything else; it refuses the category default of a map hero with status scattered
across a stack of same-weight cards.

OWN-WORLD: Deep navy ground (#0a101c), charcoal-navy panels (#111a2b) with hairline borders, blue (#3b82f6) for
working state, amber for attention, red (#b91c1c) only for emergency and failure. System UI face; tabular numerals for
every readout. Readouts are label-over-value cells on a ruled grid; one condition band carries the overall tone.

STORY: In one glance the person reads the condition sentence and four readouts (location age/accuracy, connection,
backup, next point or trip ETA), sees SOS within thumb reach, starts or stops recording or a trip from the panel,
and scrolls down to the map, trip details, backup and history only when they want more.

FIRST VIEWPORT: Phone 390 wide: compact header (shield, account); instrument panel at left 2/3 width: condition band on
top (dot + sentence), big state line ("Recording" / "Not recording"), 2x2 readout grid, event line, action row
(Start/Stop tracking, Start a trip); SOS column at right 1/3: a tall red SOS button filling the panel's height, "Call 112"
under it. Map starts right below, about 45% of the screen. Desktop 1440: instrument across the main column top with the
four readouts in one row; SOS card at the top of a 380px right rail aligned with it; map under the instrument at the
window's remaining height; rail continues with Trip, Recording settings, Backup and sync; latest location and
statistics side by side under the map; history full width last. Signature interaction: the condition band and panel
edge shift tone (calm blue, attention amber, alert red, idle grey) with a short colour transition when the overall
state changes; readouts tick live every second without layout shift.

FORM: Status instrument, position 4 on the ordered list of seven structures; seed key 67fbe87d.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
