# Kinly Design System — "Evergreen"

> **Rebrand note:** the system began as "Serene Connect" (Deep Trust Blue
> `#1A4B84`). It is now **Evergreen**: Deep Evergreen `#1A5D43` primary, and
> the palette ships in **two UI styles**, chosen at onboarding by age and
> changeable in Settings → Display:
> - **Modern** (`uiStyle: 'normal'`) — whisper borders, softer muted tones,
>   slightly compact type, full chat list.
> - **Easy** (`uiStyle: 'simple'`) — strong outlines, darker secondary text,
>   slightly larger type, big favorite-people tiles on the home screen.
>   Recommended for 65+.
>
> See `colorsFor(dark, style)` and `STYLE_FONT_FACTOR` in `theme.ts`. Color
> references below predate the rebrand; the hue guidance still applies with
> blue swapped for evergreen.

Kinly is a family messaging app built for **intergenerational use** — it has to
work as well for a 78-year-old with low vision and shaky hands as it does for
their grandchild. Every decision below serves that goal: legibility, calm, and
cognitive ease over decoration.

The tokens live in [`apps/native/src/theme.ts`](apps/native/src/theme.ts) and
are consumed through the `ThemeProvider` / `useTheme()` hook so light/dark mode
and the user's text-size preference flow through automatically. **Never hardcode
a hex value or font size in a component — pull it from `useTheme()`.**

---

## Brand & personality

Reliability, warmth, clarity. The interface should feel *quiet*: reduce visual
noise so the focus stays on the message and the person. The emotional target is
safety and calm — generous whitespace, high-contrast text, a soft, non-clinical
palette. Style is Minimalism × Corporate Modern: functional elegance, not flair.

---

## Color

Centered on **Deep Trust Blue** for stability, balanced by **Warm Cloud White**
so the UI never feels cold or institutional. All text pairings clear WCAG AA.

### Light (`lightColors`)

| Token | Hex | Role |
| --- | --- | --- |
| `primary` | `#1A4B84` | Deep Trust Blue — headers, nav, primary actions, my message bubbles |
| `primaryDark` | `#003466` | pressed / emphasis |
| `accent` | `#059669` | emerald — confirm / accept / **send** |
| `warning` | `#D97706` | warm amber — "new" indicators & gentle alerts (never alarm) |
| `danger` | `#BA1A1A` | error / destructive / block |
| `background` | `#F8F9FA` | Warm Cloud White surface (Level 0) |
| `card` | `#FFFFFF` | card surface (Level 1) |
| `bubbleMine` | `#1A4B84` | my chat bubble (white text) |
| `bubbleTheirs` | `#E8F0F8` | soft blue tint — their chat bubble |
| `text` | `#191C1D` | on-surface |
| `textMuted` | `#424750` | on-surface-variant (timestamps, hints) |
| `textOnDark` | `#FFFFFF` | text on primary/accent |
| `border` | `#C3C6D1` | outline-variant, 1–2px hairlines |

### Dark (`darkColors`)

Same hues, low-glare surfaces: `background #0F1620`, `card #1A2430`, `primary`
lightened to `#5A9BE8` for contrast, bubbles `#1E4E86` / `#233140`, text
`#EDEEF0`. Chosen for calm night reading, not pure black.

Semantic colors carry meaning — green *only* means go/accept/sent, amber *only*
means new/attention, red *only* means stop/error. Never reuse them decoratively.

---

## Typography

**Atkinson Hyperlegible** everywhere — a typeface engineered by the Braille
Institute to maximize character recognition for low-vision readers. It is loaded
once in the root layout (`useFonts`) and applied globally by
[`src/global-font.ts`](apps/native/src/global-font.ts), which picks the regular
or bold file per element (RN ignores `fontWeight` under a custom family, so we
map weight → font file to keep the hierarchy).

The scale is **intentionally oversized** so nobody has to zoom. Base body is
`20`. `BASE_FONTS`:

| Token | px | Use |
| --- | --- | --- |
| `huge` | 34 | welcome / hero |
| `title` | 28 | screen titles |
| `heading` | 24 | headers, names |
| `button` | 22 | button labels |
| `body` | 20 | messages, inputs, list text |
| `small` | 16 | timestamps, hints |

**Text size** is user-adjustable (Settings → Display): `normal ×1`,
`large ×1.15`, `xlarge ×1.3` via `scaledFonts()` — the whole app rescales.

---

## Layout & spacing

Strict **8px baseline grid**. `spacing = { xs:8, sm:12, md:16, lg:24, xl:40 }`.

- **Container padding:** `lg` (24px) side margins to prevent edge-taps and frame
  content.
- **Section rhythm:** large `xl` (40px) gaps between distinct topics / people.
- **Tap targets:** `TAP_TARGET = 64` (spec floor is 56) — every button, icon,
  and row must clear it for reduced motor precision. List rows run taller still.

---

## Shape & elevation

`radius = { sm:8, md:12, lg:16, pill:9999 }`. Base radius 8px reads friendly but
professional; cards and grouped containers use `lg` (16px). Full pills are
reserved for the AI button and badges.

Depth is **tonal, not shadowed** — the design avoids heavy shadows and blur:

- **Level 0** — Warm Cloud White background.
- **Level 1** — white cards with a 1px low-contrast border (`border`). Flat.
- **Level 2 (pressed)** — subtle opacity/tint change; no clutter.

---

## Components

- **Buttons** — full-width on mobile for the largest tap area; primary = blue
  with white text; confirm/send = emerald `accent`.
- **Inputs** — 20px text, a permanent label above the field (no floating
  labels), 2px border that thickens/darkens on focus so the active field is
  unmistakable.
- **Lists** — every row clears the tap-target floor; high-contrast 24px icons
  **always paired with a text label**, never icon-only.
- **Avatars** — circular; color derived from the name (`colorForName`) with
  legible initials (`initialsForName`) when there's no photo.
- **Icons** — from `@expo/vector-icons` (Ionicons), sized ≥24, colored from
  theme tokens.

---

## Accessibility checklist (hold every screen to this)

- Text pulled from `useTheme().fonts` so it honors the user's size setting.
- Colors pulled from `useTheme().colors` so dark mode and contrast hold.
- Interactive elements ≥ `TAP_TARGET`, with `accessibilityRole` + a visible
  text label.
- Meaning never conveyed by color alone (pair with icon + label).
- Works in both light and dark, at all three text sizes.
