# ShipSafe — Roadmap: look like a real product, not an AI one-off

> **North star:** ShipSafe is a tool people consult about *legal risk*. Its credibility **is** the
> product — if it looks AI-generated, nobody trusts the verdict. So Phase 1 is entirely about making
> it indistinguishable from a polished design-studio product, and the tool must be **exemplary at the
> exact thing it audits** (it should pass its own checks at the highest level). It then iterates
> autonomously through the overseer. Cross-cutting: the brand/design system built here becomes the
> **Copper Bay Labs** kit every future forge product inherits — a cohesive studio look across the
> portfolio is itself the strongest "this isn't AI slop" signal.

## The "AI-built" tells we are deliberately killing

| Tell | Fix |
|---|---|
| Emoji used as icons (🛟 ♿ 🔒) | a custom **SVG icon set** with one consistent stroke language |
| Default system font, everything centered | a considered **type pairing** (self-hosted) + a layout with an actual point of view |
| Generic blue, gradient-on-everything hero | a real **brand identity** — wordmark, restrained color system, one signature motif |
| Verbose, markety, "✨ unlock" copy | tight, **human, specific** copy with a confident plain voice |
| One flat page, no depth | **methodology / about / limitations** pages = the depth that signals a real org |
| Plain, forgettable result | the **report card is the hero** — a polished, screenshot-worthy, shareable artifact |
| An a11y tool that isn't itself accessible | ShipSafe scores ~100 on its **own** engine; keyboard/focus/contrast to AAA |

(Same anti-slop discipline as the websites factory: **verify by screenshot, never by build-success** —
undefined tokens and ugly layouts pass `build` green. Look at every change.)

## Phase 1 — CREDIBILITY (now) · *the de-slop pass* · verify: SCREENSHOT every item

- **P1.1 Brand identity** — wordmark + simple logo mark, a color system beyond default blue, a
  self-hosted type pairing (one distinctive display + a clean text face), one signature motif.
- **P1.2 Custom SVG iconography** — replace every emoji with a consistent icon set.
- **P1.3 Report redesign** — severity hierarchy, a real letter/score grade, a calm-but-serious
  visual tone; make it the thing people screenshot.
- **P1.4 Shareable result** — generate an OG/share image of the score (viral loop + legitimacy when
  a link is shared). *(may need the serverless deploy — pairs with P2.)*
- **P1.5 Self-exemplary accessibility** — ShipSafe passes its own checks; full keyboard nav, visible
  focus, AAA contrast, `prefers-reduced-motion`, semantic landmarks. Verify with axe + its own engine.
- **P1.6 Human copy pass** — rewrite every line to cut the AI cadence; specific, plain, confident.
- **P1.7 Trust depth** — `/methodology` (each check → the WCAG criterion + why it matters),
  `/about` (Copper Bay Labs), an honest limitations note.
- **P1.8 Polish** — instant feel, real loading/skeleton states, tasteful microinteractions, zero
  layout shift, fast on mobile.
- **P1.9 Real domain** *(owner)* — `shipsafe.app` or a `copperbaylabs.com` subdomain. Needs the
  domain + a custom-domain deploy (Pages custom domain, or the Vercel-token upgrade).

## Phase 2 — DEPTH (next) · make the verdict genuinely better

- **P2.1 More/deeper checks** — color contrast, tab order, ARIA validity, link purpose, captions,
  PDF/doc flags, multi-page crawl.
- **P2.2 Pro rendered-scan** *(owner: Vercel token)* — serverless + headless runs real
  Lighthouse/axe-core on the **rendered** DOM (the moat vs. the free HTML-only check).
- **P2.3 Actionable fixes** — per issue: deep link to the WCAG criterion + a copy-paste fix snippet.
- **P2.4 History / compare** — re-scan over time (localStorage first, account later).

## Phase 3 — MONETIZE (later)

- **P3.1 Pro tier $9/mo** *(owner: Stripe)* — scheduled re-checks + email alerts + PDF report.
- **P3.2 Agency/white-label** — branded reports for agencies (natural Copper Bay Tech tie-in).
- **P3.3 Optional lead bridge** — "email me my report" → Copper Bay Tech CRM (one-way funnel; keeps
  ShipSafe standalone while the agency still benefits).

## Phase 4 — DISTRIBUTE

- **P4.1 SEO cluster** — the "is my [Lovable/Bolt/v0] site ADA compliant" long-tail.
- **P4.2 Launch** — Product Hunt / Show HN / communities — **only after Phase 1** clears (a slop
  launch wastes the one shot at attention).
- **P4.3 Copper Bay Labs umbrella site** — lists all products on the shared design system.

## How the overseer iterates ShipSafe (the autonomous loop)

ShipSafe is a tracked project in `OVERSEER.md`. Each cycle the daily overseer routine advances **one
Phase-1 item** on an `overseer/<date>` branch, **screenshot-verifies** it (UI quality is never trusted
to build-success), and the tool must still pass **its own** accessibility checks. Owner reviews + merges
to `main` → GitHub Pages auto-deploys (free, no Vercel quota, so merging is low-risk). Work the phases
top-down; don't start Phase 4 (launch) until Phase 1 (credibility) is done.
