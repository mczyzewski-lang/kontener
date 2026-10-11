import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { FurnitureItem } from '../../config/types'
import { shared, useInteriorMats } from '../../lib/materials'
import { useConfig } from '../../store'
import { Box, Cyl, Soft } from '../primitives'
import { Books, Vase } from './common'

/* Local frame: width along X, length along Z, headboard at −Z. */

function Bedding({ w, len, y, pillows = 2 }: { w: number; len: number; y: number; pillows?: number }) {
  const m = useInteriorMats()
  return (
    <group position={[0, y, 0]}>
      {/* mattress */}
      <Soft s={[w - 0.06, 0.2, len - 0.04]} p={[0, 0.1, 0]} m={shared.white} r={0.05} />
      {/* duvet draped over the sides */}
      <Soft s={[w + 0.02, 0.24, len * 0.7]} p={[0, 0.1, len * 0.15 + 0.01]} m={m.bedding} r={0.06} />
      {/* folded throw */}
      <Soft s={[w + 0.04, 0.035, 0.42]} p={[0, 0.235, len / 2 - 0.32]} m={m.throwMat} r={0.015} />
      {/* pillows */}
      {Array.from({ length: pillows }).map((_, i) => {
        const x = pillows === 1 ? 0 : (i - (pillows - 1) / 2) * (w / pillows)
        return <Soft key={i} s={[Math.min(0.62, w / pillows - 0.06), 0.15, 0.36]} p={[x, 0.27, -len / 2 + 0.26]} rotation={[-0.35, 0, 0]} m={m.bedding} r={0.06} />
      })}
      {w > 1.2 && <Soft s={[0.45, 0.14, 0.12]} p={[0, 0.26, -len / 2 + 0.5]} rotation={[-0.2, 0, 0]} m={m.accentFabric} r={0.05} />}
    </group>
  )
}

export function Bed({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 1.5
  const d = item.d ?? 2.1
  const st = m.style
  const headH = 1.05
  const head = st.id === 'luxury' ? m.accentFabric : m.wood
  return (
    <group>
      {/* feature wall panelling behind the bed */}
      {st.paneling !== 'none' && <Box s={[w + 0.66, 2.25, 0.02]} p={[0, 1.125, -d / 2 + 0.01]} m={m.paneling} />}
      {/* floating plinth + frame */}
      <Box s={[w - 0.3, 0.1, d - 0.4]} p={[0, 0.05, 0.05]} m={shared.black} />
      <Box s={[w, 0.2, d - 0.08]} p={[0, 0.2, 0.04]} m={st.id === 'luxury' ? m.accentFabric : m.wood} />
      <Bedding w={w - 0.06} len={d - 0.14} y={0.3} pillows={w > 1.2 ? 2 : 1} />
      {/* headboard */}
      {st.id === 'luxury' ? (
        <group>
          {[-1, 0, 1].map((i) => (
            <Soft key={i} s={[w / 3 - 0.01, headH - 0.1, 0.09]} p={[(i * w) / 3, 0.35 + (headH - 0.1) / 2, -d / 2 + 0.07]} m={head} r={0.04} />
          ))}
        </group>
      ) : (
        <Box s={[w + 0.04, headH, 0.05]} p={[0, headH / 2 + 0.1, -d / 2 + 0.045]} m={head} />
      )}
      {item.nightstands &&
        [-1, 1].map((sx) => (
          <group key={sx} position={[sx * (w / 2 + 0.16), 0, -d / 2 + 0.22]}>
            <Box s={[0.28, 0.035, 0.3]} p={[0, 0.52, 0]} m={m.woodAccent} />
            {sx < 0 ? (
              <group position={[0, 0.5375, 0]}>
                <Cyl r={0.05} h={0.22} p={[0, 0.11, -0.03]} m={shared.stoneware} seg={16} />
                <mesh position={[0, 0.3, -0.03]} material={m.lampShade}>
                  <cylinderGeometry args={[0.07, 0.09, 0.14, 24, 1, true]} />
                </mesh>
                <Cyl r={0.03} h={0.03} p={[0, 0.27, -0.03]} m={m.glow} seg={12} cast={false} />
              </group>
            ) : (
              <group position={[-0.08, 0.5375, -0.05]}>
                <Books length={0.12} seed={4} maxH={0.2} />
                <Vase p={[0.1, 0, 0.06]} h={0.12} r={0.035} dark />
              </group>
            )}
          </group>
        ))}
    </group>
  )
}

/* Bunk bed: length along X, back at −Z, ladder at +X front */
export function BunkBed({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const L = item.w ?? 2.06
  const D = item.d ?? 0.96
  const H = item.h ?? 1.75
  const post = 0.06
  const frame = m.wood
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[post, H, post]} p={[sx * (L / 2 - post / 2), H / 2, sz * (D / 2 - post / 2)]} m={frame} />),
      )}
      {/* lower bed on storage drawers */}
      <Box s={[L - 0.02, 0.3, D - 0.04]} p={[0, 0.17, 0]} m={m.carcass} />
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <Box s={[L / 3 - 0.03, 0.26, 0.02]} p={[-L / 3 + (i * L) / 3, 0.17, D / 2 - 0.02]} m={m.front} />
          <Box s={[0.12, 0.015, 0.02]} p={[-L / 3 + (i * L) / 3, 0.26, D / 2 - 0.005]} m={m.metal} />
        </group>
      ))}
      <group rotation-y={Math.PI / 2} position={[0, 0.32, 0]}>
        <BunkBedding w={D - 0.1} len={L - 0.12} />
      </group>
      {/* upper bunk */}
      <Box s={[L - 0.02, 0.05, D - 0.04]} p={[0, 1.18, 0]} m={frame} />
      <group rotation-y={Math.PI / 2} position={[0, 1.205, 0]}>
        <BunkBedding w={D - 0.1} len={L - 0.12} accent />
      </group>
      {/* guard rails */}
      {[1.5, 1.68].map((y) => (
        <group key={y}>
          <Box s={[L * 0.62, 0.05, 0.03]} p={[-L * 0.19, y, D / 2 - 0.02]} m={frame} />
          <Box s={[L, 0.05, 0.03]} p={[0, y, -D / 2 + 0.02]} m={frame} />
          <Box s={[0.03, 0.05, D]} p={[-L / 2 + 0.02, y, 0]} m={frame} />
        </group>
      ))}
      {/* ladder */}
      <group position={[L / 2 - 0.3, 0, D / 2 + 0.02]}>
        {[-0.18, 0.18].map((x) => (
          <Box key={x} s={[0.04, 1.75, 0.04]} p={[x, 0.875, 0]} m={frame} />
        ))}
        {[0.5, 0.8, 1.1, 1.4].map((y) => (
          <Cyl key={y} r={0.016} h={0.36} p={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} m={m.metal} seg={10} />
        ))}
      </group>
      {/* reading light + shelf */}
      <Box s={[0.5, 0.025, 0.14]} p={[-L / 2 + 0.4, 0.95, -D / 2 + 0.09]} m={m.woodAccent} />
      <group position={[-L / 2 + 0.2, 0.9625, -D / 2 + 0.07]}>
        <Books length={0.2} seed={7} maxH={0.18} />
      </group>
    </group>
  )
}

function BunkBedding({ w, len, accent = false }: { w: number; len: number; accent?: boolean }) {
  const m = useInteriorMats()
  return (
    <group>
      <Soft s={[w, 0.13, len]} p={[0, 0.065, 0]} m={shared.white} r={0.04} />
      <Soft s={[w + 0.02, 0.16, len * 0.68]} p={[0, 0.07, len * 0.16]} m={accent ? m.throwMat : m.bedding} r={0.05} />
      <Soft s={[w * 0.75, 0.12, 0.32]} p={[0, 0.18, -len / 2 + 0.24]} rotation={[-0.3, 0, 0]} m={m.bedding} r={0.05} />
    </group>
  )
}

/* Murphy bed wall: width along X, faces +Z. Bed panel folds down along +Z. */
export function MurphyBed({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const open = useConfig((s) => s.murphyOpen)
  const W = item.w ?? 2.27
  const D = item.d ?? 0.45
  const H = item.h ?? 2.3
  const bay = 1.58
  const tower = (W - bay) / 2
  const pivot = useRef<THREE.Group>(null)
  const legs = useRef<THREE.Group>(null)
  const bedW = bay - 0.06
  const bedL = 2.0

  useFrame((_, dt) => {
    if (!pivot.current) return
    const target = open ? 0 : -Math.PI / 2
    pivot.current.rotation.x = THREE.MathUtils.damp(pivot.current.rotation.x, target, 3.2, dt)
    if (legs.current) legs.current.rotation.x = THREE.MathUtils.damp(legs.current.rotation.x, open ? 0 : Math.PI / 2, 3.2, dt)
  })

  return (
    <group>
      {/* side towers with shelving */}
      {[-1, 1].map((sx) => {
        const cx = sx * (bay / 2 + tower / 2)
        return (
          <group key={sx}>
            <Box s={[tower, H, D]} p={[cx, H / 2, 0]} m={m.carcass} />
            {/* open shelving niche */}
            <Box s={[tower - 0.04, 1.3, 0.02]} p={[cx, 1.25, D / 2 - 0.3]} m={m.woodAccent} cast={false} />
            {[0.6, 1.05, 1.5, 1.9].map((y) => (
              <Box key={y} s={[tower - 0.03, 0.025, D - 0.06]} p={[cx, y, 0.02]} m={m.wood} />
            ))}
            <group position={[cx - tower / 2 + 0.03, 1.0625, 0]}>
              <Books length={tower - 0.06} seed={sx + 3} maxH={0.24} />
            </group>
            <group position={[cx - tower / 2 + 0.03, 1.5125, 0]}>
              <Books length={(tower - 0.06) * 0.6} seed={sx + 9} maxH={0.22} />
            </group>
            <Vase p={[cx, 1.9125, 0]} h={0.16} r={0.05} dark={sx > 0} />
            {/* lower doors */}
            <Box s={[tower - 0.01, 0.5, 0.02]} p={[cx, 0.3, D / 2]} m={m.front} />
            {m.style.ledStrips && <Box s={[tower - 0.06, 0.01, 0.01]} p={[cx, 1.885, D / 2 - 0.06]} m={m.led} cast={false} />}
          </group>
        )
      })}
      {/* bridge cabinet + back panel of the bay */}
      <Box s={[bay, H - 2.12, D]} p={[0, 2.12 + (H - 2.12) / 2, 0]} m={m.front} />
      <Box s={[bay, 2.12, 0.02]} p={[0, 1.06, -D / 2 + 0.01]} m={m.style.paneling === 'none' ? m.carcass : m.paneling} />
      {m.style.ledStrips && <Box s={[bay - 0.1, 0.01, 0.015]} p={[0, 2.105, D / 2 - 0.05]} m={m.led} cast={false} />}
      {/* reading lights */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (bay / 2 - 0.12), 1.15, -D / 2 + 0.06]}>
          <Cyl r={0.03} h={0.1} rotation={[Math.PI / 2, 0, 0]} p={[0, 0, 0.05]} m={m.metal} seg={12} />
          <Cyl r={0.022} h={0.005} rotation={[Math.PI / 2, 0, 0]} p={[0, 0, 0.1]} m={m.glow} seg={12} cast={false} />
        </group>
      ))}
      {/* folding bed panel */}
      <group ref={pivot} position={[0, 0.2, D / 2 - 0.02]}>
        {/* bed box — its underside becomes the cabinet front when closed */}
        <Box s={[bedW, 0.07, bedL]} p={[0, 0.035, bedL / 2]} m={m.front} />
        <Box s={[bedW, 0.05, 0.02]} p={[0, 0.07, bedL - 0.01]} m={m.front} />
        {/* handle strip on the visible face when closed */}
        <Box s={[0.5, 0.012, 0.03]} p={[0, -0.005, bedL - 0.15]} m={m.metal} />
        <group position={[0, 0.07, bedL / 2]}>
          <Bedding w={bedW - 0.04} len={bedL - 0.06} y={0} pillows={2} />
        </group>
        {/* fold-down legs */}
        <group ref={legs} position={[0, 0, bedL - 0.12]}>
          {[-1, 1].map((sx) => (
            <Box key={sx} s={[0.04, 0.2, 0.04]} p={[sx * (bedW / 2 - 0.1), -0.1, 0]} m={m.metal} />
          ))}
        </group>
      </group>
    </group>
  )
}
