import { EXTERIOR, HALF_L, HALF_W, INTERIOR, PARTITION } from '../config/dimensions'
import type { LayoutDef } from '../config/types'
import { footprint } from '../three/furniture/Furniture'

/** Tiny vector floor plan generated from the same data as the 3D model */
export function PlanThumb({ layout, active }: { layout: LayoutDef; active: boolean }) {
  const pad = 0.1
  const vb = `${-HALF_L - pad} ${-HALF_W - pad} ${EXTERIOR.length + pad * 2} ${EXTERIOR.width + pad * 2}`
  const stroke = active ? '#1b1e22' : '#5b616b'
  return (
    <svg viewBox={vb} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <rect x={-HALF_L} y={-HALF_W} width={EXTERIOR.length} height={EXTERIOR.width} fill={stroke} rx={0.04} />
      <rect x={INTERIOR.x0} y={INTERIOR.z0} width={INTERIOR.length} height={INTERIOR.width} fill={active ? '#f6f1e8' : '#eef0f2'} />
      {layout.rooms
        .filter((r) => r.wet)
        .map((r) => (
          <rect key={r.id} x={r.x[0]} y={r.z[0]} width={r.x[1] - r.x[0]} height={r.z[1] - r.z[0]} fill={active ? '#dfe7ea' : '#e1e6ea'} />
        ))}
      {layout.furniture.map((f, i) => {
        const fp = footprint({ ...f, block: true })
        if (!fp || f.type === 'pendant' || f.type === 'rug') return null
        return <rect key={i} x={fp[0]} y={fp[2]} width={fp[1] - fp[0]} height={fp[3] - fp[2]} fill={active ? '#d6c3a5' : '#cfd4da'} rx={0.03} />
      })}
      {layout.partitions.map((p, i) => {
        const alongX = p.a[1] === p.b[1]
        const x = alongX ? Math.min(p.a[0], p.b[0]) : p.a[0] - PARTITION / 2
        const y = alongX ? p.a[1] - PARTITION / 2 : Math.min(p.a[1], p.b[1])
        const w = alongX ? Math.abs(p.b[0] - p.a[0]) : PARTITION
        const h = alongX ? PARTITION : Math.abs(p.b[1] - p.a[1])
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={stroke} />
            {(p.openings ?? []).map((o, j) =>
              alongX ? (
                <rect key={j} x={o.from} y={y - 0.01} width={o.to - o.from} height={h + 0.02} fill={active ? '#f6f1e8' : '#eef0f2'} />
              ) : (
                <rect key={j} x={x - 0.01} y={o.from} width={w + 0.02} height={o.to - o.from} fill={active ? '#f6f1e8' : '#eef0f2'} />
              ),
            )}
          </g>
        )
      })}
      {layout.openings.map((o, i) => {
        const glass = '#8fb3c4'
        if (o.side === 'front' || o.side === 'back') {
          const y = o.side === 'front' ? HALF_W - 0.13 : -HALF_W
          return <rect key={i} x={o.from} y={y} width={o.to - o.from} height={0.13} fill={o.kind === 'door' ? '#f6f1e8' : glass} />
        }
        const x = o.side === 'right' ? HALF_L - 0.13 : -HALF_L
        return <rect key={i} x={x} y={o.from} width={0.13} height={o.to - o.from} fill={glass} />
      })}
    </svg>
  )
}
