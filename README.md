# 🏎️ NFT Garage Viewer

A self-contained Three.js 3D garage that displays your NFT car collection.
Open **`garage.html`** directly in any modern browser — no build step, no server required.

## How it works

| Situation | What you see |
|---|---|
| `models/cars/<slug>.glb` **exists** | Your real Blender-exported model, auto-scaled & centred on the turntable |
| `.glb` **missing** | A procedural stand-in car built from Three.js geometry, coloured with the NFT's `color`/`accent` values |

The top-centre chip tells you which mode is active:  
🟢 **✓ REAL GLB LOADED** &nbsp;·&nbsp; 🟡 **⚡ PROCEDURAL MODEL**

## Quick start

```bash
# Just open it — works as a local file
open garage.html          # macOS
start garage.html         # Windows
xdg-open garage.html      # Linux
```

> **Note:** Chrome blocks local-file CORS for `.glb` loading.  
> Serve with any static server if you want real models:
> ```bash
> npx serve .       # then open http://localhost:3000/garage.html
> # or
> python3 -m http.server
> ```

## Adding your real car models

1. Export each car from Blender as **glTF 2.0 (.glb)**  
   *(File → Export → glTF 2.0, format = GLB)*
2. Drop the file into `models/cars/` with the matching filename:

| NFT | Expected filename |
|---|---|
| Phantom #001 | `models/cars/phantom-001.glb` |
| Specter #042 | `models/cars/specter-042.glb` |
| Ghost #108 | `models/cars/ghost-108.glb` |
| Wraith #217 | `models/cars/wraith-217.glb` |
| Banshee #333 | `models/cars/banshee-333.glb` |
| Revenant #512 | `models/cars/revenant-512.glb` |
| Poltergeist #777 | `models/cars/poltergeist-777.glb` |
| Specter #999 | `models/cars/specter-999.glb` |

3. Refresh `garage.html` — the viewer automatically picks up the real model.

## Controls

| Input | Action |
|---|---|
| Drag | Orbit camera |
| Scroll | Zoom |
| `←` / `→` | Previous / next car |
| Dot nav | Jump to any car |

## Customising the collection

Edit the `COLLECTION` array near the top of `garage.html`:

```js
{ id: 1, name: 'Phantom #001', tier: 'Legendary',
  color: 0xff006e,   // body colour (also drives procedural car + ring)
  accent: 0xff69b4,  // trim / DRL / skirt stripe colour
  glb: 'models/cars/phantom-001.glb' }
```

Tiers: `Legendary` · `Epic` · `Rare` · `Uncommon` · `Common`

## Tech stack

- **Three.js r0.165** — renderer, scene, lights, shadows
- **OrbitControls** — camera interaction + auto-rotate
- **GLTFLoader + DRACOLoader** — compressed GLB support
- **UnrealBloomPass** — neon bloom post-processing
- Zero npm, zero bundler — pure ES module import-map
