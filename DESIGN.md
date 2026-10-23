---
name: Carousely
description: A friendly, orderly Instagram workspace for Indonesian UMKM and creators.
colors:
  primary: "#6558f5"
  primary-hover: "#5145d8"
  lavender: "#e9e5ff"
  mint: "#b8f3d6"
  mint-ink: "#0b5c3b"
  text: "#171827"
  text-secondary: "#6b6d80"
  background: "#f8f8fc"
  surface: "#ffffff"
  border: "#e7e7f0"
  focus: "#a9a1ff"
typography:
  display:
    fontFamily: 'Bricolage Grotesque, "SF Pro Display", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
    fontSize: "clamp(58px, 6.9vw, 96px)"
    fontWeight: 700
    lineHeight: 1.01
    letterSpacing: "-0.04em"
  headline:
    fontSize: "clamp(32px, 3.5vw, 47px)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.04em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, sans-serif'
    fontSize: "15px"
    lineHeight: 1.6
rounded:
  lg: "0.625rem"
  card: "12px"
  card-large: "16px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "16px"
  section-gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "12px 23px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "6px 8px"
---

# Design System: Carousely

## Overview

Carousely is ringkas, ramah, dan tepercaya: concise, friendly, and trustworthy. Preserve the existing logo, light workspace, indigo actions, lavender accents, mint support colors, and Bricolage headings. The landing page extends this identity with a spacious dashboard-led introduction and illustrative content previews.

**Key Characteristics:**
- Clear Indonesian labels and familiar product controls.
- Quiet surfaces with selective color and soft corners.
- Expressive landing illustrations around a recognizable workspace.

Evidence: `PRODUCT.md`, `.impeccable.md`, `src/app/globals.css`, `src/components/landing/landing-page.tsx`, `src/components/landing/landing.module.css`; field example in `src/app/(app)/sigap/schedule-card.tsx`. This is a source scan, not a rendered accessibility audit. No new identity or metaphor is introduced.

## Colors

Primary Indigo anchors actions, selection, and focus; its darker hover partner signals interaction. Lavender supplies supporting emphasis. Mint uses Mint Ink for readable text, never white. Ink, secondary ink, white surfaces, the pale background, and hairline borders keep the product calm.

Global semantic aliases (`accent`, `paper`, `ink`, `hairline`) map to these primitives. Landing-local lavender washes, purple-tinted borders, and muted text live in its CSS module. Botanical green, peach, and editorial purple belong to the fictional Akar Studio content, not a replacement Carousely palette.

## Typography

Bricolage Grotesque carries headings; the system UI stack carries controls and prose. Global h1/h2 tracking is tighter (-0.02em), except uppercase labels. Frontmatter display/headline sizes describe the landing, not every application screen; its body role describes the landing base.

Landing feature titles use Bricolage (37px, 650, 1.13); supporting paragraphs use compact UI text (14px, 1.85) with roughly 40–42ch measure. Tiny text inside the hero dashboard is illustration detail; interactive demos have larger control and message overrides.

## Layout

The application favors comfortable information density. The landing opens with centered copy above a miniature dashboard, then feature tabs, two-column demonstrations, workflow, brand examples, FAQ, and registration CTA. Content containers are generally 1160px, header 1280px, and hero stage 1440px. Desktop feature columns are 0.9fr/1.25fr with a 65px gap.

- At 1100px and below: gutters and gaps contract; the illustrative sidebar narrows.
- At 760px and below: mobile menu replaces desktop links; feature, workflow, brand, and FAQ sections stack; dashboard sidebar and floating post disappear. CTA and demo access remain available.
- At 420px and below: controls, calendar illustration, and padding compact further; five calendar columns remain.
- At 1500px and above: hero stage uses fixed 150px side padding.

## Elevation & Depth

White panels, hairline borders, and tinted sections provide the base hierarchy. Soft violet shadows lift landing previews and floating content; they are not a mandate to stack cards throughout the app. Exact shadows and motion values are in `.impeccable/design.json`.

Scroll-linked hero layers travel at different rates; workflow ornaments and brand previews add restrained movement. System reduced motion and the footer pause control disable scroll-linked transforms. The landing additionally removes CSS animation/transitions under reduced motion; global CSS shortens animations/transitions to 0.01ms and one iteration. Preserve readable final states and functional demos without movement.

## Shapes

Application buttons and fields use the shared control radius; cards use the card radii. The landing retains this gently rounded language with local 9–12px controls/panels, 18px demo backdrops, and a 20px final CTA (14px on mobile). Circular avatars, calendar dates, and status markers provide small accents; asymmetric chat corners distinguish speaker direction.

## Components

- **Buttons:** indigo primary with white text, darker hover, and a small landing hover lift; bordered/translucent secondary; white CTA on indigo. Main landing actions are at least 50px high on desktop, 47px on mobile.
- **Fields:** white, hairline border, shared control radius. Focus shifts the border to primary and adds a 3px focus-color mix ring; borderless editors retain their own treatment. The landing composer is an illustration, not a text input.
- **Navigation:** existing Carousely logo; desktop anchors plus sign-in/registration. Mobile menu supports Escape and returns focus. Feature tabs support arrow keys, Home/End, selected state, and associated panel.
- **Chips/cards:** outlined prompt options gain tinted selected/hover states; white demo panels sit on muted feature-specific backdrops. Calendar controls expose disabled states and selection feedback.
- **Demos:** AI Sigap changes sample concepts; calendar changes weeks and selects posts; inbox sends a local sample reply and resets. Keep illustrative-data labels and live feedback visible. FAQ uses native disclosure controls.
- **Focus:** landing links, buttons, and summaries use a primary outline (3px, 5px offset); retain the skip link and keyboard access.

## Do's and Don'ts

- **Do** reuse the existing logo, global brand variables, Bricolage headings, and system UI type.
- **Do** keep Indonesian copy concrete, friendly, and explicit about illustrative demo data.
- **Do** preserve reduced-motion behavior, pause control, keyboard states, and mobile feature access.
- **Don't** promote sample-brand artwork colors or miniature dashboard typography into application defaults.
- **Don't** add global landing selectors: keep landing CSS in `landing.module.css`, with element/state rules rooted under its local classes; consume shared tokens from `globals.css`.
- **Don't** invent customer metrics, pricing, testimonials, or new visual identity commitments.
