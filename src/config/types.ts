export type LayoutId = 'couple' | 'family' | 'studio' | 'open'
export type InteriorId = 'japandi' | 'luxury' | 'minimal'
export type ExteriorId = 'wood' | 'black' | 'contemporary' | 'charred' | 'scandi' | 'brick'
export type CameraMode = 'exterior' | 'dollhouse' | 'topdown' | 'walkthrough'
export type LightingId = 'day' | 'sunset' | 'night'

/** front / back = long sides (±Z), left / right = container ends (∓X) */
export type Side = 'front' | 'back' | 'left' | 'right'

export type OpeningKind = 'window' | 'slider' | 'door' | 'fixed'

/**
 * An opening cut through the container shell.
 * front/back: `from`/`to` are X coordinates; left/right: Z coordinates.
 * `sill` / `head` are heights above the finished floor.
 */
export interface ShellOpening {
  side: Side
  from: number
  to: number
  sill: number
  head: number
  kind: OpeningKind
}

export interface PartitionOpening {
  /** absolute coordinate along the wall axis (X for walls running along X, Z otherwise) */
  from: number
  to: number
  type: 'door' | 'pocket' | 'opening'
  /** which side of the wall the door leaf swings to (+1 / −1 on the perpendicular axis) */
  swing?: 1 | -1
}

/** Axis-aligned partition wall, full ceiling height */
export interface Partition {
  a: [number, number]
  b: [number, number]
  openings?: PartitionOpening[]
}

export interface Room {
  id: string
  name: string
  x: [number, number]
  z: [number, number]
  wet?: boolean
  /** override label anchor */
  label?: [number, number]
  /** hide the dimension text (e.g. circulation) */
  minor?: boolean
}

export type FurnitureType =
  | 'bed'
  | 'bunkBed'
  | 'murphyBed'
  | 'wardrobe'
  | 'kitchen'
  | 'diningTable'
  | 'chair'
  | 'stool'
  | 'sofa'
  | 'armchair'
  | 'coffeeTable'
  | 'rug'
  | 'floorLamp'
  | 'pendant'
  | 'plant'
  | 'shower'
  | 'toilet'
  | 'vanity'
  | 'desk'
  | 'wallShelves'
  | 'overheadCabinets'
  | 'coatRack'
  | 'sideTable'
  | 'sideboard'

export type KitchenModule = 'fridge' | 'pantry' | 'drawers' | 'hob' | 'sink' | 'dishwasher'

export interface FurnitureItem {
  type: FurnitureType
  x: number
  z: number
  /** rotation in degrees around Y. 0 = item front faces +Z (front façade) */
  rot?: number
  /** footprint width (local X) */
  w?: number
  /** footprint depth (local Z) */
  d?: number
  h?: number
  /** elevation above finished floor */
  y?: number
  round?: boolean
  variant?: number
  modules?: { kind: KitchenModule; w: number }[]
  /** local-X ranges of the kitchen that get wall cabinets */
  uppers?: [number, number][]
  /** local-X range of an open shelf */
  shelf?: [number, number]
  nightstands?: boolean
  /** set false to let the walkthrough camera pass through */
  block?: boolean
}

export interface Viewpoint {
  id: string
  name: string
  x: number
  z: number
  /** viewing direction in degrees: 0 = +X, 90 = +Z (front), 180 = −X, 270 = −Z */
  yaw: number
  pitch?: number
}

export interface LayoutDef {
  id: LayoutId
  name: string
  tagline: string
  sleeps: string
  description: string
  features: string[]
  rooms: Room[]
  partitions: Partition[]
  openings: ShellOpening[]
  furniture: FurnitureItem[]
  /** ceiling light positions (x, z) */
  lights: [number, number][]
  viewpoints: Viewpoint[]
  /** front-door centre X */
  entranceX: number
  /** X-range of the living-room slider the terrace attaches to */
  terrace: [number, number]
}
