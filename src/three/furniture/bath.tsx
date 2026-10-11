import type { FurnitureItem } from '../../config/types'
import { CEIL_Y, FLOOR_Y } from '../../config/dimensions'
import { shared, useInteriorMats } from '../../lib/materials'
import { Box, Cyl, Soft } from '../primitives'

/* Walk-in shower: footprint w × d, back wall at −Z, side wall at −X, glass on +X. */
export function Shower({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 0.9
  const d = item.d ?? 1.3
  const tileH = CEIL_Y - FLOOR_Y - 0.02
  const glassLen = Math.min(d - 0.35, 1.0)
  return (
    <group>
      {/* stone floor tray + linear drain */}
      <Box s={[w, 0.01, d]} p={[0, 0.006, 0]} m={m.bathFloor} cast={false} />
      <Box s={[w - 0.12, 0.004, 0.05]} p={[0, 0.012, -d / 2 + 0.07]} m={shared.steel} cast={false} />
      {/* tiled walls */}
      <Box s={[w, tileH, 0.012]} p={[0, tileH / 2, -d / 2 + 0.006]} m={m.bathWall} cast={false} />
      <Box s={[0.012, tileH, d]} p={[-w / 2 + 0.006, tileH / 2, 0]} m={m.bathWall} cast={false} />
      {/* niche */}
      <Box s={[0.012, 0.3, 0.45]} p={[-w / 2 + 0.014, 1.15, -0.1]} m={shared.black} cast={false} />
      {[0, 1].map((i) => (
        <Cyl key={i} r={0.025} h={0.16} p={[-w / 2 + 0.05, 1.08, -0.2 + i * 0.07]} m={i ? shared.white : shared.darkStoneware} seg={12} />
      ))}
      {/* glass screen */}
      <Box s={[0.01, 2.0, glassLen]} p={[w / 2 - 0.02, 1.02, -d / 2 + glassLen / 2]} m={shared.showerGlass} cast={false} />
      <Box s={[0.02, 0.02, glassLen]} p={[w / 2 - 0.02, 2.02, -d / 2 + glassLen / 2]} m={m.metal} />
      <Box s={[0.02, 2.0, 0.02]} p={[w / 2 - 0.02, 1.0, -d / 2 + glassLen]} m={m.metal} />
      {/* rain shower */}
      <group position={[0, 2.15, -d / 2]}>
        <Cyl r={0.012} h={0.36} p={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]} m={m.metal} seg={10} />
        <Cyl r={item.variant === 1 ? 0.15 : 0.12} h={0.012} p={[0, -0.01, 0.36]} m={m.metal} seg={32} />
      </group>
      <group position={[0, 1.05, -d / 2 + 0.02]}>
        <Box s={[0.14, 0.14, 0.012]} p={[0, 0, 0]} m={m.metal} />
        <Cyl r={0.018} h={0.05} p={[0, 0.02, 0.03]} rotation={[Math.PI / 2, 0, 0]} m={m.metal} seg={12} />
      </group>
    </group>
  )
}

/* Wall-hung WC with concealed cistern; back at −Z */
export function Toilet() {
  const m = useInteriorMats()
  return (
    <group>
      <Box s={[0.6, 1.08, 0.16]} p={[0, 0.54, -0.2]} m={m.bathWall} />
      <Box s={[0.62, 0.025, 0.18]} p={[0, 1.09, -0.19]} m={m.countertop} />
      <Box s={[0.2, 0.13, 0.008]} p={[0, 0.95, -0.118]} m={m.metal} />
      <Soft s={[0.36, 0.3, 0.5]} p={[0, 0.38, 0.12]} m={shared.ceramic} r={0.12} />
      <Soft s={[0.37, 0.03, 0.46]} p={[0, 0.545, 0.13]} m={shared.ceramic} r={0.015} />
      {/* paper holder */}
      <Cyl r={0.05} h={0.1} p={[0.38, 0.65, -0.11]} rotation={[0, 0, Math.PI / 2]} m={shared.white} seg={16} />
    </group>
  )
}

/* Floating vanity with vessel basin and back-lit mirror; back at −Z */
export function Vanity({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 0.6
  const d = item.d ?? 0.45
  return (
    <group>
      <Box s={[w, 0.32, d - 0.02]} p={[0, 0.62, -0.01]} m={m.front} />
      <Box s={[w, 0.025, d]} p={[0, 0.7925, 0]} m={m.countertop} />
      {/* vessel basin */}
      <Cyl r={Math.min(0.19, w / 2 - 0.06)} r2={Math.min(0.2, w / 2 - 0.05)} h={0.12} p={[0, 0.865, 0.03]} m={shared.ceramic} seg={36} />
      <Cyl r={Math.min(0.16, w / 2 - 0.09)} h={0.005} p={[0, 0.924, 0.03]} m={shared.water} seg={36} cast={false} />
      {/* wall faucet */}
      <Cyl r={0.012} h={0.16} p={[0, 1.03, -d / 2 + 0.08]} rotation={[Math.PI / 2, 0, 0]} m={m.metal} seg={10} />
      {/* splash + mirror */}
      <Box s={[w, 0.6, 0.012]} p={[0, 1.1, -d / 2 + 0.006]} m={m.bathWall} cast={false} />
      <Box s={[w - 0.04, 0.75, 0.012]} p={[0, 1.62, -d / 2 + 0.02]} m={shared.mirror} cast={false} />
      <Box s={[w - 0.1, 0.008, 0.008]} p={[0, 1.235, -d / 2 + 0.018]} m={m.led} cast={false} />
      {/* towel */}
      <group position={[w / 2 + 0.06, 0.95, -d / 2 + 0.05]}>
        <Cyl r={0.006} h={0.12} p={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]} m={m.metal} seg={6} />
        <Soft s={[0.04, 0.4, 0.3]} p={[0, -0.05, 0.08]} m={m.bedding} r={0.015} />
      </group>
      {/* soap / plant */}
      <Cyl r={0.025} h={0.11} p={[w / 2 - 0.08, 0.86, -d / 2 + 0.08]} m={shared.darkStoneware} seg={12} />
    </group>
  )
}
