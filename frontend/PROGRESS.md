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

## Status
- [x] scaffold, data layer, simulator with 6 scenarios + 11-chapter story
- [x] Stage view: 3D scene (5 nodes, 2 shader wires, packets, ripples, camera rig), HUD panels
- [ ] server/app.py: serve /app/ + /classic, redirect /
- [ ] Views: Timeline, Diagnosis, Incidents (seal verification), Teach
- [ ] Scene polish: failure states verified per scenario (fading/congestion/ap_down/auth_fail/deauth), handover choreography, click-to-focus
- [ ] Mobile layout (390x844), tablet, 1920x1080, 1280x720 screenshots
- [ ] Production build committed to web/dist, README section, tests/test_hub.py still passes
- [ ] Perf pass (PerformanceMonitor low-quality path), reduced-motion, idle agent card state
