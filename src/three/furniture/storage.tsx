import type { FurnitureItem } from '../../config/types'
import { shared, useInteriorMats } from '../../lib/materials'
import { Box, Cyl, Soft } from '../primitives'
import { Upper, Vase } from './common'

/* Built-in wardrobe: width along X, doors facing +Z */
export function Wardrobe({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 1.2
  const d = item.d ?? 0.6
  const h = item.h ?? 2.3
  const doors = Math.max(2, Math.round(w / 0.45))
  const dw = w / doors
  return (
    <group>
      <Box s={[w, 0.08, d - 0.06]} p={[0, 0.04, -0.03]} m={shared.black} />
      <Box s={[w, h - 0.08, d - 0.02]} p={[0, 0.08 + (h - 0.08) / 2, -0.01]} m={m.carcass} />
      {Array.from({ length: doors }).map((_, i) => {
        const cx = -w / 2 + dw * (i + 0.5)
        const hx = i % 2 === 0 ? dw / 2 - 0.04 : -dw / 2 + 0.04
        return (
          <group key={i}>
            <Box s={[dw - 0.004, h - 0.084, 0.02]} p={[cx, 0.08 + (h - 0.08) / 2, d / 2]} m={m.front} />
            {m.style.id === 'japandi' ? (
              <Box s={[0.012, 0.18, 0.008]} p={[cx + hx, 1.1, d / 2 + 0.012]} m={shared.black} cast={false} />
            ) : (
              <Box s={[0.014, 0.5, 0.025]} p={[cx + hx, 1.1, d / 2 + 0.022]} m={m.metal} />
            )}
          </group>
        )
      })}
    </group>
  )
}

export function OverheadCabinets({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 2
  const d = item.d ?? 0.38
  const h = 0.42
  const doors = Math.max(2, Math.round(w / 0.5))
  return (
    <Upper>
      <group>
        <Box s={[w, h, d]} p={[0, h / 2, 0]} m={m.carcass} />
        {Array.from({ length: doors }).map((_, i) => {
          const dw = w / doors
          return <Box key={i} s={[dw - 0.004, h - 0.004, 0.02]} p={[-w / 2 + dw * (i + 0.5), h / 2, d / 2 + 0.01]} m={m.front} />
        })}
        <Box s={[w - 0.08, 0.008, 0.012]} p={[0, -0.004, d / 2 - 0.05]} m={m.led} cast={false} />
      </group>
    </Upper>
  )
}

/* Entry: wall hooks with coats and a slim shoe bench; back at −Z */
export function CoatRack({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 0.9
  const hooks = Math.max(2, Math.round(w / 0.22))
  return (
    <group>
      <Box s={[w, 0.07, 0.025]} p={[0, 1.68, 0.0125]} m={m.woodAccent} />
      {Array.from({ length: hooks }).map((_, i) => {
        const x = -w / 2 + (w / hooks) * (i + 0.5)
        return (
          <group key={i} position={[x, 1.66, 0.05]}>
            <Cyl r={0.01} h={0.05} rotation={[Math.PI / 2, 0, 0]} m={m.metal} seg={8} />
            {i % 2 === 0 && <Soft s={[0.16, 0.75, 0.1]} p={[0, -0.36, 0.04]} m={i === 0 ? m.throwMat : m.accentFabric} r={0.04} />}
          </group>
        )
      })}
      <Box s={[w, 0.03, 0.3]} p={[0, 0.45, 0.15]} m={m.wood} />
      <Box s={[w - 0.04, 0.02, 0.28]} p={[0, 0.12, 0.15]} m={m.wood} />
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[0.025, 0.45, 0.28]} p={[sx * (w / 2 - 0.02), 0.225, 0.15]} m={m.wood} />
      ))}
      {/* shoes */}
      {[-0.2, 0.05].map((x) => (
        <Soft key={x} s={[0.1, 0.08, 0.26]} p={[x, 0.17, 0.15]} m={shared.darkStoneware} r={0.03} />
      ))}
      <Vase p={[w / 2 - 0.12, 0.465, 0.15]} h={0.1} r={0.04} />
    </group>
  )
}

export function Sideboard({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 1.2
  return (
    <group>
      <Box s={[w, 0.5, 0.4]} p={[0, 0.35, 0]} m={m.front} />
      <Box s={[w - 0.1, 0.1, 0.34]} p={[0, 0.05, 0]} m={shared.black} />
      <Vase p={[w / 2 - 0.2, 0.6, 0]} h={0.3} r={0.07} branches />
    </group>
  )
}
