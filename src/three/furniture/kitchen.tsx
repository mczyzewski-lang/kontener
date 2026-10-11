import type { FurnitureItem, KitchenModule } from '../../config/types'
import { shared, useInteriorMats, type InteriorMats } from '../../lib/materials'
import { Box, Cyl } from '../primitives'
import { Upper, Vase } from './common'

/* Linear kitchen run: length along X, back against −Z, origin on the floor. */

const COUNTER = 0.9
const TALL = 2.2
const PLINTH = 0.1

function Handle({ m, p, w, vertical = false }: { m: InteriorMats; p: [number, number, number]; w: number; vertical?: boolean }) {
  const st = m.style.id
  if (st === 'japandi') {
    // routed finger-pull groove
    return <Box s={vertical ? [0.012, w, 0.006] : [w, 0.012, 0.006]} p={p} m={shared.black} cast={false} />
  }
  const len = st === 'luxury' ? w * 0.8 : w * 0.6
  return <Box s={vertical ? [0.012, len, 0.025] : [len, 0.012, 0.025]} p={[p[0], p[1], p[2] + 0.012]} m={m.metal} />
}

function Module({ kind, x, w, d, m }: { kind: KitchenModule; x: number; w: number; d: number; m: InteriorMats }) {
  const fz = d / 2 + 0.01
  const gap = 0.004
  if (kind === 'fridge' || kind === 'pantry') {
    return (
      <group position={[x, 0, 0]}>
        <Box s={[w, TALL - PLINTH, d]} p={[0, PLINTH + (TALL - PLINTH) / 2, 0]} m={m.carcass} />
        <Box s={[w - gap, 1.25, 0.02]} p={[0, PLINTH + 0.625, fz]} m={m.front} />
        <Box s={[w - gap, TALL - PLINTH - 1.26, 0.02]} p={[0, PLINTH + 1.255 + (TALL - PLINTH - 1.26) / 2, fz]} m={m.front} />
        <Handle m={m} p={[w / 2 - 0.05, PLINTH + 1.05, fz + 0.011]} w={0.35} vertical />
        <Handle m={m} p={[w / 2 - 0.05, PLINTH + 1.45, fz + 0.011]} w={0.25} vertical />
      </group>
    )
  }
  const baseH = COUNTER - PLINTH - 0.04
  const base = <Box s={[w, baseH, d - 0.02]} p={[0, PLINTH + baseH / 2, -0.01]} m={m.carcass} />
  if (kind === 'drawers') {
    const hs = [0.18, 0.27, 0.29]
    let y = PLINTH
    return (
      <group position={[x, 0, 0]}>
        {base}
        {hs.map((h, i) => {
          const cy = y + h / 2
          y += h + gap
          return (
            <group key={i}>
              <Box s={[w - gap, h - gap, 0.02]} p={[0, cy, fz]} m={m.front} />
              <Handle m={m} p={[0, cy + h / 2 - 0.04, fz + 0.011]} w={w - 0.12} />
            </group>
          )
        }).reverse()}
      </group>
    )
  }
  if (kind === 'hob') {
    return (
      <group position={[x, 0, 0]}>
        {base}
        {/* built-in oven */}
        <Box s={[w - 0.02, 0.58, 0.02]} p={[0, PLINTH + 0.1 + 0.29, fz]} m={shared.blackGlass} />
        <Box s={[w - 0.14, 0.015, 0.03]} p={[0, PLINTH + 0.62, fz + 0.02]} m={shared.steel} />
        <Box s={[w - gap, 0.1, 0.02]} p={[0, PLINTH + 0.05, fz]} m={m.front} />
        <Box s={[w - gap, 0.07, 0.02]} p={[0, COUNTER - 0.04 - 0.04, fz]} m={m.front} />
        {/* induction hob */}
        <Box s={[w - 0.04, 0.006, 0.5]} p={[0, COUNTER + 0.003, 0.0]} m={shared.blackGlass} cast={false} />
        {[
          [-0.13, -0.1, 0.09],
          [0.13, -0.1, 0.07],
          [-0.13, 0.12, 0.07],
          [0.13, 0.12, 0.09],
        ].map(([bx, bz, r], i) => (
          <mesh key={i} position={[bx, COUNTER + 0.0065, bz]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[r - 0.004, r, 40]} />
            <meshStandardMaterial color="#3a3a3a" roughness={0.4} />
          </mesh>
        ))}
      </group>
    )
  }
  if (kind === 'sink') {
    const doors = w > 0.7 ? 2 : 1
    return (
      <group position={[x, 0, 0]}>
        {base}
        {Array.from({ length: doors }).map((_, i) => {
          const dw = w / doors
          const cx = -w / 2 + dw * (i + 0.5)
          return (
            <group key={i}>
              <Box s={[dw - gap, baseH - gap, 0.02]} p={[cx, PLINTH + baseH / 2, fz]} m={m.front} />
              <Handle m={m} p={[cx + (i === 0 && doors === 2 ? dw / 2 - 0.05 : -dw / 2 + 0.05), PLINTH + baseH - 0.12, fz + 0.011]} w={0.16} vertical />
            </group>
          )
        })}
        {/* undermount basin */}
        <Box s={Math.min(0.5, w - 0.12) > 0 ? [Math.min(0.62, w - 0.14), 0.004, 0.38] : [0.4, 0.004, 0.38]} p={[0, COUNTER + 0.002, 0.02]} m={shared.black} cast={false} />
        {/* faucet */}
        <group position={[0, COUNTER, -0.2]}>
          <Cyl r={0.022} h={0.04} p={[0, 0.02, 0]} m={m.metal} seg={16} />
          <Cyl r={0.012} h={0.32} p={[0, 0.2, 0]} m={m.metal} seg={12} />
          <mesh position={[0, 0.36, 0.06]} rotation={[0, Math.PI / 2, 0]} material={m.metal}>
            <torusGeometry args={[0.06, 0.012, 8, 20, Math.PI]} />
          </mesh>
          <Cyl r={0.012} h={0.08} p={[0, 0.32, 0.12]} m={m.metal} seg={12} />
          <Box s={[0.012, 0.012, 0.07]} p={[0.03, 0.12, 0.02]} m={m.metal} />
        </group>
      </group>
    )
  }
  // dishwasher — integrated full-height front
  return (
    <group position={[x, 0, 0]}>
      {base}
      <Box s={[w - gap, baseH - gap, 0.02]} p={[0, PLINTH + baseH / 2, fz]} m={m.front} />
      <Handle m={m} p={[0, PLINTH + baseH - 0.04, fz + 0.011]} w={w - 0.12} />
    </group>
  )
}

export function Kitchen({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const W = item.w ?? 2.6
  const d = item.d ?? 0.6
  const modules = item.modules ?? []
  // module placements
  let cursor = -W / 2
  const placed = modules.map((mod) => {
    const x = cursor + mod.w / 2
    cursor += mod.w
    return { ...mod, x, x0: x - mod.w / 2, x1: x + mod.w / 2 }
  })
  const counterRanges = placed.filter((p) => p.kind !== 'fridge' && p.kind !== 'pantry')
  const c0 = counterRanges.length ? Math.min(...counterRanges.map((p) => p.x0)) : 0
  const c1 = counterRanges.length ? Math.max(...counterRanges.map((p) => p.x1)) : 0
  const hob = placed.find((p) => p.kind === 'hob')
  const sink = placed.find((p) => p.kind === 'sink')
  const led = m.style.ledStrips

  return (
    <group>
      {/* recessed plinth */}
      <Box s={[W, PLINTH, d - 0.07]} p={[0, PLINTH / 2, -0.035]} m={shared.black} />
      {led && <Box s={[c1 - c0, 0.008, 0.01]} p={[(c0 + c1) / 2, 0.012, d / 2 - 0.07]} m={m.led} cast={false} />}
      {placed.map((p, i) => (
        <Module key={i} kind={p.kind} x={p.x} w={p.w} d={d} m={m} />
      ))}
      {/* worktop */}
      {c1 > c0 && <Box s={[c1 - c0, 0.04, d + 0.02]} p={[(c0 + c1) / 2, COUNTER - 0.02, 0.01]} m={m.countertop} />}
      {/* low upstand */}
      {c1 > c0 && <Box s={[c1 - c0, 0.12, 0.015]} p={[(c0 + c1) / 2, COUNTER + 0.06, -d / 2 + 0.0075]} m={m.countertop} />}

      {/* wall cabinets with integrated extractor */}
      <Upper>
        {(item.uppers ?? []).map(([a, b], i) => {
          const x0 = -W / 2 + a
          const x1 = -W / 2 + b
          const uw = x1 - x0
          const ud = 0.35
          const y0 = 1.52
          const uh = TALL - y0
          const doors = Math.max(1, Math.round(uw / 0.5))
          const hasHood = hob && hob.x > x0 && hob.x < x1
          return (
            <group key={i}>
              {/* backsplash */}
              <Box s={[uw, y0 - COUNTER, 0.012]} p={[(x0 + x1) / 2, (y0 + COUNTER) / 2, -d / 2 + 0.006]} m={m.countertop} cast={false} />
              <Box s={[uw, uh, ud]} p={[(x0 + x1) / 2, y0 + uh / 2, -d / 2 + ud / 2]} m={m.carcass} />
              {Array.from({ length: doors }).map((_, j) => {
                const dw = uw / doors
                const cx = x0 + dw * (j + 0.5)
                return (
                  <group key={j}>
                    <Box s={[dw - 0.004, uh - 0.004, 0.02]} p={[cx, y0 + uh / 2, -d / 2 + ud + 0.01]} m={m.front} />
                    <Handle m={m} p={[cx + (j % 2 === 0 ? dw / 2 - 0.05 : -dw / 2 + 0.05), y0 + 0.1, -d / 2 + ud + 0.021]} w={0.14} vertical />
                  </group>
                )
              })}
              {hasHood && <Box s={[0.56, 0.04, 0.28]} p={[hob!.x, y0 - 0.02, -d / 2 + 0.16]} m={shared.steel} />}
              <Box s={[uw - 0.04, 0.008, 0.015]} p={[(x0 + x1) / 2, y0 - 0.005, -d / 2 + ud - 0.04]} m={m.led} cast={false} />
            </group>
          )
        })}
        {item.shelf && (
          <group>
            {[1.5, 1.85].map((y) => (
              <Box key={y} s={[item.shelf![1] - item.shelf![0], 0.03, 0.26]} p={[-W / 2 + (item.shelf![0] + item.shelf![1]) / 2, y, -d / 2 + 0.13]} m={m.wood} />
            ))}
            <group position={[-W / 2 + item.shelf[0] + 0.06, 1.515, -d / 2 + 0.12]}>
              {[0, 0.09, 0.18].map((x, i) => (
                <Cyl key={i} r={0.035} h={0.16 - i * 0.02} p={[x, (0.16 - i * 0.02) / 2, 0]} m={i === 1 ? shared.darkStoneware : shared.stoneware} seg={16} />
              ))}
            </group>
            <group position={[-W / 2 + item.shelf[0] + 0.12, 1.865, -d / 2 + 0.12]}>
              {[0, 0.025, 0.05].map((y) => (
                <Cyl key={y} r={0.11} h={0.018} p={[0, y + 0.009, 0]} m={shared.ceramic} seg={24} />
              ))}
            </group>
          </group>
        )}
      </Upper>

      {/* countertop styling */}
      {c1 > c0 && (
        <group>
          <Box s={[0.32, 0.02, 0.22]} p={[c1 - 0.3, COUNTER + 0.01, -0.12]} m={m.woodAccent} />
          <Cyl r={0.07} r2={0.06} h={0.18} p={[c1 - 0.55 > (sink?.x ?? -9) + 0.35 ? c1 - 0.55 : c0 + 0.25, COUNTER + 0.09, -0.15]} m={m.style.id === 'luxury' ? m.metal : shared.stoneware} seg={20} />
          <Vase p={[c0 + 0.12, COUNTER, -0.18]} h={0.14} r={0.06} branches={false} dark />
          <group position={[c0 + 0.12, COUNTER + 0.14, -0.18]}>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} position={[Math.cos(i * 1.3) * 0.03, 0.06, Math.sin(i * 1.3) * 0.03]} rotation={[Math.cos(i) * 0.3, i, Math.sin(i) * 0.3]} material={shared.leafLight}>
                <sphereGeometry args={[0.04, 8, 6]} />
              </mesh>
            ))}
          </group>
        </group>
      )}
    </group>
  )
}
