/**
 * 40ft High Cube shipping container — single source of truth for every
 * dimension in the scene. 1 world unit = 1 metre.
 *
 * Coordinate system:
 *   X  → along the container length (−X = "left" end, +X = "right"/glazed end)
 *   Z  → across the width (+Z = front façade facing the garden / entrance)
 *   Y  → up. Ground level is y = 0.
 */

/** ISO 668 exterior dimensions of a 40' HC */
export const EXTERIOR = {
  length: 12.19,
  width: 2.44,
  height: 2.9,
} as const

/** Concrete piers lift the container slightly off the ground */
export const PLINTH = 0.35

/**
 * Wall build-up from outer face to finished inner face:
 *   corrugated steel 2 mm + corrugation depth / battens 36 mm
 *   + 75 mm PIR insulation + 15 mm service void + 12.5 mm lining ≈ 130 mm
 */
export const WALL = 0.13

/** Base frame + 28 mm marine ply + insulation + finished floor */
export const FLOOR_BUILDUP = 0.2
/** Roof sheet + roof bows + insulation + ceiling lining */
export const ROOF_BUILDUP = 0.2

/** Partition walls: 45 mm studs + 2 × 12.5 mm board + finish */
export const PARTITION = 0.08

export const HALF_L = EXTERIOR.length / 2
export const HALF_W = EXTERIOR.width / 2

/** Interior (finished) extents, relative to container centre */
export const INTERIOR = {
  x0: -(HALF_L - WALL),
  x1: HALF_L - WALL,
  z0: -(HALF_W - WALL),
  z1: HALF_W - WALL,
  length: EXTERIOR.length - 2 * WALL,
  width: EXTERIOR.width - 2 * WALL,
  height: EXTERIOR.height - FLOOR_BUILDUP - ROOF_BUILDUP,
} as const

/** World Y of the container underside, finished floor and ceiling */
export const BASE_Y = PLINTH
export const FLOOR_Y = PLINTH + FLOOR_BUILDUP
export const CEIL_Y = FLOOR_Y + INTERIOR.height
export const ROOF_Y = PLINTH + EXTERIOR.height

/** Horizontal section height used for dollhouse & floor-plan cut (world Y) */
export const SECTION_Y = FLOOR_Y + 1.35

/** Human eye level for the walkthrough camera (world Y) */
export const EYE_Y = FLOOR_Y + 1.62

export const GROSS_INTERIOR_AREA = INTERIOR.length * INTERIOR.width
