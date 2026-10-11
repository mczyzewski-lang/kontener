import type { FC } from 'react'
import { FLOOR_Y } from '../../config/dimensions'
import type { FurnitureItem, FurnitureType, LayoutDef } from '../../config/types'
import { Bed, BunkBed, MurphyBed } from './beds'
import { Shower, Toilet, Vanity } from './bath'
import { Kitchen } from './kitchen'
import {
  Armchair,
  Chair,
  CoffeeTable,
  DiningTable,
  Desk,
  FloorLamp,
  Pendant,
  Plant,
  Rug,
  SideTable,
  Sofa,
  Stool,
  WallShelves,
} from './living'
import { CoatRack, OverheadCabinets, Sideboard, Wardrobe } from './storage'

const REGISTRY: Record<FurnitureType, FC<{ item: FurnitureItem }>> = {
  bed: Bed,
  bunkBed: BunkBed,
  murphyBed: MurphyBed,
  wardrobe: Wardrobe,
  kitchen: Kitchen,
  diningTable: DiningTable,
  chair: Chair,
  stool: Stool,
  sofa: Sofa,
  armchair: Armchair,
  coffeeTable: CoffeeTable,
  rug: Rug,
  floorLamp: FloorLamp,
  pendant: Pendant,
  plant: Plant,
  shower: Shower,
  toilet: Toilet,
  vanity: Vanity,
  desk: Desk,
  wallShelves: WallShelves,
  overheadCabinets: OverheadCabinets,
  coatRack: CoatRack,
  sideTable: SideTable,
  sideboard: Sideboard,
}

/** Default footprints (w × d) used for collision when an item doesn't specify its size */
const DEFAULT_SIZE: Partial<Record<FurnitureType, [number, number]>> = {
  chair: [0.45, 0.45],
  stool: [0.36, 0.36],
  armchair: [0.76, 0.78],
  coffeeTable: [0.8, 0.5],
  floorLamp: [0.3, 0.3],
  plant: [0.42, 0.42],
  toilet: [0.4, 0.62],
  sideTable: [0.44, 0.44],
}

/** Axis-aligned footprint of an item in interior coordinates, or null if walk-through */
export function footprint(item: FurnitureItem): [number, number, number, number] | null {
  if (item.block === false) return null
  if (item.type === 'shower') return null // walk-in, glass handled as a wall-side
  let w = item.w ?? DEFAULT_SIZE[item.type]?.[0] ?? 0.5
  let d = item.d ?? DEFAULT_SIZE[item.type]?.[1] ?? item.w ?? 0.5
  if (item.round) d = w
  if (item.type === 'murphyBed') d = 0.45
  const r = (((item.rot ?? 0) % 360) + 360) % 360
  const a = (r * Math.PI) / 180
  const cw = Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * d
  const cd = Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * d
  w = cw
  d = cd
  return [item.x - w / 2, item.x + w / 2, item.z - d / 2, item.z + d / 2]
}

export function FurnitureSet({ layout }: { layout: LayoutDef }) {
  return (
    <group>
      {layout.furniture.map((item, i) => {
        const C = REGISTRY[item.type]
        return (
          <group key={`${layout.id}-${i}`} position={[item.x, FLOOR_Y + (item.y ?? 0), item.z]} rotation-y={((item.rot ?? 0) * Math.PI) / 180}>
            <C item={item} />
          </group>
        )
      })}
    </group>
  )
}
