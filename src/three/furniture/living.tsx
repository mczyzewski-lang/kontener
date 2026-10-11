import type { FurnitureItem } from '../../config/types'
import { CEIL_Y, FLOOR_Y } from '../../config/dimensions'
import { shared, useInteriorMats } from '../../lib/materials'
import { Box, Cyl, Soft } from '../primitives'
import { Books, Foliage, Upper, Vase } from './common'

/* All pieces: width along X, front faces +Z, origin on the floor. */

export function Sofa({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 2.2
  const d = item.d ?? 0.92
  const arm = 0.14
  const seats = w > 2.15 ? 3 : 2
  const seatW = (w - 2 * arm) / seats
  const legY = 0.1
  const lux = m.style.id === 'luxury'
  return (
    <group>
      {/* legs */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.035, legY, 0.035]} p={[sx * (w / 2 - 0.08), legY / 2, sz * (d / 2 - 0.08)]} m={lux ? m.metal : m.woodAccent} />),
      )}
      {/* base */}
      <Soft s={[w, 0.2, d]} p={[0, legY + 0.1, 0]} m={m.sofa} r={0.04} />
      {/* back */}
      <Soft s={[w, 0.5, 0.18]} p={[0, legY + 0.42, -d / 2 + 0.09]} m={m.sofa} r={0.06} />
      {/* arms */}
      {[-1, 1].map((sx) => (
        <Soft key={sx} s={[arm, 0.42, d]} p={[sx * (w / 2 - arm / 2), legY + 0.32, 0]} m={m.sofa} r={0.06} />
      ))}
      {/* seat + back cushions */}
      {Array.from({ length: seats }).map((_, i) => {
        const x = -w / 2 + arm + seatW * (i + 0.5)
        return (
          <group key={i}>
            <Soft s={[seatW - 0.01, 0.15, d - 0.22]} p={[x, legY + 0.27, 0.07]} m={m.sofa} r={0.06} />
            <Soft s={[seatW - 0.02, 0.4, 0.17]} p={[x, legY + 0.53, -d / 2 + 0.24]} rotation={[-0.12, 0, 0]} m={m.sofa} r={0.08} />
          </group>
        )
      })}
      {/* throw pillows */}
      <Soft s={[0.42, 0.42, 0.13]} p={[-w / 2 + arm + 0.26, legY + 0.55, -d / 2 + 0.36]} rotation={[-0.25, 0.25, 0.08]} m={m.accentFabric} r={0.07} />
      <Soft s={[0.4, 0.4, 0.12]} p={[w / 2 - arm - 0.26, legY + 0.54, -d / 2 + 0.36]} rotation={[-0.25, -0.3, -0.06]} m={m.throwMat} r={0.07} />
      {/* throw over the arm */}
      <Soft s={[0.16, 0.02, d * 0.9]} p={[w / 2 - arm / 2, legY + 0.535, 0]} m={m.throwMat} r={0.008} />
    </group>
  )
}

export function Armchair({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  if (item.variant === 1) {
    // lounge chair: timber frame + leather cushions
    return (
      <group>
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <Box s={[0.04, 0.04, 0.78]} p={[sx * 0.33, 0.06, 0]} m={m.wood} />
            <Box s={[0.04, 0.5, 0.04]} p={[sx * 0.33, 0.27, 0.3]} m={m.wood} />
            <Box s={[0.04, 0.62, 0.04]} p={[sx * 0.33, 0.33, -0.3]} m={m.wood} rotation={[0.2, 0, 0]} />
            <Box s={[0.06, 0.03, 0.66]} p={[sx * 0.33, 0.53, 0.02]} m={m.wood} />
          </group>
        ))}
        <Soft s={[0.6, 0.11, 0.6]} p={[0, 0.34, 0.05]} m={m.leather} r={0.04} />
        <Soft s={[0.6, 0.55, 0.11]} p={[0, 0.66, -0.27]} rotation={[-0.25, 0, 0]} m={m.leather} r={0.04} />
      </group>
    )
  }
  const w = 0.76
  const d = 0.78
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.03, 0.12, 0.03]} p={[sx * 0.3, 0.06, sz * 0.3]} m={m.woodAccent} />),
      )}
      <Soft s={[w, 0.22, d]} p={[0, 0.23, 0]} m={m.accentFabric} r={0.05} />
      <Soft s={[w, 0.5, 0.17]} p={[0, 0.57, -d / 2 + 0.085]} m={m.accentFabric} r={0.07} />
      {[-1, 1].map((sx) => (
        <Soft key={sx} s={[0.12, 0.3, d]} p={[sx * (w / 2 - 0.06), 0.47, 0]} m={m.accentFabric} r={0.05} />
      ))}
      <Soft s={[w - 0.24, 0.13, d - 0.2]} p={[0, 0.4, 0.06]} m={m.accentFabric} r={0.05} />
      <Soft s={[0.36, 0.3, 0.1]} p={[0, 0.58, -0.2]} rotation={[-0.2, 0, 0]} m={m.bedding} r={0.05} />
    </group>
  )
}

export function Chair({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const lux = m.style.id === 'luxury'
  void item
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.016} r2={0.014} h={0.44} p={[sx * 0.19, 0.22, sz * 0.19]} m={lux ? m.metal : m.wood} seg={8} />),
      )}
      {lux ? <Soft s={[0.46, 0.07, 0.46]} p={[0, 0.47, 0]} m={m.accentFabric} r={0.03} /> : <Box s={[0.45, 0.03, 0.44]} p={[0, 0.455, 0]} m={m.wood} />}
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[0.025, 0.36, 0.025]} p={[sx * 0.19, 0.64, -0.2]} m={lux ? m.metal : m.wood} />
      ))}
      {lux ? (
        <Soft s={[0.44, 0.22, 0.05]} p={[0, 0.74, -0.21]} m={m.accentFabric} r={0.02} />
      ) : (
        <Box s={[0.42, 0.09, 0.02]} p={[0, 0.78, -0.205]} m={m.wood} />
      )}
    </group>
  )
}

export function Stool() {
  const m = useInteriorMats()
  return (
    <group>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return <Cyl key={i} r={0.014} h={0.46} p={[Math.cos(a) * 0.13, 0.23, Math.sin(a) * 0.13]} m={m.wood} seg={8} rotation={[Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1]} />
      })}
      <Cyl r={0.17} h={0.035} p={[0, 0.47, 0]} m={m.woodAccent} seg={28} />
    </group>
  )
}

export function DiningTable({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 1.1
  const d = item.d ?? 0.7
  const top = m.style.id === 'luxury' ? m.countertop : m.wood
  if (item.round) {
    return (
      <group>
        <Cyl r={w / 2} h={0.035} p={[0, 0.74, 0]} m={top} seg={48} />
        <Cyl r={0.06} h={0.7} p={[0, 0.37, 0]} m={m.metal} seg={20} />
        <Cyl r={0.24} h={0.03} p={[0, 0.015, 0]} m={m.metal} seg={32} />
        <Vase p={[0.05, 0.7575, 0]} h={0.2} r={0.055} branches />
        <Cyl r={0.12} r2={0.14} h={0.05} p={[-0.18, 0.7825, 0.08]} m={shared.stoneware} seg={24} />
      </group>
    )
  }
  return (
    <group>
      <Box s={[w, 0.035, d]} p={[0, 0.74, 0]} m={top} />
      {item.variant === 1 ? (
        // extendable table: drop-leaf hinges + central runner
        <group>
          <Box s={[w - 0.1, 0.06, d - 0.1]} p={[0, 0.69, 0]} m={m.woodAccent} />
          {[-1, 1].map((sx) => (
            <Box key={sx} s={[0.05, 0.66, d - 0.16]} p={[sx * (w / 2 - 0.12), 0.33, 0]} m={m.woodAccent} />
          ))}
          <Box s={[w - 0.24, 0.04, 0.05]} p={[0, 0.12, 0]} m={m.woodAccent} />
        </group>
      ) : (
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.04, 0.72, 0.04]} p={[sx * (w / 2 - 0.06), 0.36, sz * (d / 2 - 0.06)]} m={m.style.id === 'japandi' ? m.wood : m.metal} />),
        )
      )}
      <Vase p={[0.1, 0.7575, -0.05]} h={0.22} r={0.05} branches />
      <Cyl r={0.13} r2={0.15} h={0.05} p={[-0.22, 0.7825, 0.05]} m={shared.stoneware} seg={24} />
    </group>
  )
}

export function CoffeeTable({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 0.8
  const d = item.d ?? 0.5
  const st = m.style.id
  const topMat = st === 'luxury' ? m.countertop : st === 'minimal' ? shared.concrete : m.wood
  if (item.round) {
    const h = item.variant === 2 ? 0.46 : 0.36
    return (
      <group>
        {st === 'japandi' ? (
          <>
            <Cyl r={w / 2} h={0.04} p={[0, h, 0]} m={topMat} seg={40} />
            {[0, 1, 2].map((i) => {
              const a = (i / 3) * Math.PI * 2 + 0.4
              return <Cyl key={i} r={0.022} h={h - 0.02} p={[Math.cos(a) * w * 0.32, (h - 0.02) / 2, Math.sin(a) * w * 0.32]} m={m.woodAccent} seg={10} />
            })}
          </>
        ) : (
          <>
            <Cyl r={w / 2} h={0.04} p={[0, h, 0]} m={topMat} seg={40} />
            <Cyl r={w * 0.3} h={h - 0.02} p={[0, (h - 0.02) / 2, 0]} m={st === 'luxury' ? m.metal : topMat} seg={32} />
          </>
        )}
        {item.variant !== 2 && (
          <group position={[0, h + 0.02, 0]}>
            <Box s={[0.22, 0.03, 0.16]} p={[-0.08, 0.015, 0.02]} m={shared.darkStoneware} />
            <Box s={[0.2, 0.025, 0.15]} p={[-0.08, 0.0425, 0.02]} m={m.throwMat} />
            <Vase p={[0.12, 0, -0.04]} h={0.12} r={0.04} />
          </group>
        )}
      </group>
    )
  }
  return (
    <group>
      <Box s={[w, 0.05, d]} p={[0, 0.36, 0]} m={topMat} />
      <Box s={[w - 0.06, 0.02, d - 0.06]} p={[0, 0.12, 0]} m={topMat} />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.03, 0.34, 0.03]} p={[sx * (w / 2 - 0.04), 0.17, sz * (d / 2 - 0.04)]} m={m.metal} />),
      )}
      <group position={[-0.1, 0.385, 0]}>
        <Box s={[0.24, 0.035, 0.17]} p={[0, 0.0175, 0]} m={m.throwMat} />
      </group>
      <Vase p={[0.2, 0.385, 0.02]} h={0.1} r={0.05} dark />
    </group>
  )
}

export function SideTable() {
  const m = useInteriorMats()
  return (
    <group>
      <Cyl r={0.22} h={0.03} p={[0, 0.5, 0]} m={m.style.id === 'luxury' ? m.countertop : m.wood} seg={32} />
      <Cyl r={0.025} h={0.5} p={[0, 0.25, 0]} m={m.metal} seg={12} />
      <Cyl r={0.15} h={0.02} p={[0, 0.01, 0]} m={m.metal} seg={24} />
      <Vase p={[0.05, 0.515, 0]} h={0.16} r={0.045} dark />
    </group>
  )
}

export function Rug({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  if (item.round) {
    return <Cyl r={(item.w ?? 1.2) / 2} h={0.012} p={[0, 0.006, 0]} m={m.rug} seg={48} cast={false} />
  }
  return <Soft s={[item.w ?? 2, 0.014, item.d ?? 1.4]} p={[0, 0.007, 0]} m={m.rug} r={0.006} cast={false} />
}

export function FloorLamp({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  if (item.variant === 1) {
    // arched reading lamp
    return (
      <group>
        <Cyl r={0.14} h={0.03} p={[0, 0.015, 0]} m={m.metal} seg={24} />
        <Cyl r={0.012} h={1.35} p={[0, 0.69, 0]} m={m.metal} seg={8} />
        <Cyl r={0.012} h={0.5} p={[0.2, 1.42, 0]} rotation={[0, 0, -1.2]} m={m.metal} seg={8} />
        <mesh position={[0.42, 1.38, 0]} material={m.lampShade}>
          <coneGeometry args={[0.13, 0.16, 24, 1, true]} />
        </mesh>
        <Cyl r={0.035} h={0.02} p={[0.42, 1.33, 0]} m={m.glow} seg={12} cast={false} />
      </group>
    )
  }
  return (
    <group>
      <Cyl r={0.15} h={0.025} p={[0, 0.0125, 0]} m={m.metal} seg={24} />
      <Cyl r={0.012} h={1.4} p={[0, 0.72, 0]} m={m.metal} seg={8} />
      <mesh position={[0, 1.48, 0]} material={m.lampShade} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.3, 32, 1, true]} />
      </mesh>
      <Cyl r={0.05} h={0.04} p={[0, 1.4, 0]} m={m.glow} seg={12} cast={false} />
    </group>
  )
}

/** Hangs from the ceiling. item.y is ignored. */
export function Pendant({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const ceiling = CEIL_Y - FLOOR_Y
  const v = item.variant ?? 0
  const drop = v === 1 ? 1.0 : 0.85
  const y = ceiling - drop
  return (
    <Upper>
      <group>
        <Cyl r={0.003} h={drop} p={[0, ceiling - drop / 2, 0]} m={shared.black} seg={4} cast={false} />
        <Cyl r={0.04} h={0.015} p={[0, ceiling - 0.008, 0]} m={m.metal} seg={16} cast={false} />
        {v === 0 && (
          <group position={[0, y, 0]}>
            <mesh material={m.style.id === 'japandi' ? m.lampShade : m.metal} castShadow>
              <sphereGeometry args={[0.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
            </mesh>
            <Cyl r={0.06} h={0.02} p={[0, 0.02, 0]} m={m.glow} seg={16} cast={false} />
          </group>
        )}
        {v === 1 && (
          <group position={[0, y, 0]}>
            <mesh material={m.glow}>
              <sphereGeometry args={[0.07, 20, 14]} />
            </mesh>
          </group>
        )}
        {v === 2 && (
          <group position={[0, y, 0]}>
            <mesh material={m.metal} castShadow>
              <cylinderGeometry args={[0.03, 0.24, 0.16, 32, 1, true]} />
            </mesh>
            <Cyl r={0.2} h={0.006} p={[0, -0.075, 0]} m={m.glow} seg={32} cast={false} />
          </group>
        )}
      </group>
    </Upper>
  )
}

export function Plant({ item }: { item: FurnitureItem }) {
  const v = item.variant ?? 0
  if (v === 0) {
    // olive tree in a large pot
    return (
      <group>
        <Cyl r={0.2} r2={0.22} h={0.42} p={[0, 0.21, 0]} m={shared.terracotta} seg={28} />
        <Cyl r={0.2} h={0.02} p={[0, 0.41, 0]} m={shared.soil} seg={24} cast={false} />
        <Cyl r={0.02} r2={0.03} h={0.9} p={[0, 0.85, 0]} m={shared.soil} seg={8} />
        <Foliage count={420} radius={0.38} leaf={0.05} seed={3} material={shared.olive} p={[0, 1.45, 0]} stretch={[1, 0.8, 1]} />
        <Foliage count={160} radius={0.25} leaf={0.05} seed={8} material={shared.olive} p={[0.12, 1.15, -0.05]} />
      </group>
    )
  }
  if (v === 2) {
    // snake plant
    return (
      <group>
        <Cyl r={0.14} r2={0.15} h={0.3} p={[0, 0.15, 0]} m={shared.stoneware} seg={24} />
        {Array.from({ length: 11 }).map((_, i) => {
          const a = i * 2.4
          const h = 0.5 + ((i * 37) % 10) / 25
          return (
            <mesh key={i} position={[Math.cos(a) * 0.05, 0.3 + h / 2, Math.sin(a) * 0.05]} rotation={[Math.sin(a) * 0.12, a, Math.cos(a) * 0.12]} material={shared.leaf} castShadow>
              <boxGeometry args={[0.06, h, 0.008]} />
            </mesh>
          )
        })}
      </group>
    )
  }
  // medium leafy plant
  return (
    <group>
      <Cyl r={0.15} r2={0.17} h={0.32} p={[0, 0.16, 0]} m={shared.darkStoneware} seg={24} />
      <Foliage count={70} radius={0.3} leaf={0.11} seed={5} material={shared.leaf} p={[0, 0.62, 0]} stretch={[1, 0.9, 1]} />
    </group>
  )
}

export function WallShelves({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 0.8
  return (
    <group>
      {[0, 0.38].map((y, i) => (
        <group key={y} position={[0, y, 0]}>
          <Box s={[w, 0.025, 0.22]} p={[0, 0, -0.0]} m={m.woodAccent} />
          <group position={[-w / 2 + 0.04, 0.0125, 0]}>
            <Books length={w * 0.55} seed={i + 11} maxH={0.22} />
          </group>
          <Vase p={[w / 2 - 0.12, 0.0125, 0]} h={0.14} r={0.05} dark={i === 1} />
        </group>
      ))}
    </group>
  )
}

export function Desk({ item }: { item: FurnitureItem }) {
  const m = useInteriorMats()
  const w = item.w ?? 0.95
  const d = item.d ?? 0.5
  return (
    <group>
      <Box s={[w, 0.03, d]} p={[0, 0.72, 0]} m={m.wood} />
      <Box s={[0.4, 0.55, d - 0.04]} p={[w / 2 - 0.22, 0.43, 0]} m={m.front} />
      <Box s={[0.03, 0.72, d - 0.04]} p={[-w / 2 + 0.02, 0.36, 0]} m={m.wood} />
      {/* lamp + books */}
      <group position={[-w / 2 + 0.15, 0.735, -0.12]}>
        <Cyl r={0.06} h={0.015} p={[0, 0.0075, 0]} m={m.metal} seg={16} />
        <Cyl r={0.008} h={0.35} p={[0, 0.18, 0]} m={m.metal} seg={6} />
        <mesh position={[0.04, 0.37, 0]} rotation={[0, 0, -0.6]} material={m.metal}>
          <coneGeometry args={[0.06, 0.1, 16, 1, true]} />
        </mesh>
      </group>
      <group position={[0.05, 0.735, -0.15]}>
        <Books length={0.15} seed={21} maxH={0.22} />
      </group>
      <Box s={[0.3, 0.012, 0.21]} p={[-0.05, 0.741, 0.05]} m={shared.darkStoneware} />
    </group>
  )
}
