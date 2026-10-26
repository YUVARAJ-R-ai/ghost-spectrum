# Link Doctor 3D dashboard

React, TypeScript and three.js (react-three-fiber). It builds to `../web/dist` and the hub serves it at `/app/`.

```bash
npm install
npm run dev       # dev server on :5173, proxies /ws and /api to a hub on :8500
npm run build     # typecheck, then write ../web/dist
```

Everything is bundled, including the fonts. The demo switches the Wi-Fi off, so nothing may load from the internet.

## How data gets in

`src/lib/useHub.ts` opens the hub's websocket. If a hub answers, its snapshots go into the store. If not, `src/lib/sim.ts` produces the same snapshots in the browser. The simulator is a TypeScript port of `tools/fake_node.py`, `brain.rule_diagnose` and `brain.Agent`, plus a scripted story.

The store (`src/lib/store.ts`) turns each new reading into a one-shot event for the 3D scene, and keeps the history the Timeline draws.

## Layout

| Path | What |
|---|---|
| `src/lib/` | types, store, simulator, SHA-256 seal check, websocket connection |
| `src/scene/` | the 3D stage: nodes, shader wires, packets, ripples, camera rig |
| `src/ui/` | glass panels, header, node tags, the four secondary views |

The 3D reads a shared, smoothed state object (`S` in `src/scene/world.ts`) every frame. React never re-renders at 60 fps.

## Working on it

- Add `?debug` to the URL to get `window.__ld`: the stores and the simulator. For example `__ld.useDemo.getState().pick("fading")`.
- Names that match a Tailwind utility will bite you. A custom `.blur` class turned into `filter: blur(8px)`. The glass class is called `glass`.
- Build ShaderMaterials by hand and mutate `material.uniforms`. The JSX `uniforms` prop is not the object the GPU reads.
- A `filter` on any ancestor stops `backdrop-filter` on its children. The panel wrappers animate opacity and position only.
- The repo's Python `.gitignore` ignores `lib/` and `dist/`. Two negation rules at the bottom bring them back.
- Reports are sealed with `sha256(json.dumps(report, sort_keys=True))`. `src/lib/hash.ts` reproduces that text exactly, including the `.0` on whole floats. Test it against a report written by `server/forensic.py` when you change it.
