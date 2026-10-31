# Centered carousel-cover hero

## Approved direction

Replace only the current Mimo conversational opening. The user approved a desktop hero with centered text surrounded by a circular collection of the existing 20 Carousely carousel covers. Mobile follows Bleam's separated ring-panel-above-copy composition. Partners, folder showcase, workflow, pricing, FAQ, footer, branding, and account routes remain unchanged.

The user approved this direction in chat after supplying two Bleam screenshots and explicitly choosing the existing project images. No Bleam imagery, new generated assets, third-party dependencies, or account interactions are needed.

## Composition and motion

Designer owns visual implementation. On spacious desktop viewports the headline, description and CTAs share the ring's center. Preserve readable whitespace around the entire copy/CTA block throughout the animation, not merely a higher stacking order. Cards remain upright as they orbit clockwise. Cards may be intentionally clipped by the outer hero boundary, never by the text itself.

Use an 18-second cycle inspired by the observed reference: full rotation, gentle centered expansion, five 72-degree steps with holds, contraction. Desktop expansion moves cards away from the central copy instead of translating the upper arc over it. Mobile and compact-height layouts place a clipped ring panel above centered text and may use the reference's 2x upper-arc zoom. Avoid sticky scrolling and the old 340vh chat sequence.

Keep Bricolage typography, existing light Carousely palette and original covers. No extra dot pattern, social-action mockup strip, invented claims, category badges, or center statistics. Existing heading/body and registration CTA may be retained; secondary CTA should accurately describe its destination, the real showcase at #konten. Keep #fitur as a valid navigation destination and exactly one h1.

Design dials: ENERGY 2, RHYTHM 3, MOTION 2. The circle presents actual sample work; centered typography establishes the message; the inward clear area protects reading and conversion; motion concentrates attention on the portfolio rather than animating every element.

## Accessibility and lifecycle

Decorative orbit imagery is hidden from assistive technology, with empty alt text and fixed image dimensions. A reachable local pause/resume control should share the existing page-level pause state; footer control remains functional. Reduced motion renders a still, zoomed-out composition with readable copy. Freeze work when outside the viewport or the tab is hidden; resume without jumps where possible. Avoid per-frame React rendering. Preserve keyboard focus, usable targets and bilingual copy.

## Implementation boundaries

One designer lane owns hero source/styles, removal of the old ProductJourney implementation/styles, minimal landing integration and any required localization additions. Existing showcase implementation and styles must remain functionally unchanged. A separate fixer lane owns only homepage tests and QA scripts. Orchestrator owns this design note, reconciliation, copy review and final validation.

Stable test hooks: data-orbit-hero on the section; data-orbit-stage on the visual container; data-orbit-camera, data-orbit-ring and data-orbit-card on animation elements; data-orbit-copy on the copy wrapper. Expose data-paused on the stage as the effective motion state, and distinguish user pause/reduced/offscreen states if needed. New data hooks are verification affordances, not product features.

## Evidence path

- Designer: focused visual/browser evidence at desktop, mobile and compact-height sizes; sample a full animation cycle and inspect central text clearance, upright cards, pauses and reduced motion. Save screenshots outside the repo and report actual checks.
- Fixer: bilingual SSR contracts and narrow source/browser checks for 20 unique covers, no old Mimo opening, valid CTA targets, animation phases, no page overflow, global/local pause, reduced motion and unchanged showcase behavior. Retire stale chat/tour assumptions instead of leaving obsolete failing assertions.
- Orchestrator: inspect all changed artifacts and source diff; run lint, typecheck, complete unit suite and build once after writers reconcile; execute the browser QA against a running app and inspect desktop/mobile screenshots. Record any environmental limitation rather than implying verification.

Sample desktop sizes 1440x900 and 1280x720; mobile 390x844 and 320x568; compact landscape 844x390. Check both Indonesian and English where text length affects clearance. Runtime browser evidence is required for geometry and motion; source assertions alone cannot establish visual correctness.
