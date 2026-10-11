import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  BASE_Y,
  CEIL_Y,
  EXTERIOR,
  FACADE,
  FACADE_BOTTOM,
  FLOOR_Y,
  HALF_L,
  HALF_W,
  INSULATION,
  INTERIOR,
  LINING,
  ROOF_INSULATION,
  ROOF_TOP,
  ROOF_Y,
  STEEL,
  WALL,
  WALL_END,
} from '../../config/dimensions'
import type { LayoutDef, Side } from '../../config/types'
import { subtractRanges, wallWithHoles } from '../../lib/geometry'
import { shared, useExteriorMats, useInteriorMats, type ExteriorMats, type InteriorMats } from '../../lib/materials'
import { useConfig } from '../../store'
import { Box, Cyl } from '../primitives'
import { localOpenings, SIDE_ORDER, SIDES, type LocalOpening } from './sides'
import { Solar } from './Solar'

const TL = 0.025 // inner lining board thickness
const PROFILE = 0.055 // window frame profile width
/** windows sit in the insulation layer, just outside the container steel (warm-edge install) */
const WINDOW_N = -(FACADE + INSULATION - 0.035)
/** the front door sits further out so it can swing open outwards */
const DOOR_N = -0.075

const wallDepth = (side: Side) => (side === 'front' || side === 'back' ? WALL : WALL_END)

/* ------------------------------------------------------------------ */
/* Wall layer with holes                                               */
/* ------------------------------------------------------------------ */
function WallLayer({
  span,
  y0,
  height,
  n0,
  depth,
  holes,
  material,
}: {
  span: number
  y0: number
  height: number
  n0: number
  depth: number
  holes: LocalOpening[]
  material: THREE.Material
}) {
  const geo = useMemo(
    () =>
      wallWithHoles(
        span,
        height,
        depth,
        holes.map((h) => [h.u0 + span / 2, h.u1 + span / 2, h.y0 - y0, h.y1 - y0]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [span, height, depth, y0, JSON.stringify(holes.map((h) => [h.u0, h.u1, h.y0, h.y1]))],
  )
  return <mesh geometry={geo} material={material} position={[-span / 2, y0, n0]} castShadow receiveShadow />
}

/* ------------------------------------------------------------------ */
/* Windows, sliders, fixed glazing and the entrance door               */
/* ------------------------------------------------------------------ */
function OpeningFrame({ op, ext, int, picture, depth }: { op: LocalOpening; ext: ExteriorMats; int: InteriorMats; picture: number; depth: number }) {
  const { u0, u1, y0, y1, o } = op
  const w = u1 - u0
  const h = y1 - y0
  const cu = (u0 + u1) / 2
  const cy = (y0 + y1) / 2
  const fm = ext.windowFrame
  const nC = o.kind === 'door' ? DOOR_N : WINDOW_N
  const fd = 0.07
  const doorRef = useRef<THREE.Group>(null)
  const mode = useConfig((s) => s.mode)

  useFrame((_, dt) => {
    if (!doorRef.current) return
    const target = mode === 'walkthrough' ? -1.45 : 0
    doorRef.current.rotation.y = THREE.MathUtils.damp(doorRef.current.rotation.y, target, 3, dt)
  })

  // deep reveals: façade-coloured outside the frame, plastered inside
  const outD = -nC
  const inD = depth + nC
  const reveal = (
    <group>
      <Box s={[w, 0.02, outD]} p={[cu, y1 + 0.01, -outD / 2]} m={ext.reveal} />
      <Box s={[0.02, h, outD]} p={[u0 - 0.01, cy, -outD / 2]} m={ext.reveal} />
      <Box s={[0.02, h, outD]} p={[u1 + 0.01, cy, -outD / 2]} m={ext.reveal} />
      <Box s={[w, 0.02, inD]} p={[cu, y1 + 0.01, nC - inD / 2]} m={int.wall} />
      <Box s={[0.02, h, inD]} p={[u0 - 0.01, cy, nC - inD / 2]} m={int.wall} />
      <Box s={[0.02, h, inD]} p={[u1 + 0.01, cy, nC - inD / 2]} m={int.wall} />
      {o.sill > 0.05 && <Box s={[w, 0.02, inD]} p={[cu, y0 - 0.01, nC - inD / 2]} m={int.wall} />}
      {o.sill <= 0.05 && <Box s={[w, 0.02, depth]} p={[cu, y0 - 0.01, -depth / 2]} m={ext.windowFrame} />}
    </group>
  )

  // protruding box frame around the opening
  const pm = ext.style.id === 'charred' ? ext.reveal : ext.windowFrame
  const pf =
    picture > 0 ? (
      <group>
        <Box s={[w + 0.16, 0.08, picture + outD]} p={[cu, y1 + 0.04, (picture - outD) / 2]} m={pm} />
        <Box s={[0.08, h + (o.sill > 0.05 ? 0.16 : 0.08), picture + outD]} p={[u0 - 0.04, cy + (o.sill > 0.05 ? 0 : 0.04), (picture - outD) / 2]} m={pm} />
        <Box s={[0.08, h + (o.sill > 0.05 ? 0.16 : 0.08), picture + outD]} p={[u1 + 0.04, cy + (o.sill > 0.05 ? 0 : 0.04), (picture - outD) / 2]} m={pm} />
        {o.sill > 0.05 && <Box s={[w + 0.16, 0.08, picture + outD]} p={[cu, y0 - 0.04, (picture - outD) / 2]} m={pm} />}
      </group>
    ) : null

  const outerFrame = (
    <group>
      <Box s={[w, PROFILE, fd]} p={[cu, y1 - PROFILE / 2, nC]} m={fm} />
      <Box s={[w, PROFILE, fd]} p={[cu, y0 + PROFILE / 2, nC]} m={fm} />
      <Box s={[PROFILE, h, fd]} p={[u0 + PROFILE / 2, cy, nC]} m={fm} />
      <Box s={[PROFILE, h, fd]} p={[u1 - PROFILE / 2, cy, nC]} m={fm} />
    </group>
  )

  if (o.kind === 'door') {
    const leafW = w - 0.08
    const leafH = h - 0.05
    return (
      <group>
        {reveal}
        {pf}
        <Box s={[w, 0.05, fd]} p={[cu, y1 - 0.025, nC]} m={fm} />
        <Box s={[0.04, h, fd]} p={[u0 + 0.02, cy, nC]} m={fm} />
        <Box s={[0.04, h, fd]} p={[u1 - 0.02, cy, nC]} m={fm} />
        {/* leaf hinged on u0, swings outward */}
        <group ref={doorRef} position={[u0 + 0.04, y0, nC + 0.03]}>
          <Box s={[leafW, leafH, 0.05]} p={[leafW / 2, leafH / 2, 0]} m={ext.door} />
          <Box s={[0.12, leafH * 0.72, 0.052]} p={[0.16, leafH * 0.52, 0]} m={shared.glass} cast={false} />
          <Box s={[0.025, 0.9, 0.025]} p={[leafW - 0.1, 1.05, 0.07]} m={shared.steel} />
          <Box s={[0.02, 0.02, 0.05]} p={[leafW - 0.1, 0.65, 0.045]} m={shared.steel} />
          <Box s={[0.02, 0.02, 0.05]} p={[leafW - 0.1, 1.45, 0.045]} m={shared.steel} />
        </group>
      </group>
    )
  }

  if (o.kind === 'slider') {
    const half = w / 2
    return (
      <group>
        {reveal}
        {pf}
        {outerFrame}
        {[0, 1].map((i) => {
          const su = u0 + PROFILE + (i === 0 ? (half - PROFILE) / 2 : half + (half - PROFILE) / 2 - 0.02)
          const sw = half - PROFILE + 0.03
          const n = nC + (i === 0 ? 0.02 : -0.02)
          const sh = h - 2 * PROFILE
          return (
            <group key={i} position={[su, y0 + PROFILE + sh / 2, n]}>
              <Box s={[sw, sh, 0.012]} m={shared.glass} cast={false} />
              <Box s={[sw, 0.045, 0.04]} p={[0, sh / 2 - 0.022, 0]} m={fm} />
              <Box s={[sw, 0.045, 0.04]} p={[0, -sh / 2 + 0.022, 0]} m={fm} />
              <Box s={[0.05, sh, 0.04]} p={[-sw / 2 + 0.025, 0, 0]} m={fm} />
              <Box s={[0.05, sh, 0.04]} p={[sw / 2 - 0.025, 0, 0]} m={fm} />
            </group>
          )
        })}
      </group>
    )
  }

  const isTall = o.kind === 'fixed' && w > 1.4
  return (
    <group>
      {reveal}
      {pf}
      {outerFrame}
      <Box s={[w - 2 * PROFILE, h - 2 * PROFILE, 0.012]} p={[cu, cy, nC]} m={shared.glass} cast={false} />
      {isTall && <Box s={[0.05, h - 2 * PROFILE, 0.06]} p={[cu, cy, nC]} m={fm} />}
      {o.kind === 'window' && w > 1.3 && <Box s={[0.05, h - 2 * PROFILE, 0.06]} p={[u0 + w * 0.62, cy, nC]} m={fm} />}
      {/* sloped exterior sill across the insulation */}
      {o.sill > 0.05 && <Box s={[w + 0.06, 0.02, outD + 0.05]} p={[cu, y0 - 0.01, (0.05 - outD) / 2]} m={ext.windowFrame} />}
      {/* interior sill board */}
      {o.sill > 0.3 && <Box s={[w + 0.06, 0.025, inD + 0.03]} p={[cu, y0 - 0.0125, nC - (inD + 0.03) / 2]} m={int.wood} />}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Façade accent panels                                                */
/* ------------------------------------------------------------------ */
function AccentPanel({ ops, u0, u1, y0, y1, material }: { ops: LocalOpening[]; u0: number; u1: number; y0: number; y1: number; material: THREE.Material }) {
  const geo = useMemo(() => {
    const w = u1 - u0
    const holes = ops
      .filter((o) => o.u1 > u0 && o.u0 < u1)
      .map((o) => [o.u0 - u0 - 0.09, o.u1 - u0 + 0.09, o.y0 - y0 - 0.09, o.y1 - y0 + 0.09] as [number, number, number, number])
    return wallWithHoles(w, y1 - y0, 0.025, holes)
  }, [ops, u0, u1, y0, y1])
  return <mesh geometry={geo} material={material} position={[u0, y0, 0.002]} castShadow receiveShadow />
}

/* ------------------------------------------------------------------ */
/* One façade                                                          */
/* ------------------------------------------------------------------ */
function Facade({ side, layout }: { side: Side; layout: LayoutDef }) {
  const ext = useExteriorMats()
  const int = useInteriorMats()
  const f = SIDES[side]
  const ops = useMemo(() => localOpenings(layout.openings, side), [layout, side])
  const isLong = side === 'front' || side === 'back'
  const innerSpan = isLong ? INTERIOR.length : INTERIOR.width
  const depth = wallDepth(side)
  const skinMat = isLong ? ext.longSkin : ext.endSkin
  const s = ext.style
  const top = ROOF_Y
  const bottom = FACADE_BOTTOM + 0.22

  const picture = (o: LocalOpening) => {
    if (o.o.kind === 'door') return 0
    return o.o.kind === 'slider' || o.o.kind === 'fixed' ? s.boxFrames.picture : s.boxFrames.window
  }

  let accent: JSX.Element | null = null
  const e = layout.entranceX
  if ((s.accent === 'timber' || s.accent === 'oak') && side === 'front') {
    accent = <AccentPanel ops={ops} u0={e - 1.05} u1={e + 1.05} y0={bottom} y1={top - 0.1} material={ext.accent} />
  }
  if (s.accent === 'timber' && side === 'right') {
    accent = <AccentPanel ops={ops} u0={-HALF_W + 0.05} u1={HALF_W - 0.05} y0={bottom} y1={top - 0.1} material={ext.accent} />
  }
  if (s.accent === 'stone' && side === 'left') {
    accent = <AccentPanel ops={ops} u0={-HALF_W + 0.05} u1={HALF_W - 0.05} y0={bottom} y1={top - 0.1} material={ext.accent} />
  }
  if (s.accent === 'stone' && side === 'front') {
    accent = <AccentPanel ops={ops} u0={e - 1.35} u1={e - 0.6} y0={bottom} y1={top - 0.1} material={ext.accent} />
  }

  return (
    <group position={f.position} rotation-y={f.rotationY}>
      <WallLayer span={f.span} y0={FACADE_BOTTOM} height={top - FACADE_BOTTOM} n0={-FACADE} depth={FACADE} holes={ops} material={skinMat} />
      <WallLayer span={innerSpan} y0={FLOOR_Y} height={CEIL_Y - FLOOR_Y} n0={-depth} depth={TL} holes={ops} material={int.wall} />
      {/* plinth band protecting the bottom of the insulation */}
      <Box s={[f.span + 0.002, 0.22, FACADE + 0.012]} p={[0, FACADE_BOTTOM + 0.11, -FACADE / 2 + 0.006]} m={ext.base} />
      {ops.map((o, i) => (
        <OpeningFrame key={i} op={o} ext={ext} int={int} picture={picture(o)} depth={depth} />
      ))}
      {accent}
    </group>
  )
}

/* Corner trims on board façades */
function CornerTrims() {
  const ext = useExteriorMats()
  if (!ext.style.cornerTrim) return null
  const h = ROOF_Y - FACADE_BOTTOM - 0.22
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}${sz}`} s={[0.07, h, 0.07]} p={[sx * (HALF_L - 0.03), FACADE_BOTTOM + 0.22 + h / 2, sz * (HALF_W - 0.03)]} m={ext.trim} />
        )),
      )}
    </group>
  )
}

/* Concrete piers under the (hidden) container */
function Piers() {
  const xs = [-HALF_L + 0.6, -2, 2, HALF_L - 0.6]
  return (
    <group>
      {xs.map((x) =>
        [-1, 1].map((sz) => <Box key={`${x}${sz}`} s={[0.45, BASE_Y, 0.45]} p={[x, BASE_Y / 2, sz * (HALF_W - 0.5)]} m={shared.plinth} />),
      )}
    </group>
  )
}

/* Floor & wet-room finishes */
function Floors({ layout }: { layout: LayoutDef }) {
  const int = useInteriorMats()
  return (
    <group>
      <Box s={[INTERIOR.length, 0.03, INTERIOR.width]} p={[0, FLOOR_Y - 0.015, 0]} m={int.floor} cast={false} />
      {layout.rooms
        .filter((r) => r.wet)
        .map((r) => (
          <Box
            key={r.id}
            s={[r.x[1] - r.x[0], 0.012, r.z[1] - r.z[0]]}
            p={[(r.x[0] + r.x[1]) / 2, FLOOR_Y - 0.004, (r.z[0] + r.z[1]) / 2]}
            m={int.bathFloor}
            cast={false}
          />
        ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Roof (insulated, flashing, optional PV) + ceiling                   */
/* Lifts away in dollhouse / plan views.                               */
/* ------------------------------------------------------------------ */
function RoofAssembly({ layout }: { layout: LayoutDef }) {
  const ext = useExteriorMats()
  const int = useInteriorMats()
  const mode = useConfig((s) => s.mode)
  const solar = useConfig((s) => s.solar)
  const group = useRef<THREE.Group>(null)
  const ceiling = useRef<THREE.Group>(null)
  const t = useRef(0)

  useFrame((_, dt) => {
    const target = mode === 'dollhouse' || mode === 'topdown' ? 1 : 0
    t.current = THREE.MathUtils.damp(t.current, target, mode === 'topdown' ? 6 : 2.6, dt)
    if (Math.abs(t.current - target) < 0.001) t.current = target
    const g = group.current
    if (!g) return
    g.position.y = t.current * 3.2
    g.visible = t.current < 0.55
    if (ceiling.current) ceiling.current.visible = t.current < 0.04
  })

  const st = int.style
  const L = EXTERIOR.length
  const W = EXTERIOR.width
  const eh = ROOF_TOP - ROOF_Y + 0.12
  return (
    <group ref={group}>
      {/* insulated roof deck + membrane */}
      <Box s={[L - 0.04, ROOF_INSULATION, W - 0.04]} p={[0, ROOF_Y - ROOF_INSULATION / 2, 0]} m={ext.roof} />
      {/* roof-edge flashing */}
      {[-1, 1].map((sz) => (
        <Box key={`z${sz}`} s={[L + 0.03, eh, 0.06]} p={[0, ROOF_TOP - eh / 2, sz * (HALF_W - 0.015)]} m={ext.roofEdge} />
      ))}
      {[-1, 1].map((sx) => (
        <Box key={`x${sx}`} s={[0.06, eh, W + 0.03]} p={[sx * (HALF_L - 0.015), ROOF_TOP - eh / 2, 0]} m={ext.roofEdge} />
      ))}
      {solar && <Solar />}
      <group ref={ceiling}>
        <Box s={[INTERIOR.length, 0.02, INTERIOR.width]} p={[0, CEIL_Y + 0.01, 0]} m={int.ceiling} cast={false} />
        {layout.lights.map(([x, z], i) => (
          <group key={i} position={[x, CEIL_Y, z]}>
            <Cyl r={0.045} h={0.012} p={[0, -0.006, 0]} m={int.glow} seg={20} cast={false} />
            <Cyl r={0.055} h={0.008} p={[0, -0.003, 0]} m={int.metal} seg={20} cast={false} />
          </group>
        ))}
        {st.ledStrips &&
          [-1, 1].map((sz) => (
            <Box key={sz} s={[INTERIOR.length - 0.2, 0.012, 0.02]} p={[0, CEIL_Y - 0.035, sz * (INTERIOR.z1 - 0.06)]} m={int.led} cast={false} />
          ))}
        {st.ledStrips &&
          [-1, 1].map((sz) => (
            <Box key={`c${sz}`} s={[INTERIOR.length - 0.2, 0.06, 0.012]} p={[0, CEIL_Y - 0.06, sz * (INTERIOR.z1 - 0.075)]} m={int.ceiling} cast={false} />
          ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Section caps — the wall build-up drawn at the cut height:           */
/* façade · 200 mm insulation · container steel · lining              */
/* ------------------------------------------------------------------ */
export function ShellCaps({ layout }: { layout: LayoutDef }) {
  const pieces = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material }[] = []
    const cutRel = 1.35
    for (const side of SIDE_ORDER) {
      const f = SIDES[side]
      const isLong = side === 'front' || side === 'back'
      const depth = wallDepth(side)
      const steel = STEEL + (isLong ? 0 : WALL_END - WALL)
      const layers: [number, number, THREE.Material][] = [
        [0, FACADE, shared.capFacade],
        [FACADE, FACADE + INSULATION, shared.capInsulation],
        [FACADE + INSULATION, FACADE + INSULATION + steel, shared.capSteel],
        [FACADE + INSULATION + steel, depth, shared.capLining],
      ]
      const ops = localOpenings(layout.openings, side).filter((o) => o.o.sill < cutRel && o.o.head > cutRel)
      // each layer stops where the perpendicular wall's same layer begins (mitred corners)
      for (const [a, b, m] of layers) {
        const span = f.span / 2 - a
        const solid = subtractRanges(-span, span, ops.map((o) => [o.u0, o.u1]))
        for (const [u0, u1] of solid) {
          const u = (u0 + u1) / 2
          const len = u1 - u0
          const n = -(a + b) / 2
          const c = Math.cos(f.rotationY)
          const sn = Math.sin(f.rotationY)
          const x = f.position[0] + u * c + n * sn
          const z = f.position[2] - u * sn + n * c
          out.push({ p: [x, 0, z], s: isLong ? [len, 0.01, b - a] : [b - a, 0.01, len], m })
        }
      }
    }
    for (const p of layout.partitions) {
      const alongX = p.a[1] === p.b[1]
      const a = alongX ? Math.min(p.a[0], p.b[0]) : Math.min(p.a[1], p.b[1])
      const b = alongX ? Math.max(p.a[0], p.b[0]) : Math.max(p.a[1], p.b[1])
      const solid = subtractRanges(a, b, (p.openings ?? []).map((o) => [o.from, o.to]))
      for (const [s0, s1] of solid) {
        const m = (s0 + s1) / 2
        const len = s1 - s0
        out.push(alongX ? { p: [m, 0, p.a[1]], s: [len, 0.01, 0.08], m: shared.poche } : { p: [p.a[0], 0, m], s: [0.08, 0.01, len], m: shared.poche })
      }
    }
    return out
  }, [layout])
  return (
    <group>
      {pieces.map((pc, i) => (
        <Box key={i} s={pc.s} p={pc.p} m={pc.m} cast={false} receive={false} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
export function Shell({ layout }: { layout: LayoutDef }) {
  return (
    <group>
      {SIDE_ORDER.map((s) => (
        <Facade key={s} side={s} layout={layout} />
      ))}
      <CornerTrims />
      <Piers />
      <Floors layout={layout} />
      <RoofAssembly layout={layout} />
    </group>
  )
}

export const WALL_LAYERS = { FACADE, INSULATION, STEEL, LINING }
