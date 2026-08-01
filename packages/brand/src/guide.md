---
status: draft
source_of_truth: https://github.com/carinyaparc/design-system
note: >
  This file mirrors the human-authored Brand Guide and design tokens in the
  design-system repo (brand/Brand Guide.dc.html, tokens/*.css, readme.md).
  It is a source of truth for machine-consumable visual tokens in this repo; upstream is the design-system, not a new source — update
  the design-system repo first, then resync this file. For production code,
  use tailwindcss/carinya-tokens.css from that repo directly, not this doc.
last_synced: 2026-07-31
---

# Carinya Parc — Brand Guide

Warm, rounded, grounded and welcoming — a "peaceful home" for land, food and community, on 42 hectares at The Branch, Upper Hunter NSW.

## Logo

- Wordmark: **CARINYA PARC** set in Marcellus, letterspaced (`.3em`), generous, always given room to breathe. No pictorial mark currently exists — an earlier Highland-bull emblem was retired; render the name in type where a mark would go.
- Monogram: **CP** in Marcellus, used for square/avatar contexts only.
- Clear space: the cap-height of "C" on all sides. Minimum width ~96px.
- Lockups: horizontal (primary), stacked, monogram, reversed (on eucalypt).
- Misuse — don't: stretch/squash, recolour off-palette, place at low contrast on busy photography, or reset in another typeface.

## Colour

Confident eucalypt green leads, warmed by dry-pasture gold and Highland-herd ginger, cooled by river blue. Every colour is named for something on country. Full 50–900 ramps live in `tokens/colors.css` in the design-system repo.

| Colour | Role | Hex |
|---|---|---|
| Eucalypt | Hero / foliage | `#2E5D45` (600) |
| Kangaroo Grass | Secondary / pasture | `#C6912E` (500) |
| Bracken | Accent / herd coat | `#B25A2B` (500) |
| Branch | Support / river | `#3E6E7A` (500) |
| Wattle | Highlight — use sparingly | `#E9B23C` |

**Warm neutrals** (never cool greys): Bark `#241F18` · Charcoal `#3A342B` · Stone `#8B8272` · Line `#E4D9C4` · Paperbark `#EFE6D2` · Fleece `#FBF7EE` · White `#FFFFFF`.

**Balance:** lead with warm paper (Paperbark/Fleece) and Eucalypt; Kangaroo Grass and Bracken as accents; Wattle only for the smallest highlights (roughly 60% warm neutral / 22% eucalypt / 10% gold / 8% bracken as a guide ratio).

**Backgrounds:** Paperbark `#EFE6D2` as the warm ground; Fleece `#FBF7EE` for raised surfaces; deep Eucalypt panels for emphasis.

**Borders:** 1px `--line` (`#E4D9C4`) on surfaces; 1.5px accent weight for outlined controls.

**Interaction:** hover darkens one ramp step; focus ring 2–3px Eucalypt; selection is a Wattle tint; transitions ~150ms, no bounce.

## Typography

| Role | Typeface | Notes |
|---|---|---|
| Display, headings, wordmark | **Marcellus** (Georgia/serif fallback) | Classical roman, warm heritage air. Weight 400. Letterspacing `.24em` on eyebrows, `.3em` on the wordmark. |
| Body & UI | **Hanken Grotesk** (system-ui fallback) | Clean humanist sans. Weights 400 / 500 / 600 / 700. |

**Type scale:** Display 64px · H1 48px · H2 34px · H3 24px · Body-lg 19px · Body 17px · Small 14px · Eyebrow 13px.
**Line height:** tight 1.05 (display) · heading 1.15 · body 1.6.
**Casing:** sentence case everywhere except the wordmark and eyebrows (uppercase, letterspaced).

Fonts are Google-hosted (Marcellus, Hanken Grotesk) via `tokens/fonts.css` in the design-system repo — vendor the woff2 files for offline/production use if needed.

## Shape & elevation

- **Radius:** sm 8px · md 16px · lg 24px · xl 28px · pill 999px (buttons, inputs, tags). Over-rounded throughout — no sharp corners or hairline-only geometry.
- **Shadow:** soft, warm, low-opacity, long — tuned to the ground colour, never a hard grey drop shadow (`--shadow-sm/md/lg` in `tokens/layout.css`).
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80px.
- **Graphic language:** soft circles and organic blobs as decoration; an "arc device" (rising-sun / hill arc) frames headlines and section tops — horizon, growth, a new day.

## Iconography

- **Motif family** — one drawing system, rounded 2.6px strokes, generous air, drawn from the eucalypt/bracken palette: eucalypt leaf, rolling hills, rising sun, the Branch (water), sprout, kangaroo grass. Reference: `guidelines/brand-motifs.card.html` in the design-system repo.
- **UI icons:** Lucide (lucide.dev), stroke-width ~2.6 to match the motif weight. No emoji, no unicode glyphs as icons anywhere.

## Photography

Real land, real hands, real light. Golden-hour warmth, wide horizons, honest close-ups — never sterile stock.

- Warm & golden — shoot early or late; embrace the dry-grass gold.
- People & hands — show the doing: planting, feeding, harvesting.
- Rounded corners always ≥18px; never hard rectangles. Full-bleed where possible, framed by warm paper.
- Subject bank: dry gold pasture, eucalypt stands, still dams, blue-green ranges, ginger Highland cattle, the river frontage.

## UI components (reference only — see repo for source)

Core set exists in the design-system repo, no prior component library: `core/` (Button, Tag, Card, Badge), `forms/` (Input, Checkbox, Radio), `feedback/` (Alert). Buttons are pill-shaped; primary is solid Eucalypt, secondary is Eucalypt outline, tertiary is a Bracken-coloured ghost link. Tags are pill-shaped with tinted background + darker text from the same ramp (e.g. Eucalypt-50 bg / Eucalypt-700 text).

## Where the real tokens live

- `styles.css` — root entry, imports all tokens; link for HTML prototypes.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `layout.css`, `semantic.css` (+ `.dark`).
- `tailwindcss/carinya-tokens.css` — Tailwind CSS 4 `@theme` bridge for the production site (Next.js 16 + React 19 + Tailwind CSS 4 + Base UI + Payload CMS).
- `assets/` — farm photography referenced by the brand docs.

Do not hand-copy hex values into other repos long-term — point at `tailwindcss/carinya-tokens.css` so the design-system repo stays the single source.
