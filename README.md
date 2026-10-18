# Haven 40 — Container Home Configurator

An interactive, browser-based 3D configurator for a modular home built from **one 40 ft High Cube shipping container**, insulated on the outside with 200 mm of mineral wool / EPS so the finished house no longer looks like a container.
Everything you see (the shell, walls, windows, furniture, landscape and textures) is built procedurally in real time with Three.js. There are no static renders or downloaded models.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Stack: React 18 + TypeScript, Three.js, React Three Fiber, Drei, @react-three/postprocessing, Tailwind CSS, Framer Motion, Zustand.

## What you can do

| Control | Options |
| --- | --- |
| **Floor plan** | Couple Retreat · Small Family · Premium Studio · Open Living (front door straight into the living-kitchen, bathroom across the short end) |
| **Interior** | Japandi · Modern Luxury · Contemporary Minimalist |
| **Exterior** | Natural Wood · Modern Stone (riveted HPL) · Modern Wood · Shou Sugi Ban · Nordic White · Black Premium · Clinker & Larch · Contemporary House |
| **Camera** | Exterior · Dollhouse · Top Down · Walkthrough |
| **Lighting** | Day · Sunset · Night (blends smoothly between them) |
| **Options** | Wooden terrace, rooftop PV (10 × 435 Wp = 4.35 kWp), room labels & dimensions, Murphy bed fold (Studio), quality toggle |

All 96 plan × interior × exterior combinations work in all four camera modes, and changing any of them never reloads the page.
The configuration is stored in the URL hash (`#plan=studio&interior=luxury&exterior=black&light=night`), so the **Share** button copies a link that reopens the same configuration.

### Camera modes
- **Exterior**: 360° orbit with damped zoom and pan, limited so the camera stays above ground. Opens on a three-quarter afternoon view.
- **Dollhouse**: the roof lifts and fades away, and the building is cut horizontally at 1.35 m with dark poché caps on the cut walls, like an architectural section. The camera sits at about 45°, and you can orbit and zoom freely. Room names are shown.
- **Top Down**: a true orthographic plan view with room sizes and areas, the overall exterior and interior dimension strings, walls, door openings, glazing and furniture.
- **Walkthrough**: an eye-level (1.62 m) first-person camera. On entry it glides up the garden path and through the front door, which opens. You can:
  - drag to look around;
  - move with WASD or the arrow keys (Shift to run, Q/E to turn), the on-screen pad, or the scroll wheel;
  - double-click the floor to walk to that spot;
  - jump to a named room, or start the **Guided tour**.

  Walls and large furniture block movement.

## Realistic dimensions

`src/config/dimensions.ts` is the single source of truth. The steel container is wrapped from the outside, so it is hidden completely and only a thin service lining is lost on the inside.

| Wall build-up (outside → inside) | |
| --- | --- |
| Façade finish (cladding, panels, brick slips or render) | 30 mm |
| Mineral wool / EPS | 200 mm |
| Container corrugated steel (incl. rib depth) | 45 mm |
| Battens + service void + lining | 40 mm |
| **Total** | **315 mm** |

| | |
| --- | --- |
| Container (ISO 40′ HC, hidden) | 12.19 × 2.44 × 2.90 m |
| Finished building | 12.65 × 2.90 m, 3.57 m high incl. 220 mm roof insulation |
| Interior | 11.95 × 2.27 m, 2.62 m clear ceiling height |
| Net usable area | ≈ 26.5–26.8 m² depending on the plan (partitions excluded) |

Windows are set in the insulation layer, which gives deep reveals. In Dollhouse and Top Down views the section cut draws the real wall layers (façade, insulation, steel, lining) with a legend.

## Architecture

```
src/
  config/           data only: dimensions, floor plans, interior/exterior/lighting presets
    layouts.ts      rooms, partitions, shell openings, furniture, lights, walkthrough viewpoints
    styles.ts       INTERIORS, EXTERIORS, LIGHTING
  lib/
    textures.ts     canvas-generated wood, concrete, stone, tile, fabric, cladding, corrugation, grass…
    materials.ts    cached material sets per style, section-cut clipping plane, glow registry
    geometry.ts     metre-scaled box UVs, walls with holes
  three/
    building/       container shell (skins, linings, reveals, windows, steel frame, roof), partitions, façade details
    furniture/      ~25 parametric pieces (beds, Murphy bed, kitchen, bath, seating, storage, decor)
    environment/    landscape, sky / sun / lighting rig
    CameraRig.tsx   orbit / dollhouse / orthographic plan cameras (camera-controls)
    WalkController.tsx  first-person walker with collision and guided routes
    Annotations.tsx room labels and plan dimension strings
  ui/               configuration panel, top bar, mode bar, walkthrough HUD
```

- **One shared shell.** Every floor plan places its openings in the same container shell (`Shell.tsx`), so the outer dimensions never change.
- **Independent finishes.** Interior and exterior styles are separate material sets (`getInteriorMats` / `getExteriorMats`), cached per style. Switching a style swaps material references and leaves the geometry alone.
- **Adding a floor plan** means writing one new `LayoutDef` in `layouts.ts`: rooms, partitions, openings, furniture items and viewpoints. The plan thumbnail, labels, dimensions, collision and lighting are all derived from that data.
- **Adding a style** means adding one entry to `INTERIORS` or `EXTERIORS`.

## Known limitations (deliberate trade-offs, not fake interactions)

- **Lighting and reflections**
  - The renderer is real-time rasterisation, not path tracing. Ambient occlusion is screen-space (N8AO) and shadows come from one sun/moon shadow map.
  - The six interior ceiling lights and four exterior wall lights are real point lights, but they cast no shadows.
  - The light pools on façades and paths are additive gradient decals.
  - Reflections come from a procedural studio environment rather than a photographic HDRI, which keeps the app fully offline-capable.
- **Materials.** Textures are procedurally generated (wood grain, corrugation normals, stone, fabric). They read well at configurator distances, but up close they are less detailed than scanned PBR textures.
- **Walkthrough collision.** Furniture is approximated by rectangles. Doors are always shown open, the front door opens automatically in walkthrough mode, and the camera cannot climb steps or go outside once it is inside.
- **Camera switch.** Moving between perspective and orthographic (Top Down) cannot be morphed continuously, so a short fade hides the swap.
- **Structure.** Large openings in a real container side wall remove structural corrugation and need welded steel box frames and an engineer's sign-off. The model shows those frames, but it is a visualisation, not a construction document.
- **Phones and tablets** start in the lighter rendering mode (no AO/bloom, 2K shadows, fewer grass blades). Touch works in every mode: drag to orbit, pinch to zoom, two fingers to pan, and in Walkthrough drag to look and tap the floor to walk there, or use the on-screen pad.
- **Performance.** On desktop, turn off **High-quality rendering** in the panel if the frame rate drops.

---

## Hablo (separate app in `hablo/`)

This repository also contains **Hablo**, a private Spanish-tutor PWA (Next.js + Supabase + ElevenLabs + Claude).
It is fully independent of the configurator above. See [`hablo/README.md`](hablo/README.md).
