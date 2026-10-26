# Link Doctor 3D frontend: progress file

Overnight build (started 2026-10-26 ~23:00). If you are resuming (cron restart or new session), read this first.

## Rules (from the user)
- Work autonomously, no questions. Iterate until the frontend is "heavenly": great animations, 3D, visually clear, little dev clutter.
- Commit locally as Haise-727, NO Claude co-author trailer, NEVER push. ~7-10 meaningful commits total.
- Heavy things (browsers, builds) one at a time; check `free -h`; stop dev server / chromium when idle.
- Unproven data is fine (demo simulator) as long as the frontend works.
- Verify in a real browser: Playwright is installed in the scratchpad (`.../scratchpad/pw`, scripts `shot.mjs`, `clip.mjs`),
  using the cached chromium-1234 with the real GPU flags (`--use-gl=angle --use-angle=gl`). Read the PNGs to judge visually.

## Stack
Vite 8 + React 19 + TypeScript 7 + Tailwind 4 + react-three-fiber/drei/postprocessing + framer-motion + zustand.
Fonts are bundled (@fontsource: Geist, Geist Mono, Instrument Serif); nothing loads from a CDN (the demo kills the Wi-Fi!).
Build output goes to `web/dist` (base `/app/`), served by `server/app.py` at `/app/`. Old dashboard stays at `/classic`.

## Layout
- `src/lib/` types, store (zustand: hub snapshot + ui), sim.ts (in-browser simulator + scripted story), hash.ts (SHA-256 seal verify), useHub.ts (ws live vs demo)
- `src/scene/` 3D: world.ts (positions, curves, shared smoothed state `S`), Stage, Rig (camera), Nodes, Links (shader wires), Packets, Ripples, TagProjector
- `src/ui/` DOM: Header (nav pill), Hero, DiagCard, AgentFeed, DemoDock, FocusCard, NodeTags, StageUI, kit (Bezel, CountUp, RiseText)
- Gotchas learned: Tailwind's `.blur` class collides with custom class names (use `glass`); build ShaderMaterials imperatively
  (JSX `uniforms` prop is not the object you mutate); CSS resets must be in `@layer base`; drei `<Html>` errors under StrictMode (replaced by NodeTags).

## Status (updated 2026-10-26 ~00:05)
Done and verified in a real browser (GPU Chromium via Playwright), including against the real hub + fake_node:
- [x] scaffold, data layer, simulator (6 scenarios, 11 chapter story, Protection on/off)
- [x] Stage: 3D scene, shader wires, packets, ripples, shockwave on handover, glitch effect, moment toasts, node focus cards, zen mode (Z), hint
- [x] Views: Timeline, Diagnosis (radar, rules ladder or model importances), Incidents (browser SHA-256 seal check, matches Python), Teach (live record/stop works)
- [x] Live mode end to end: ws, reports, record/stop, train + reload model, waiting-for-node state
- [x] server/app.py serves /app/ and /classic; README + frontend/README written; python tests/test_hub.py passes
- [x] Responsive: 390x844, 820x1180, 1024x768, 1280x720, 1440x900, 1920x1080, no horizontal overflow
- [x] Committed: source commits + web/dist build

## Ideas not done yet (pick from here when resuming)
- Screen reader pass (aria-live on the headline), focus rings audit
- Perf: test the low quality path (`__ld.useUi.getState().setQuality("low")`), maybe lower dpr cap on 4K
- More polish on the 3D: Node C detail, laptop screen content, subtle camera parallax
- Re-run the screenshot sweep after every change; rebuild web/dist and commit it at milestones only
