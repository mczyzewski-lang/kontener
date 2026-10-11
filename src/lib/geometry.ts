import * as THREE from 'three'

const boxCache = new Map<string, THREE.BoxGeometry>()

/**
 * Box geometry whose UVs are in metres on every face, so tiling textures
 * (wood grain, concrete, fabric) keep a constant physical scale regardless
 * of the box size. Cached by dimensions.
 */
export function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}`
  let g = boxCache.get(key)
  if (g) return g
  g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  // face order: +x, -x, +y, -y, +z, -z — 4 verts each
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1])
    }
  }
  uv.needsUpdate = true
  boxCache.set(key, g)
  return g
}

/**
 * Wall slab in the XY plane with rectangular holes, extruded along +Z.
 * Holes are given as [x0, x1, y0, y1] in the same local frame.
 * UVs are in metres (ExtrudeGeometry uses shape coordinates).
 */
export function wallWithHoles(width: number, height: number, depth: number, holes: [number, number, number, number][]) {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(width, 0)
  shape.lineTo(width, height)
  shape.lineTo(0, height)
  shape.lineTo(0, 0)
  for (const [x0, x1, y0, y1] of holes) {
    const hx0 = Math.max(0.001, x0)
    const hx1 = Math.min(width - 0.001, x1)
    const hy0 = Math.max(0.001, y0)
    const hy1 = Math.min(height - 0.001, y1)
    if (hx1 <= hx0 || hy1 <= hy0) continue
    const h = new THREE.Path()
    h.moveTo(hx0, hy0)
    h.lineTo(hx0, hy1)
    h.lineTo(hx1, hy1)
    h.lineTo(hx1, hy0)
    h.lineTo(hx0, hy0)
    shape.holes.push(h)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 })
  return g
}

/**
 * Splits a 1D span [a, b] by removing the given sub-ranges.
 * Used for wall caps and walkthrough collision.
 */
export function subtractRanges(a: number, b: number, cuts: [number, number][]): [number, number][] {
  const sorted = cuts
    .map(([x, y]) => [Math.max(a, Math.min(x, y)), Math.min(b, Math.max(x, y))] as [number, number])
    .filter(([x, y]) => y > x)
    .sort((p, q) => p[0] - q[0])
  const out: [number, number][] = []
  let cur = a
  for (const [x, y] of sorted) {
    if (x > cur) out.push([cur, x])
    cur = Math.max(cur, y)
  }
  if (cur < b) out.push([cur, b])
  return out
}
