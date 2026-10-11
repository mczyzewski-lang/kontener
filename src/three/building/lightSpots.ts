import { FLOOR_Y, HALF_L, HALF_W } from '../../config/dimensions'
import type { LayoutDef, Side } from '../../config/types'
import { SIDES, sideToWorld } from './sides'

export interface LightSpot {
  side: Side
  u: number
  y: number
  world: [number, number, number]
  primary: boolean
}

/** Wall-light positions derived from the layout's openings, so every plan gets sensible exterior lighting. */
export function exteriorLightSpots(layout: LayoutDef): LightSpot[] {
  const y = FLOOR_Y + 2.05
  const out: LightSpot[] = []
  const free = (side: Side, along: number) => {
    const lim = (side === 'front' || side === 'back' ? HALF_L : HALF_W) - 0.3
    if (Math.abs(along) > lim) return false
    return !layout.openings.some((o) => o.side === side && along > Math.min(o.from, o.to) - 0.2 && along < Math.max(o.from, o.to) + 0.2)
  }
  const add = (side: Side, along: number, primary: boolean) => {
    if (!free(side, along)) return
    const u = SIDES[side].dir * along
    out.push({ side, u, y, world: sideToWorld(side, u, y, 0.12), primary })
  }
  add('front', layout.entranceX - 0.75, true)
  add('front', layout.entranceX + 0.75, true)
  const slider = layout.openings.find((o) => o.side === 'front' && o.kind === 'slider')
  if (slider) {
    add('front', slider.from - 0.3, true)
    add('front', slider.to + 0.22, true)
  }
  add('back', -3.2, false)
  add('back', 3.2, false)
  add('left', -0.6, false)
  return out
}
