# Mimo scroll tour: spec (reverse-engineered from mosio.me)

mosio.me puts one fixed mascot layer above the page (`position:fixed; inset 0 0 auto auto; z-index:45; pointer-events:none`; only the mascot itself takes pointer events). The mascot is invisible at scrollY 0. It appears once the user scrolls, then flies between "stops" placed along the page. Each stop is a scroll range in which it perches on a UI element. Between stops it flies along an arc. One rAF loop drives everything, and the loop sleeps when the mascot is settled.

## DOM contract (section authors place these, the tour reads them)
Any element with `data-tour-stop="<name>"` is a stop. Attributes:
- `data-tour-anchor="<css selector>"` is the element to perch on. It defaults to the stop element itself.
- `data-tour-side="top" | "right" | "left" | "center"` sets the perch position (default `top`). `right`/`left` fall back to `top` when there is no room (`< s*1.05`).
- `data-tour-aim="<css selector>"` is what the eyes look at. Default: nothing. While in flight the eyes follow the velocity.
- `data-tour-face="idle|smile|happy|wink|wow"` is the expression while perched.
- `data-tour-fx="elastic|glow"` is played once on landing. `elastic` gives a squash impulse and `glow` a brightness/saturate pulse over .75s.
- `data-tour-say="<already translated text>"` is the speech bubble shown while perched.
- `data-tour-press="<css selector>"` (optional): once per visit, when the page has been still for 280ms on the stop or the scroll passes the middle of the range (±4.5% of innerHeight), and only while the element is enabled and fully on screen, the mascot flies to it and "presses" it for ~0.65s, then returns to its perch. A fast scroll that stops on a stop still gets the press. The element gets `data-tour-pressed` (CSS: scale .86 and brightness 1.25, .15s) and the mascot squashes down. This is the scroll-driven "Mimo clicks the button" moment.
- `data-tour-dock` (optional, meant for the last stop): Mimo flies into the anchor (a seat), takes the size `anchorWidth*1.35`, and stays there. Once it arrives, the layer switches to `position:absolute` in page coordinates so it scrolls with the seat instead of trailing it. No viewport clamp and no speech bubble.
- `data-tour-grow` (first stop only): the size grows with `smoothstep(.03,.15, scrollY/stopHeight)` from 0, so the mascot is HIDDEN at the top of the page and pops in as the user starts scrolling. It is hidden (layer `hidden`) while the size is < 4px.
- Range: `from = absTop(stop) - innerHeight*0.62` and `to = absBottom(stop) - innerHeight*0.62` (the first stop uses from = 0). If `next.from < prev.to + 30`, split at the midpoint ±20. Measure on resize, ResizeObserver(document.body) and `document.fonts.ready`.
- Events: when the perched stop changes, `window.dispatchEvent(new CustomEvent('mimo-tour', { detail: { stop } }))`. Sections may react, e.g. auto-play a demo when Mimo arrives.

## Geometry
- Base size `w() = mobile(<760px) ? 74 : clamp(innerHeight*.13, 86, 124)` px.
- Perch `top` = `{ x: rect.left + rect.width*.86, y: rect.top - s*.33 }`.
- `right` = `{ x: rect.right + s*.56, y: rect.top + rect.height/2 }`.
- `left` = `{ x: rect.left - s*.56, y: rect.top + rect.height/2 }`.
- `center` = rect center.
- The press target uses size `s*.8` and `{x: centerX, y: top - s*.3}`.
- Clamp the target to `x ∈ [s/2+6, innerWidth-s/2-6]` and `y ∈ [70+s*.3, innerHeight-s*.45]`.
- In flight between stop A (ends at `A.to`) and stop B (starts at `B.from`):
  - Flight progress `u = easeInOut(clamp((scrollY-A.to)/(B.from-A.to)))`.
  - Quadratic bezier from A's spot to B's spot. Control point x is the midpoint; control point y is `min(ya,yb) - clamp(dist*.35, 24, innerHeight*.28)`.
  - The size lerps between the two stops.
  - The face is `wow` while `.12<u<.88` and `dist > size*1.3`.
  - The bubble hides in flight.
- If the target jumps more than `innerHeight*1.1` (e.g. anchor-link jump), teleport: set the position and zero the velocity.

## Physics (per frame, dt clamped to [.001, .033])
- Position spring: `vx += (169*(tx-x) - 2*.72*13*vx)*dt; x += vx*dt` (same for y).
- Size: `size += (target-size)*(1-exp(-9*dt))`.
- Squash spring `a` (landing / elastic): `va += (-324*a - 7.9*va)*dt; a += va*dt`. Landing after a flight adds `va += 6`, elastic fx adds `va += 11`.
- Hop spring `h` (happy burst): `vh += (-196*h - 14*vh)*dt; h += vh*dt`. A burst does `vh -= 460*k*(max(size,60)/100); va += 5*k`. Show `happy` for .9s.
- Speed stretch: `speed = hypot(vx,vy)`; `c = clamp(speed/2600, 0, .16) * (2*|vy|/speed - 1)`.
- Scale:
  - `sx = (1 - c*.8)*(1 + a*.2 + press*.14)`.
  - `sy = (1 + c)*(1 - a*.2 - press*.2)`.
  - Breathing: `b = sin(t*2.4)*.014; sx *= 1-b*.6; sy *= 1+b`.
- Tilt: `rotate = clamp(vx*.011, -15, 15)deg`.
- Eyes/face group: translate `(fx*7, fy*6)`, where `f = clamp((aim - pos)/(size*1.4+1), -1, 1)`, smoothed with `1-exp(-10*dt)`.
- Layer transform: `translate3d(x, y + h + (1-sy)*size*.33, 0)`. Mascot transform: `translate(-50%,-50%) rotate(r) scale(size/base * sx, size/base * sy)`. Use `will-change: transform`.
- Blink every 2.8–5.4s (130ms). Mimo never goes `sleepy` on the homepage; it stays awake with the stop's face.
- Click/tap on the mascot: happy burst (k=1.3) plus a random fx.
- Sleep: stop rAF when the springs are at rest (all deltas < ~0.5px / 0.02) and scrollY is unchanged. Wake on scroll, resize or input. Stop on `document.hidden`.
- Reduced motion or the page's motion pause: render nothing (no mascot, no bubble). Every stop's UI must stay fully usable without the tour.

## Speech bubble ("sneak peek")
- The bubble is a small white card next to the mascot (it flips side to stay on screen), max-width ~240px, with a small tail toward Mimo.
- Pop-in: scale .6→1 plus fade, spring overshoot (cubic-bezier(.34,1.56,.64,1), ~.35s), transform-origin toward the mascot. It pops out fast (.12s) when the mascot leaves the stop.
- Text comes from `data-tour-say`, already localized by the section.
- `aria-live` off. The tour is decorative (`aria-hidden`), and the same copy must also exist in the section itself for screen readers.
