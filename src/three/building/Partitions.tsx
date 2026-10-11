import { CEIL_Y, FLOOR_Y, PARTITION } from '../../config/dimensions'
import type { LayoutDef, Partition } from '../../config/types'
import { subtractRanges } from '../../lib/geometry'
import { useInteriorMats } from '../../lib/materials'
import { Box } from '../primitives'

const DOOR_H = 2.1
const H = CEIL_Y - FLOOR_Y

function PartitionWall({ p }: { p: Partition }) {
  const int = useInteriorMats()
  const alongX = p.a[1] === p.b[1]
  const a = alongX ? Math.min(p.a[0], p.b[0]) : Math.min(p.a[1], p.b[1])
  const b = alongX ? Math.max(p.a[0], p.b[0]) : Math.max(p.a[1], p.b[1])
  const fixed = alongX ? p.a[1] : p.a[0]
  const openings = p.openings ?? []
  const solid = subtractRanges(
    a,
    b,
    openings.map((o) => [o.from, o.to]),
  )
  // place a segment given an along-axis centre/length
  const seg = (m: number, len: number, y: number, h: number, th = PARTITION): { s: [number, number, number]; p: [number, number, number] } =>
    alongX ? { s: [len, h, th], p: [m, y, fixed] } : { s: [th, h, len], p: [fixed, y, m] }

  return (
    <group>
      {solid.map(([s0, s1], i) => {
        const g = seg((s0 + s1) / 2, s1 - s0, FLOOR_Y + H / 2, H)
        return <Box key={i} s={g.s} p={g.p} m={int.wall} />
      })}
      {openings.map((o, i) => {
        const w = o.to - o.from
        const mid = (o.from + o.to) / 2
        const lintel = seg(mid, w, FLOOR_Y + DOOR_H + (H - DOOR_H) / 2, H - DOOR_H)
        // architrave / frame
        const jamb0 = seg(o.from + 0.015, 0.03, FLOOR_Y + DOOR_H / 2, DOOR_H, PARTITION + 0.02)
        const jamb1 = seg(o.to - 0.015, 0.03, FLOOR_Y + DOOR_H / 2, DOOR_H, PARTITION + 0.02)
        const head = seg(mid, w, FLOOR_Y + DOOR_H - 0.015, 0.03, PARTITION + 0.02)
        const leafW = w - 0.06
        // hinged leaf, shown open at 90°
        const swing = o.swing ?? 1
        let leaf: JSX.Element | null = null
        if (o.type === 'door') {
          const hingeAlong = o.from + 0.03
          const hingePos: [number, number, number] = alongX
            ? [hingeAlong, FLOOR_Y + 0.005, fixed + swing * (PARTITION / 2)]
            : [fixed + swing * (PARTITION / 2), FLOOR_Y + 0.005, hingeAlong]
          // leaf lies perpendicular to the wall, on the swing side
          const leafS: [number, number, number] = alongX ? [0.04, DOOR_H - 0.03, leafW] : [leafW, DOOR_H - 0.03, 0.04]
          const leafP: [number, number, number] = alongX ? [0.02, (DOOR_H - 0.03) / 2, swing * (leafW / 2)] : [swing * (leafW / 2), (DOOR_H - 0.03) / 2, 0.02]
          const handle: [number, number, number] = alongX ? [0.02 - swing * 0.0, 1.0, swing * (leafW - 0.08)] : [swing * (leafW - 0.08), 1.0, 0.02]
          leaf = (
            <group position={hingePos}>
              <Box s={leafS} p={leafP} m={int.doorLeaf} />
              <Box s={alongX ? [0.07, 0.02, 0.02] : [0.02, 0.02, 0.07]} p={handle} m={int.metal} />
            </group>
          )
        }
        if (o.type === 'pocket') {
          // leaf slid into the wall: show only the pull edge
          const edge = seg(o.to - 0.01, 0.02, FLOOR_Y + (DOOR_H - 0.03) / 2, DOOR_H - 0.03, 0.04)
          leaf = <Box s={edge.s} p={edge.p} m={int.doorLeaf} />
        }
        return (
          <group key={i}>
            <Box s={lintel.s} p={lintel.p} m={int.wall} />
            <Box s={jamb0.s} p={jamb0.p} m={int.doorLeaf} />
            <Box s={jamb1.s} p={jamb1.p} m={int.doorLeaf} />
            <Box s={head.s} p={head.p} m={int.doorLeaf} />
            {leaf}
          </group>
        )
      })}
    </group>
  )
}

export function Partitions({ layout }: { layout: LayoutDef }) {
  return (
    <group>
      {layout.partitions.map((p, i) => (
        <PartitionWall key={i} p={p} />
      ))}
    </group>
  )
}
