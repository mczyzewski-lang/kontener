import { Html, Line } from '@react-three/drei'
import { AnimatePresence, motion } from 'framer-motion'
import { EXTERIOR, FLOOR_Y, HALF_L, HALF_W, INTERIOR, SECTION_Y } from '../config/dimensions'
import { roomArea } from '../config/layouts'
import type { LayoutDef } from '../config/types'
import { useConfig } from '../store'

function fmt(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m))
}

export function RoomLabels({ layout }: { layout: LayoutDef }) {
  const mode = useConfig((s) => s.mode)
  const labels = useConfig((s) => s.labels)
  const show = labels && (mode === 'dollhouse' || mode === 'topdown')
  const plan = mode === 'topdown'
  if (!show) return null
  return (
    <group>
      {layout.rooms.map((r) => {
        const cx = r.label?.[0] ?? (r.x[0] + r.x[1]) / 2
        const cz = r.label?.[1] ?? (r.z[0] + r.z[1]) / 2
        const w = Math.abs(r.x[1] - r.x[0])
        const d = Math.abs(r.z[1] - r.z[0])
        if (r.minor && !plan) return null
        return (
          <Html key={`${layout.id}-${r.id}`} position={[cx, plan ? SECTION_Y + 0.05 : FLOOR_Y + 0.9, cz]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.25 }}
                className={
                  plan
                    ? 'whitespace-nowrap rounded-md bg-white/85 px-2 py-1 text-center shadow-sm ring-1 ring-black/5 backdrop-blur'
                    : 'whitespace-nowrap rounded-full bg-black/55 px-3 py-1 text-center text-white shadow-glass ring-1 ring-white/15 backdrop-blur-md'
                }
              >
                <div className={plan ? 'text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-900' : 'text-[11px] font-medium tracking-wide'}>{r.name}</div>
                {plan && !r.minor && (
                  <div className="text-[10px] tabular-nums text-ink-500">
                    {fmt(w)} × {fmt(d)} m · {roomArea(r).toFixed(1)} m²
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </Html>
        )
      })}
    </group>
  )
}

/** Architectural dimension strings around the plan */
export function PlanDimensions() {
  const mode = useConfig((s) => s.mode)
  const labels = useConfig((s) => s.labels)
  if (mode !== 'topdown' || !labels) return null
  const y = SECTION_Y + 0.02
  const zTop = -HALF_W - 0.55
  const xRight = HALF_L + 0.55
  const zBot = HALF_W + 0.55
  const col = '#2a2b2e'
  const tick = (x: number, z: number, vertical = false) => (
    <Line
      points={vertical ? [[x - 0.1, y, z - 0.1], [x + 0.1, y, z + 0.1]] : [[x - 0.1, y, z + 0.1], [x + 0.1, y, z - 0.1]]}
      color={col}
      lineWidth={1.4}
    />
  )
  const chip = (text: string, sub?: string) => (
    <div className="whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-900 shadow-sm ring-1 ring-black/5">
      {text}
      {sub && <span className="ml-1 font-normal text-ink-500">{sub}</span>}
    </div>
  )
  return (
    <group>
      {/* overall length (exterior) */}
      <Line points={[[-HALF_L, y, zTop], [HALF_L, y, zTop]]} color={col} lineWidth={1} />
      <Line points={[[-HALF_L, y, -HALF_W - 0.1], [-HALF_L, y, zTop - 0.12]]} color={col} lineWidth={0.8} />
      <Line points={[[HALF_L, y, -HALF_W - 0.1], [HALF_L, y, zTop - 0.12]]} color={col} lineWidth={0.8} />
      {tick(-HALF_L, zTop)}
      {tick(HALF_L, zTop)}
      <Html position={[0, y, zTop]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        {chip(`${EXTERIOR.length.toFixed(2)} m`, 'exterior')}
      </Html>
      {/* interior length */}
      <Line points={[[INTERIOR.x0, y, zBot], [INTERIOR.x1, y, zBot]]} color={col} lineWidth={1} />
      <Line points={[[INTERIOR.x0, y, INTERIOR.z1 + 0.1], [INTERIOR.x0, y, zBot + 0.12]]} color={col} lineWidth={0.8} />
      <Line points={[[INTERIOR.x1, y, INTERIOR.z1 + 0.1], [INTERIOR.x1, y, zBot + 0.12]]} color={col} lineWidth={0.8} />
      {tick(INTERIOR.x0, zBot)}
      {tick(INTERIOR.x1, zBot)}
      <Html position={[-3.6, y, zBot]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        {chip(`${INTERIOR.length.toFixed(2)} m`, 'interior')}
      </Html>
      {/* width */}
      <Line points={[[xRight, y, -HALF_W], [xRight, y, HALF_W]]} color={col} lineWidth={1} />
      <Line points={[[HALF_L + 0.1, y, -HALF_W], [xRight + 0.12, y, -HALF_W]]} color={col} lineWidth={0.8} />
      <Line points={[[HALF_L + 0.1, y, HALF_W], [xRight + 0.12, y, HALF_W]]} color={col} lineWidth={0.8} />
      {tick(xRight, -HALF_W, true)}
      {tick(xRight, HALF_W, true)}
      <Html position={[xRight + 0.05, y, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="-rotate-90">{chip(`${EXTERIOR.width.toFixed(2)} m`, `· ${INTERIOR.width.toFixed(2)} int.`)}</div>
      </Html>
    </group>
  )
}
