import { EXTERIOR, FLOOR_Y, HALF_L, HALF_W } from '../../config/dimensions'
import type { ShellOpening, Side } from '../../config/types'

/**
 * Each façade gets its own local frame:
 *   u → along the wall (left→right when looking at it from outside)
 *   y → world Y
 *   n → outward normal; n = 0 is the outer face of the container
 */
export interface SideFrame {
  side: Side
  position: [number, number, number]
  rotationY: number
  /** maps the world "along" coordinate (X for long sides, Z for ends) to u */
  dir: 1 | -1
  span: number
}

export const SIDES: Record<Side, SideFrame> = {
  front: { side: 'front', position: [0, 0, HALF_W], rotationY: 0, dir: 1, span: EXTERIOR.length },
  back: { side: 'back', position: [0, 0, -HALF_W], rotationY: Math.PI, dir: -1, span: EXTERIOR.length },
  left: { side: 'left', position: [-HALF_L, 0, 0], rotationY: -Math.PI / 2, dir: 1, span: EXTERIOR.width },
  right: { side: 'right', position: [HALF_L, 0, 0], rotationY: Math.PI / 2, dir: -1, span: EXTERIOR.width },
}

export const SIDE_ORDER: Side[] = ['front', 'back', 'left', 'right']

/** Opening rectangle in side-local u / world-y coordinates */
export interface LocalOpening {
  u0: number
  u1: number
  y0: number
  y1: number
  o: ShellOpening
}

export function localOpenings(openings: ShellOpening[], side: Side): LocalOpening[] {
  const f = SIDES[side]
  return openings
    .filter((o) => o.side === side)
    .map((o) => {
      const a = f.dir * o.from
      const b = f.dir * o.to
      return { u0: Math.min(a, b), u1: Math.max(a, b), y0: FLOOR_Y + o.sill, y1: FLOOR_Y + o.head, o }
    })
}

/** World position of a point given in a side frame */
export function sideToWorld(side: Side, u: number, y: number, n: number): [number, number, number] {
  const f = SIDES[side]
  const c = Math.cos(f.rotationY)
  const s = Math.sin(f.rotationY)
  // local (u, y, n) rotated around Y then translated
  const x = u * c + n * s
  const z = -u * s + n * c
  return [f.position[0] + x, y, f.position[2] + z]
}
