import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  BASE_Y,
  CEIL_Y,
  EXTERIOR,
  FLOOR_Y,
  HALF_L,
  HALF_W,
  INTERIOR,
  ROOF_Y,
  WALL,
} from '../../config/dimensions'
import type { LayoutDef, Side } from '../../config/types'
import { subtractRanges, wallWithHoles } from '../../lib/geometry'
import { shared, useExteriorMats, useInteriorMats, type ExteriorMats } from '../../lib/materials'
import { useConfig } from '../../store'
import { Box, Cyl } from '../primitives'
import { localOpenings, SIDE_ORDER, SIDES, type LocalOpening } from './sides'

const TS = 0.035 // outer skin thickness
const TL = 0.025 // inner lining thickness
const PROFILE = 0.055 // window frame profile width

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
  receiveOnly = false,
}: {
  span: number
  y0: number
  height: number
  n0: number
  depth: number
  holes: LocalOpening[]
  material: THREE.Material
  receiveOnly?: boolean
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
  return <mesh geometry={geo} material={material} position={[-span / 2, y0, n0]} castShadow={!receiveOnly} receiveShadow />
}

/* ------------------------------------------------------------------ */
/* Windows, sliders, fixed glazing and the entrance door               */
/* ------------------------------------------------------------------ */
function OpeningFrame({ op, ext, interiorWood, picture }: { op: LocalOpening; ext: ExteriorMats; interiorWood: THREE.Material; picture: number }) {
  const { u0, u1, y0, y1, o } = op
  const w = u1 - u0
  const h = y1 - y0
  const cu = (u0 + u1) / 2
  const cy = (y0 + y1) / 2
  const fm = ext.windowFrame
  const nC = -0.075
  const fd = 0.07
  const doorRef = useRef<THREE.Group>(null)
  const mode = useConfig((s) => s.mode)

  useFrame((_, dt) => {
    if (!doorRef.current) return
    const target = mode === 'walkthrough' ? -1.45 : 0
    doorRef.current.rotation.y = THREE.MathUtils.damp(doorRef.current.rotation.y, target, 3, dt)
  })

  const reveal = (
    <group>
      <Box s={[w, 0.02, WALL]} p={[cu, y1 + 0.01, -WALL / 2]} m={ext.reveal} />
      <Box s={[0.02, h, WALL]} p={[u0 - 0.01, cy, -WALL / 2]} m={ext.reveal} />
      <Box s={[0.02, h, WALL]} p={[u1 + 0.01, cy, -WALL / 2]} m={ext.reveal} />
      {o.sill > 0.05 && <Box s={[w, 0.02, WALL]} p={[cu, y0 - 0.01, -WALL / 2]} m={ext.reveal} />}
    </group>
  )

  // protruding "picture frame" box around large openings
  const pf =
    picture > 0 ? (
      <group>
        <Box s={[w + 0.16, 0.08, picture]} p={[cu, y1 + 0.04, picture / 2]} m={ext.canopy === ext.frame ? ext.frame : ext.windowFrame} />
        <Box s={[0.08, h + (o.sill > 0.05 ? 0.16 : 0.08), picture]} p={[u0 - 0.04, cy + (o.sill > 0.05 ? 0 : 0.04), picture / 2]} m={ext.windowFrame} />
        <Box s={[0.08, h + (o.sill > 0.05 ? 0.16 : 0.08), picture]} p={[u1 + 0.04, cy + (o.sill > 0.05 ? 0 : 0.04), picture / 2]} m={ext.windowFrame} />
        {o.sill > 0.05 && <Box s={[w + 0.16, 0.08, picture]} p={[cu, y0 - 0.04, picture / 2]} m={ext.windowFrame} />}
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
        {/* frame */}
        <Box s={[w, 0.05, fd]} p={[cu, y1 - 0.025, nC]} m={fm} />
        <Box s={[0.04, h, fd]} p={[u0 + 0.02, cy, nC]} m={fm} />
        <Box s={[0.04, h, fd]} p={[u1 - 0.02, cy, nC]} m={fm} />
        {/* leaf hinged on u0, swings outward */}
        <group ref={doorRef} position={[u0 + 0.04, y0, -0.04]}>
          <Box s={[leafW, leafH, 0.05]} p={[leafW / 2, leafH / 2, 0]} m={ext.door} />
          {/* vision slot */}
          <Box s={[0.12, leafH * 0.72, 0.052]} p={[0.16, leafH * 0.52, 0]} m={shared.glass} cast={false} />
          {/* long pull handle */}
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
        {/* two sashes, offset in depth */}
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
        {/* flush threshold */}
        <Box s={[w, 0.015, WALL]} p={[cu, y0 + 0.0075, -WALL / 2]} m={ext.windowFrame} />
      </group>
    )
  }

  // window / fixed
  const isTall = o.kind === 'fixed' && w > 1.4
  return (
    <group>
      {reveal}
      {pf}
      {outerFrame}
      <Box s={[w - 2 * PROFILE, h - 2 * PROFILE, 0.012]} p={[cu, cy, nC]} m={shared.glass} cast={false} />
      {isTall && <Box s={[0.05, h - 2 * PROFILE, 0.06]} p={[cu, cy, nC]} m={fm} />}
      {o.kind === 'window' && w > 1.3 && <Box s={[0.05, h - 2 * PROFILE, 0.06]} p={[u0 + w * 0.62, cy, nC]} m={fm} />}
      {/* exterior sill flashing */}
      {o.sill > 0.3 && <Box s={[w + 0.06, 0.02, 0.07]} p={[cu, y0 - 0.01, 0.02]} m={ext.windowFrame} />}
      {/* interior sill board */}
      {o.sill > 0.3 && <Box s={[w + 0.06, 0.025, 0.09]} p={[cu, y0 - 0.0125, -WALL - 0.005]} m={interiorWood} />}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Façade accent panels (timber / stone)                               */
/* ------------------------------------------------------------------ */
function AccentPanel({ ops, u0, u1, y0, y1, material }: { ops: LocalOpening[]; u0: number; u1: number; y0: number; y1: number; material: THREE.Material }) {
  const geo = useMemo(() => {
    const w = u1 - u0
    const holes = ops
      .filter((o) => o.u1 > u0 && o.u0 < u1)
      .map((o) => [o.u0 - u0 - 0.09, o.u1 - u0 + 0.09, o.y0 - y0 - 0.09, o.y1 - y0 + 0.09] as [number, number, number, number])
    return wallWithHoles(w, y1 - y0, 0.03, holes)
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
  const skinMat = isLong ? ext.longSkin : ext.endSkin
  const s = ext.style

  const picture = (o: LocalOpening) => {
    if (s.id === 'wood') return o.o.kind === 'slider' || o.o.kind === 'fixed' ? 0.2 : 0
    if (s.id === 'black') return o.o.kind === 'door' ? 0 : 0.12
    return o.o.kind === 'slider' || o.o.kind === 'fixed' ? 0.07 : 0
  }

  // style-dependent accents
  let accent: JSX.Element | null = null
  if (s.accent === 'timber' && side === 'front') {
    const e = layout.entranceX
    accent = <AccentPanel ops={ops} u0={e - 1.1} u1={e + 1.1} y0={BASE_Y + 0.17} y1={ROOF_Y - 0.17} material={ext.accent} />
  }
  if (s.accent === 'timber' && side === 'right') {
    accent = <AccentPanel ops={ops} u0={-HALF_W + 0.17} u1={HALF_W - 0.17} y0={BASE_Y + 0.17} y1={ROOF_Y - 0.17} material={ext.accent} />
  }
  if (s.accent === 'stone' && side === 'left') {
    accent = <AccentPanel ops={ops} u0={-HALF_W + 0.17} u1={HALF_W - 0.17} y0={BASE_Y + 0.17} y1={ROOF_Y - 0.17} material={ext.accent} />
  }
  if (s.accent === 'stone' && side === 'front') {
    const e = layout.entranceX
    accent = <AccentPanel ops={ops} u0={e - 1.35} u1={e - 0.6} y0={BASE_Y + 0.17} y1={ROOF_Y - 0.17} material={ext.accent} />
  }

  return (
    <group position={f.position} rotation-y={f.rotationY}>
      <WallLayer span={f.span} y0={BASE_Y} height={EXTERIOR.height} n0={-TS} depth={TS} holes={ops} material={skinMat} />
      <WallLayer span={innerSpan} y0={FLOOR_Y} height={CEIL_Y - FLOOR_Y} n0={-WALL} depth={TL} holes={ops} material={int.wall} />
      {ops.map((o, i) => (
        <OpeningFrame key={i} op={o} ext={ext} interiorWood={int.wood} picture={picture(o)} />
      ))}
      {accent}
      {side === 'left' && ops.length === 0 && s.endFinish === 'corrugated' && <ContainerDoors material={ext.frame} />}
    </group>
  )
}

/** Original cargo-door hardware kept as a feature on the closed end */
function ContainerDoors({ material }: { material: THREE.Material }) {
  const bars = [-0.95, -0.42, 0.42, 0.95]
  const y0 = BASE_Y + 0.2
  const y1 = ROOF_Y - 0.2
  return (
    <group>
      <Box s={[0.012, y1 - y0, 0.012]} p={[0, (y0 + y1) / 2, 0.004]} m={shared.seal} cast={false} />
      {bars.map((u) => (
        <group key={u}>
          <Cyl r={0.017} h={y1 - y0} p={[u, (y0 + y1) / 2, 0.05]} m={material} seg={10} />
          {[y0 + 0.08, y1 - 0.08].map((y) => (
            <Box key={y} s={[0.08, 0.08, 0.06]} p={[u, y, 0.03]} m={material} />
          ))}
          <Box s={[0.05, 0.22, 0.04]} p={[u + (u > 0 ? -0.05 : 0.05), BASE_Y + 1.2, 0.08]} m={material} />
        </group>
      ))}
      {[0.5, 1.4, 2.3].map((y) => (
        <group key={y}>
          <Box s={[0.14, 0.08, 0.05]} p={[-HALF_W + 0.22, BASE_Y + y, 0.03]} m={material} />
          <Box s={[0.14, 0.08, 0.05]} p={[HALF_W - 0.22, BASE_Y + y, 0.03]} m={material} />
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Steel frame: corner posts, rails, castings                          */
/* ------------------------------------------------------------------ */
function SteelFrame() {
  const ext = useExteriorMats()
  const m = ext.frame
  const post = 0.17
  const rail = 0.16
  const H = EXTERIOR.height
  const corners: [number, number][] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]
  return (
    <group>
      {corners.map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <Box s={[post, H, post]} p={[sx * (HALF_L - post / 2 + 0.006), BASE_Y + H / 2, sz * (HALF_W - post / 2 + 0.006)]} m={m} />
          {[BASE_Y + 0.06, ROOF_Y - 0.06].map((y) => (
            <group key={y} position={[sx * (HALF_L - 0.085), y, sz * (HALF_W - 0.075)]}>
              <Box s={[0.178, 0.12, 0.162]} p={[sx * 0.004, 0, sz * 0.004]} m={m} />
              <Box s={[0.07, 0.05, 0.02]} p={[0, 0, sz * 0.087]} m={shared.seal} cast={false} />
              <Box s={[0.02, 0.05, 0.07]} p={[sx * 0.092, 0, 0]} m={shared.seal} cast={false} />
            </group>
          ))}
        </group>
      ))}
      {/* long rails */}
      {[-1, 1].map((sz) => (
        <group key={sz}>
          <Box s={[EXTERIOR.length - 2 * post, rail, 0.06]} p={[0, BASE_Y + rail / 2, sz * (HALF_W - 0.025)]} m={m} />
          <Box s={[EXTERIOR.length - 2 * post, 0.12, 0.06]} p={[0, ROOF_Y - 0.06, sz * (HALF_W - 0.025)]} m={m} />
        </group>
      ))}
      {/* end rails */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Box s={[0.06, 0.2, EXTERIOR.width - 2 * post]} p={[sx * (HALF_L - 0.025), BASE_Y + 0.1, 0]} m={m} />
          <Box s={[0.06, 0.18, EXTERIOR.width - 2 * post]} p={[sx * (HALF_L - 0.025), ROOF_Y - 0.09, 0]} m={m} />
        </group>
      ))}
      {/* base frame / underside */}
      <Box s={[EXTERIOR.length - 0.1, 0.15, EXTERIOR.width - 0.1]} p={[0, BASE_Y + 0.08, 0]} m={shared.steelDark} cast={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Concrete piers                                                       */
/* ------------------------------------------------------------------ */
function Piers() {
  const xs = [-HALF_L + 0.35, -2, 2, HALF_L - 0.35]
  return (
    <group>
      {xs.map((x) =>
        [-1, 1].map((sz) => <Box key={`${x}${sz}`} s={[0.45, BASE_Y + 0.05, 0.45]} p={[x, (BASE_Y - 0.05) / 2, sz * (HALF_W - 0.3)]} m={shared.plinth} />),
      )}
      {/* recessed dark skirt keeps the "floating" look */}
      <Box s={[EXTERIOR.length - 0.6, BASE_Y, EXTERIOR.width - 0.6]} p={[0, BASE_Y / 2, 0]} m={shared.seal} cast={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Floor & wet-room finishes                                           */
/* ------------------------------------------------------------------ */
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
/* Roof + ceiling (lifts away in dollhouse / plan views)               */
/* ------------------------------------------------------------------ */
function RoofAssembly({ layout }: { layout: LayoutDef }) {
  const ext = useExteriorMats()
  const int = useInteriorMats()
  const mode = useConfig((s) => s.mode)
  const group = useRef<THREE.Group>(null)
  const ceiling = useRef<THREE.Group>(null)
  const t = useRef(0)

  useFrame((_, dt) => {
    const target = mode === 'dollhouse' || mode === 'topdown' ? 1 : 0
    t.current = THREE.MathUtils.damp(t.current, target, mode === 'topdown' ? 6 : 2.6, dt)
    if (Math.abs(t.current - target) < 0.001) t.current = target
    const g = group.current
    if (!g) return
    g.position.y = t.current * 2.6
    const op = 1 - THREE.MathUtils.smoothstep(t.current, 0.2, 0.85)
    ;(ext.roof as THREE.MeshStandardMaterial).opacity = op
    g.visible = op > 0.01
    if (ceiling.current) ceiling.current.visible = t.current < 0.04
  })

  const st = int.style
  return (
    <group ref={group}>
      <Box s={[EXTERIOR.length - 0.02, 0.05, EXTERIOR.width - 0.02]} p={[0, ROOF_Y - 0.03, 0]} m={ext.roof} />
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
            <Box
              key={sz}
              s={[INTERIOR.length - 0.2, 0.012, 0.02]}
              p={[0, CEIL_Y - 0.035, sz * (INTERIOR.z1 - 0.06)]}
              m={int.led}
              cast={false}
            />
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
/* Section caps ("poché") — drawn at the cut height                     */
/* ------------------------------------------------------------------ */
export function ShellCaps({ layout }: { layout: LayoutDef }) {
  const pieces = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = []
    const cutRel = 1.35 // must match SECTION_Y - FLOOR_Y
    for (const side of SIDE_ORDER) {
      const f = SIDES[side]
      const ops = localOpenings(layout.openings, side).filter((o) => o.o.sill < cutRel && o.o.head > cutRel)
      const span = f.span
      const solid = subtractRanges(-span / 2, span / 2, ops.map((o) => [o.u0, o.u1]))
      for (const [a, b] of solid) {
        const u = (a + b) / 2
        const len = b - a
        const n = -WALL / 2
        // convert (u, n) to world
        const c = Math.cos(f.rotationY)
        const sn = Math.sin(f.rotationY)
        const x = f.position[0] + u * c + n * sn
        const z = f.position[2] - u * sn + n * c
        const isLong = side === 'front' || side === 'back'
        out.push({ p: [x, 0, z], s: isLong ? [len, 0.01, WALL] : [WALL, 0.01, len] })
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
        out.push(alongX ? { p: [m, 0, p.a[1]], s: [len, 0.01, 0.08] } : { p: [p.a[0], 0, m], s: [0.08, 0.01, len] })
      }
    }
    return out
  }, [layout])
  return (
    <group>
      {pieces.map((pc, i) => (
        <Box key={i} s={pc.s} p={pc.p} m={shared.poche} cast={false} receive={false} />
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
      <SteelFrame />
      <Piers />
      <Floors layout={layout} />
      <RoofAssembly layout={layout} />
    </group>
  )
}

