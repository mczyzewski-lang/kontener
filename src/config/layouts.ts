import { INTERIOR, PARTITION } from './dimensions'
import type { LayoutDef, LayoutId, Room } from './types'

/*
 * All coordinates are in metres, relative to the container centre and the
 * finished floor. Interior usable box:
 *   X: −5.965 … +5.965   (11.93 m)
 *   Z: −1.090 … +1.090   ( 2.18 m)
 * Partitions are 80 mm thick and are given by their centre line.
 */
const X0 = INTERIOR.x0
const X1 = INTERIOR.x1
const Z0 = INTERIOR.z0
const Z1 = INTERIOR.z1
const H = PARTITION / 2

/* ------------------------------------------------------------------ */
/* Layout A — Couple Retreat                                           */
/* ------------------------------------------------------------------ */
const couple: LayoutDef = {
  id: 'couple',
  name: 'Couple Retreat',
  tagline: '1 bedroom · living · dining',
  sleeps: 'Sleeps 2',
  description:
    'A private double bedroom at one end, a compact wet room off the entry hall, a galley kitchen with dining nook and a glazed living room that opens onto the terrace.',
  features: ['Double bed 140×200', 'Walk-in shower', 'Full kitchen with oven', 'Built-in wardrobe', 'Corner panoramic glazing'],
  rooms: [
    { id: 'bed', name: 'Bedroom', x: [X0, -2.65 - H], z: [Z0, Z1] },
    { id: 'bath', name: 'Bathroom', x: [-2.65 + H, -0.55 - H], z: [Z0, 0.25 - H], wet: true },
    { id: 'hall', name: 'Entry', x: [-2.65 + H, -0.55], z: [0.25 + H, Z1], minor: true },
    { id: 'kitchen', name: 'Kitchen & Dining', x: [-0.55 + H, 2.35], z: [Z0, Z1] },
    { id: 'living', name: 'Living Room', x: [2.35, X1], z: [Z0, Z1] },
  ],
  partitions: [
    { a: [-2.65, Z0], b: [-2.65, Z1], openings: [{ from: 0.32, to: 1.04, type: 'door', swing: -1 }] },
    { a: [-2.65, 0.25], b: [-0.55, 0.25], openings: [{ from: -1.3, to: -0.62, type: 'pocket' }] },
    { a: [-0.55, Z0], b: [-0.55, 0.25 + H] },
  ],
  openings: [
    { side: 'front', from: -5.3, to: -3.9, sill: 0.9, head: 2.15, kind: 'window' },
    { side: 'front', from: -2.2, to: -1.25, sill: 0, head: 2.1, kind: 'door' },
    { side: 'front', from: 0.05, to: 1.6, sill: 0.9, head: 2.15, kind: 'window' },
    { side: 'front', from: 2.6, to: 5.75, sill: 0, head: 2.3, kind: 'slider' },
    { side: 'back', from: -5.5, to: -4.3, sill: 1.45, head: 2.15, kind: 'window' },
    { side: 'back', from: -1.6, to: -0.95, sill: 1.6, head: 2.15, kind: 'window' },
    { side: 'back', from: 0.75, to: 1.75, sill: 1.05, head: 2.15, kind: 'window' },
    { side: 'back', from: 3.4, to: 4.9, sill: 0.95, head: 2.15, kind: 'window' },
    { side: 'right', from: -0.95, to: 0.95, sill: 0, head: 2.3, kind: 'fixed' },
  ],
  furniture: [
    // Bedroom
    { type: 'bed', x: X0 + 1.05, z: 0, rot: 90, w: 1.5, d: 2.1, nightstands: true },
    { type: 'wardrobe', x: -2.65 - H - 0.3, z: Z0 + 0.625, rot: 270, w: 1.25, d: 0.6, h: 2.3 },
    { type: 'rug', x: -3.55, z: 0.1, w: 0.7, d: 1.4, block: false },
    { type: 'plant', x: -3.4, z: 0.85, variant: 1 },
    { type: 'pendant', x: -4.9, z: -0.62, variant: 1, block: false },
    { type: 'pendant', x: -4.9, z: 0.62, variant: 1, block: false },
    // Bathroom
    { type: 'shower', x: (-2.65 + H + -1.66) / 2, z: (Z0 + 0.25 - H) / 2, w: -1.66 - (-2.65 + H), d: 0.25 - H - Z0 },
    { type: 'toilet', x: -1.3, z: Z0 + 0.28 },
    { type: 'vanity', x: -0.55 - H - 0.22, z: -0.6, rot: 270, w: 0.55, d: 0.44 },
    // Entry
    { type: 'coatRack', x: -2.0, z: 0.25 + H + 0.05, w: 0.9, block: false },
    // Kitchen & dining
    {
      type: 'kitchen',
      x: -0.51 + 2.75 / 2,
      z: Z0 + 0.3,
      w: 2.75,
      d: 0.6,
      modules: [
        { kind: 'fridge', w: 0.6 },
        { kind: 'hob', w: 0.6 },
        { kind: 'sink', w: 0.6 },
        { kind: 'dishwasher', w: 0.45 },
        { kind: 'drawers', w: 0.5 },
      ],
      uppers: [[0.6, 1.2]],
      shelf: [2.3, 2.72],
    },
    { type: 'diningTable', x: 0.85, z: Z1 - 0.36, w: 1.1, d: 0.7 },
    { type: 'chair', x: 0.08, z: Z1 - 0.38, rot: 90 },
    { type: 'chair', x: 1.62, z: Z1 - 0.38, rot: -90 },
    { type: 'pendant', x: 0.85, z: Z1 - 0.36, variant: 0, block: false },
    // Living
    { type: 'rug', x: 4.1, z: 0.05, w: 2.3, d: 1.5, block: false },
    { type: 'sofa', x: 4.1, z: Z0 + 0.47, w: 2.2, d: 0.92 },
    { type: 'coffeeTable', x: 4.1, z: 0.32, round: true, w: 0.72 },
    { type: 'armchair', x: 5.4, z: 0.55, rot: -130 },
    { type: 'floorLamp', x: 2.75, z: Z0 + 0.28 },
    { type: 'plant', x: 5.72, z: Z0 + 0.25, variant: 0 },
    { type: 'sideTable', x: 5.55, z: -0.35 },
  ],
  lights: [
    [-4.3, 0],
    [-1.6, -0.45],
    [-1.6, 0.68],
    [0.85, -0.1],
    [3.4, 0],
    [5.0, 0],
  ],
  viewpoints: [
    { id: 'entry', name: 'Entry', x: -1.75, z: 0.68, yaw: 4 },
    { id: 'kitchen', name: 'Kitchen', x: 2.0, z: 0.15, yaw: 196 },
    { id: 'living', name: 'Living', x: 2.75, z: 0.45, yaw: 352 },
    { id: 'bedroom', name: 'Bedroom', x: -3.2, z: 0.72, yaw: 190, pitch: -8 },
    { id: 'bathroom', name: 'Bathroom', x: -0.75, z: 0.72, yaw: 226, pitch: -16 },
  ],
  entranceX: (-2.2 + -1.25) / 2,
  terrace: [2.4, 6.4],
}

/* ------------------------------------------------------------------ */
/* Layout B — Small Family                                             */
/* ------------------------------------------------------------------ */
const family: LayoutDef = {
  id: 'family',
  name: 'Small Family',
  tagline: '2 bedrooms · kitchen · living',
  sleeps: 'Sleeps 3–4',
  description:
    "A children's cabin with storage bunk and study desk, a parents' bedroom behind the glazed end, and a central kitchen-living core with an extendable dining table and sofa bed.",
  features: ['Bunk bed with drawers', 'Sofa bed for guests', 'Extendable dining table', 'Overhead storage', 'Separate parents room'],
  rooms: [
    { id: 'kids', name: "Children's Room", x: [X0, -3.75 - H], z: [Z0, Z1] },
    { id: 'bath', name: 'Bathroom', x: [-3.75 + H, -1.95 - H], z: [Z0, 0.25 - H], wet: true },
    { id: 'hall', name: 'Hall', x: [-3.75 + H, -1.95], z: [0.25 + H, Z1], minor: true },
    { id: 'kitchen', name: 'Kitchen & Dining', x: [-1.95 + H, 1.2], z: [Z0, Z1] },
    { id: 'living', name: 'Living', x: [1.2, 3.55 - H], z: [Z0, Z1] },
    { id: 'parents', name: 'Main Bedroom', x: [3.55 + H, X1], z: [Z0, Z1] },
  ],
  partitions: [
    { a: [-3.75, Z0], b: [-3.75, Z1], openings: [{ from: 0.32, to: 1.04, type: 'door', swing: 1 }] },
    { a: [-3.75, 0.25], b: [-1.95, 0.25], openings: [{ from: -2.8, to: -2.15, type: 'pocket' }] },
    { a: [-1.95, Z0], b: [-1.95, 0.25 + H] },
    { a: [3.55, Z0], b: [3.55, Z1], openings: [{ from: 0.36, to: 1.06, type: 'door', swing: 1 }] },
  ],
  openings: [
    { side: 'front', from: -5.8, to: -4.7, sill: 0.95, head: 2.15, kind: 'window' },
    { side: 'front', from: -1.6, to: -0.25, sill: 0.9, head: 2.15, kind: 'window' },
    { side: 'front', from: 0.05, to: 1.0, sill: 0, head: 2.1, kind: 'door' },
    { side: 'front', from: 1.5, to: 3.35, sill: 0, head: 2.3, kind: 'slider' },
    { side: 'front', from: 4.1, to: 5.6, sill: 0.9, head: 2.15, kind: 'window' },
    { side: 'back', from: -5.6, to: -4.3, sill: 1.5, head: 2.15, kind: 'window' },
    { side: 'back', from: -2.95, to: -2.3, sill: 1.6, head: 2.15, kind: 'window' },
    { side: 'back', from: -0.45, to: 0.45, sill: 1.05, head: 2.15, kind: 'window' },
    { side: 'back', from: 1.7, to: 3.0, sill: 0.95, head: 2.15, kind: 'window' },
    { side: 'left', from: 0.05, to: 0.85, sill: 0.95, head: 2.1, kind: 'window' },
    { side: 'right', from: -0.9, to: 0.9, sill: 0.45, head: 2.2, kind: 'fixed' },
  ],
  furniture: [
    // Children's room
    { type: 'bunkBed', x: X0 + 1.03, z: Z0 + 0.48, w: 2.06, d: 0.96, h: 1.75 },
    { type: 'desk', x: X0 + 0.5, z: Z1 - 0.26, rot: 180, w: 0.95, d: 0.5 },
    { type: 'stool', x: X0 + 0.5, z: Z1 - 0.72 },
    { type: 'wallShelves', x: -4.3, z: Z1 - 0.12, rot: 180, w: 0.8, y: 1.15, block: false },
    { type: 'rug', x: -4.5, z: 0.45, w: 1.2, d: 0.8, round: true, block: false },
    { type: 'pendant', x: -4.9, z: 0.3, variant: 1, block: false },
    // Bathroom
    { type: 'shower', x: (-3.75 + H + -2.86) / 2, z: (Z0 + 0.25 - H) / 2, w: -2.86 - (-3.75 + H), d: 0.25 - H - Z0 },
    { type: 'toilet', x: -2.62, z: Z0 + 0.28 },
    { type: 'vanity', x: -1.95 - H - 0.2, z: -0.65, rot: 270, w: 0.5, d: 0.4 },
    // Kitchen & dining
    {
      type: 'kitchen',
      x: -1.91 + 2.65 / 2,
      z: Z0 + 0.3,
      w: 2.65,
      d: 0.6,
      modules: [
        { kind: 'fridge', w: 0.6 },
        { kind: 'drawers', w: 0.4 },
        { kind: 'hob', w: 0.6 },
        { kind: 'sink', w: 0.6 },
        { kind: 'dishwasher', w: 0.45 },
      ],
      uppers: [[0.6, 1.6]],
    },
    { type: 'diningTable', x: -0.9, z: Z1 - 0.36, w: 1.0, d: 0.7, variant: 1 },
    { type: 'chair', x: -1.62, z: Z1 - 0.38, rot: 90 },
    { type: 'chair', x: -0.18, z: Z1 - 0.38, rot: -90 },
    { type: 'stool', x: -0.9, z: 0.05 },
    { type: 'pendant', x: -0.9, z: Z1 - 0.36, variant: 0, block: false },
    // Living
    { type: 'rug', x: 2.35, z: 0.05, w: 1.9, d: 1.4, block: false },
    { type: 'sofa', x: 2.35, z: Z0 + 0.46, w: 2.0, d: 0.9, variant: 1 },
    { type: 'coffeeTable', x: 2.35, z: 0.3, w: 0.9, d: 0.5 },
    { type: 'floorLamp', x: 3.3, z: Z0 + 0.25 },
    { type: 'plant', x: 1.4, z: Z0 + 0.25, variant: 2 },
    // Parents' bedroom
    { type: 'bed', x: 3.55 + H + 1.05, z: Z0 + 0.7, rot: 90, w: 1.4, d: 2.1 },
    { type: 'overheadCabinets', x: 4.65, z: Z0 + 0.19, w: 2.0, d: 0.38, y: 1.85, block: false },
    { type: 'pendant', x: 3.85, z: Z0 + 0.15, variant: 1, block: false },
    { type: 'plant', x: X1 - 0.25, z: Z1 - 0.25, variant: 1 },
  ],
  lights: [
    [-4.85, 0],
    [-3.3, -0.45],
    [-2.8, 0.68],
    [-0.6, 0],
    [2.35, 0],
    [4.75, 0],
  ],
  viewpoints: [
    { id: 'entry', name: 'Entry', x: 0.55, z: 0.55, yaw: 192 },
    { id: 'living', name: 'Living', x: 0.6, z: 0.25, yaw: 6 },
    { id: 'kitchen', name: 'Kitchen', x: 1.0, z: 0.2, yaw: 192 },
    { id: 'kids', name: "Children's", x: -3.4, z: 0.68, yaw: 196, pitch: -6 },
    { id: 'bathroom', name: 'Bathroom', x: -2.1, z: 0.72, yaw: 226, pitch: -16 },
    { id: 'parents', name: 'Main Bedroom', x: 3.85, z: 0.72, yaw: 348, pitch: -8 },
  ],
  entranceX: (0.05 + 1.0) / 2,
  terrace: [1.3, 3.6],
}

/* ------------------------------------------------------------------ */
/* Layout C — Premium Studio                                           */
/* ------------------------------------------------------------------ */
const studio: LayoutDef = {
  id: 'studio',
  name: 'Premium Studio',
  tagline: 'Open plan · hotel suite',
  sleeps: 'Sleeps 2',
  description:
    'One continuous open space: a Murphy bed wall that folds away by day, a sculptural bathroom pod, a sleek kitchen and the largest living room with full-height corner glazing.',
  features: ['Fold-away Murphy bed', 'Bathroom pod with rain shower', '3.8 m living room', 'Built-in library wall', 'Hotel-suite feel'],
  rooms: [
    { id: 'sleep', name: 'Sleep & Lounge', x: [X0, -2.75], z: [Z0, Z1] },
    { id: 'bath', name: 'Bathroom', x: [-2.75 + H, -0.45 - H], z: [Z0, 0.25 - H], wet: true },
    { id: 'hall', name: 'Entry', x: [-2.75, -0.45], z: [0.25 + H, Z1], minor: true },
    { id: 'kitchen', name: 'Kitchen & Dining', x: [-0.45 + H, 2.15], z: [Z0, Z1] },
    { id: 'living', name: 'Living Room', x: [2.15, X1], z: [Z0, Z1] },
  ],
  partitions: [
    { a: [-2.75, Z0], b: [-2.75, 0.25 + H] },
    { a: [-2.75, 0.25], b: [-0.45, 0.25], openings: [{ from: -1.25, to: -0.58, type: 'pocket' }] },
    { a: [-0.45, Z0], b: [-0.45, 0.25 + H] },
  ],
  openings: [
    { side: 'front', from: -5.6, to: -3.4, sill: 0.9, head: 2.15, kind: 'window' },
    { side: 'front', from: -2.3, to: -1.35, sill: 0, head: 2.1, kind: 'door' },
    { side: 'front', from: -0.2, to: 1.7, sill: 0.9, head: 2.15, kind: 'window' },
    { side: 'front', from: 2.35, to: 5.75, sill: 0, head: 2.3, kind: 'slider' },
    { side: 'back', from: -5.3, to: -3.7, sill: 1.3, head: 2.15, kind: 'window' },
    { side: 'back', from: -1.9, to: -1.55, sill: 1.6, head: 2.15, kind: 'window' },
    { side: 'back', from: 1.25, to: 2.05, sill: 1.05, head: 2.15, kind: 'window' },
    { side: 'back', from: 3.0, to: 4.8, sill: 0.95, head: 2.15, kind: 'window' },
    { side: 'right', from: -0.95, to: 0.95, sill: 0, head: 2.3, kind: 'fixed' },
  ],
  furniture: [
    // Sleep & lounge
    { type: 'murphyBed', x: X0 + 0.225, z: 0, rot: 90, w: 2.18, d: 0.45, h: 2.3 },
    { type: 'armchair', x: -3.12, z: -0.62, rot: 35, variant: 1 },
    { type: 'floorLamp', x: -2.98, z: -0.15, variant: 1 },
    { type: 'rug', x: -4.45, z: 0, w: 2.2, d: 1.6, block: false },
    // Bathroom pod
    { type: 'shower', x: (-2.75 + H + -1.61) / 2, z: (Z0 + 0.25 - H) / 2, w: -1.61 - (-2.75 + H), d: 0.25 - H - Z0, variant: 1 },
    { type: 'toilet', x: -1.35, z: Z0 + 0.28 },
    { type: 'vanity', x: -0.45 - H - 0.225, z: -0.58, rot: 270, w: 0.72, d: 0.45 },
    // Entry
    { type: 'coatRack', x: -2.4, z: 0.25 + H + 0.05, w: 0.55, block: false },
    // Kitchen & dining
    {
      type: 'kitchen',
      x: -0.41 + 2.55 / 2,
      z: Z0 + 0.3,
      w: 2.55,
      d: 0.6,
      modules: [
        { kind: 'pantry', w: 0.6 },
        { kind: 'hob', w: 0.6 },
        { kind: 'drawers', w: 0.45 },
        { kind: 'sink', w: 0.9 },
      ],
      uppers: [[0.6, 1.65]],
    },
    { type: 'diningTable', x: 0.85, z: 0.5, round: true, w: 0.9, variant: 2 },
    { type: 'chair', x: 0.2, z: 0.5, rot: 90 },
    { type: 'chair', x: 1.5, z: 0.5, rot: -90 },
    { type: 'pendant', x: 0.85, z: 0.5, variant: 2, block: false },
    // Living
    { type: 'rug', x: 3.95, z: 0.05, w: 2.8, d: 1.7, block: false },
    { type: 'sofa', x: 3.9, z: Z0 + 0.48, w: 2.5, d: 0.95, variant: 2 },
    { type: 'coffeeTable', x: 3.6, z: 0.35, round: true, w: 0.8, variant: 1 },
    { type: 'coffeeTable', x: 4.25, z: 0.45, round: true, w: 0.5, variant: 2 },
    { type: 'armchair', x: 5.5, z: 0.45, rot: -125 },
    { type: 'floorLamp', x: 2.45, z: Z0 + 0.25 },
    { type: 'plant', x: 5.72, z: Z0 + 0.25, variant: 0 },
  ],
  lights: [
    [-4.4, 0],
    [-1.6, -0.45],
    [-1.6, 0.68],
    [0.85, -0.1],
    [3.5, 0],
    [5.1, 0],
  ],
  viewpoints: [
    { id: 'entry', name: 'Entry', x: -1.8, z: 0.66, yaw: 2 },
    { id: 'living', name: 'Living', x: 2.4, z: 0.5, yaw: 350 },
    { id: 'kitchen', name: 'Kitchen', x: 2.1, z: 0.2, yaw: 194 },
    { id: 'sleep', name: 'Sleep & Lounge', x: -2.6, z: 0.66, yaw: 188, pitch: -8 },
    { id: 'bathroom', name: 'Bathroom', x: -0.62, z: 0.7, yaw: 226, pitch: -16 },
  ],
  entranceX: (-2.3 + -1.35) / 2,
  terrace: [2.35, 6.4],
}

export const LAYOUTS: Record<LayoutId, LayoutDef> = { couple, family, studio }
export const LAYOUT_ORDER: LayoutId[] = ['couple', 'family', 'studio']

export const roomArea = (r: Room) => Math.abs(r.x[1] - r.x[0]) * Math.abs(r.z[1] - r.z[0])

/** Net usable floor area: interior footprint minus partition footprints */
export function usableArea(layout: LayoutDef): number {
  const gross = (X1 - X0) * (Z1 - Z0)
  const walls = layout.partitions.reduce((s, p) => {
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1])
    return s + len * PARTITION
  }, 0)
  return gross - walls
}
