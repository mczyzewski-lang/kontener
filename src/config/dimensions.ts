/**
 * 40ft High Cube container wrapped in a 200 mm external thermal envelope.
 * Single source of truth for every dimension in the scene. 1 unit = 1 m.
 *
 * Coordinate system:
 *   X  → along the length (−X = "left" end, +X = "right" end)
 *   Z  → across the width (+Z = front façade facing the garden / entrance)
 *   Y  → up. Ground level is y = 0.
 *
 * Build-up of an external wall, outside → inside:
 *   façade finish (cladding / panels / render) ........ 30 mm
 *   mineral wool or EPS insulation ..................... 200 mm
 *   container corrugated steel wall (incl. rib depth) .. 45 mm
 *   battens + service void + 12.5 mm lining ............ 40 mm
 *   total .............................................. 315 mm
 */

/** ISO 668 dimensions of the 40' HC steel container (hidden inside the envelope) */
export const CONTAINER = {
  length: 12.19,
  width: 2.44,
  height: 2.896,
  /** usable steel-to-steel interior */
  innerLength: 12.032,
  innerWidth: 2.352,
  innerHeight: 2.698,
} as const

export const FACADE = 0.03
export const INSULATION = 0.2
export const STEEL = 0.045
export const LINING = 0.04
/** long walls */
export const WALL = FACADE + INSULATION + STEEL + LINING
/** end walls: the door-end frame and front wall are ~35 mm deeper */
export const WALL_END = WALL + 0.035
/** roof: 200 mm insulation + membrane on top of the container roof */
export const ROOF_INSULATION = 0.22

/** Concrete piers lift the container slightly off the ground */
export const PLINTH = 0.35

/** Outer dimensions of the insulated building envelope (plan) */
export const EXTERIOR = {
  length: CONTAINER.length + 2 * (FACADE + INSULATION),
  width: CONTAINER.width + 2 * (FACADE + INSULATION),
  /** overall height above ground (top of the roof edge) */
  height: PLINTH + CONTAINER.height + ROOF_INSULATION + 0.1,
} as const

export const HALF_L = EXTERIOR.length / 2
export const HALF_W = EXTERIOR.width / 2

/** Partition walls: 45 mm studs + 2 × 12.5 mm board + finish */
export const PARTITION = 0.08

/** World Y of the container underside */
export const BASE_Y = PLINTH
/** container floor (cross members + plywood) + finished floor */
export const FLOOR_Y = PLINTH + 0.16 + 0.03
/** ceiling lining under the container roof bows */
export const CEIL_Y = PLINTH + 0.16 + CONTAINER.innerHeight - 0.05
/** top of the roof membrane */
export const ROOF_Y = PLINTH + CONTAINER.height + ROOF_INSULATION
/** top of the roof-edge flashing / parapet */
export const ROOF_TOP = ROOF_Y + 0.1
/** bottom of the façade (a small shadow gap above the gravel) */
export const FACADE_BOTTOM = 0.16

/** Interior (finished) extents, relative to the envelope centre */
export const INTERIOR = {
  x0: -(HALF_L - WALL_END),
  x1: HALF_L - WALL_END,
  z0: -(HALF_W - WALL),
  z1: HALF_W - WALL,
  length: EXTERIOR.length - 2 * WALL_END,
  width: EXTERIOR.width - 2 * WALL,
  height: CEIL_Y - FLOOR_Y,
} as const

/** Overall building height above the ground */
export const BUILDING_HEIGHT = ROOF_TOP

/** Horizontal section height used for dollhouse & floor-plan cut (world Y) */
export const SECTION_Y = FLOOR_Y + 1.35

/** Human eye level for the walkthrough camera (world Y) */
export const EYE_Y = FLOOR_Y + 1.62

export const GROSS_INTERIOR_AREA = INTERIOR.length * INTERIOR.width
