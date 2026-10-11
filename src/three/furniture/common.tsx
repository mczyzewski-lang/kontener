import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { useConfig } from '../../store'
import { bookColors, shared } from '../../lib/materials'
import { Box, Cyl } from '../primitives'

/** Hides its children in dollhouse and plan views (wall cabinets, pendants…) */
export function Upper({ children }: { children: ReactNode }) {
  const mode = useConfig((s) => s.mode)
  if (mode === 'dollhouse' || mode === 'topdown') return null
  return <>{children}</>
}

export function seeded(seed: number) {
  let s = Math.max(1, Math.floor(seed * 9973) % 2147483646)
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** A row of books standing on a shelf, extending along +X from the origin */
export function Books({ length, seed = 1, maxH = 0.26 }: { length: number; seed?: number; maxH?: number }) {
  const books = useMemo(() => {
    const r = seeded(seed)
    const out: { x: number; w: number; h: number; d: number; m: number; tilt: number }[] = []
    let x = 0
    while (x < length - 0.03) {
      const w = 0.018 + r() * 0.03
      if (x + w > length) break
      const h = maxH * (0.65 + r() * 0.35)
      out.push({ x: x + w / 2, w, h, d: 0.15 + r() * 0.06, m: Math.floor(r() * bookColors.length), tilt: 0 })
      x += w + 0.002
      if (r() < 0.08) x += 0.04
    }
    return out
  }, [length, seed, maxH])
  return (
    <group>
      {books.map((b, i) => (
        <Box key={i} s={[b.w, b.h, b.d]} p={[b.x, b.h / 2, 0]} m={bookColors[b.m]} />
      ))}
    </group>
  )
}

/** Ceramic vase with optional dried branches */
export function Vase({ p, h = 0.22, r = 0.06, dark = false, branches = false }: { p: [number, number, number]; h?: number; r?: number; dark?: boolean; branches?: boolean }) {
  return (
    <group position={p}>
      <Cyl r={r} r2={r * 0.6} h={h} p={[0, h / 2, 0]} m={dark ? shared.darkStoneware : shared.stoneware} seg={20} />
      {branches &&
        [0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, h + 0.2, 0]} rotation={[0.25 * Math.cos(i * 1.7), i, 0.25 * Math.sin(i * 1.7)]} material={shared.olive}>
            <cylinderGeometry args={[0.003, 0.004, 0.45, 4]} />
          </mesh>
        ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Instanced foliage cluster — leaves are flattened ellipsoids         */
/* ------------------------------------------------------------------ */
const leafGeo = (() => {
  const g = new THREE.SphereGeometry(1, 7, 5)
  g.scale(1, 0.18, 0.5)
  return g
})()

export function Foliage({
  count,
  radius,
  leaf,
  seed = 1,
  material,
  p,
  stretch = [1, 1, 1],
}: {
  count: number
  radius: number
  leaf: number
  seed?: number
  material: THREE.Material
  p?: [number, number, number]
  stretch?: [number, number, number]
}) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(leafGeo, material, count)
    const r = seeded(seed)
    const d = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const u = r() * 2 - 1
      const th = r() * Math.PI * 2
      const rr = radius * Math.cbrt(0.35 + r() * 0.65)
      const s = Math.sqrt(1 - u * u)
      d.position.set(rr * s * Math.cos(th) * stretch[0], rr * u * stretch[1], rr * s * Math.sin(th) * stretch[2])
      d.rotation.set(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI)
      d.scale.setScalar(leaf * (0.7 + r() * 0.6))
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.castShadow = true
    m.receiveShadow = true
    return m
  }, [count, radius, leaf, seed, material, stretch])
  return <primitive object={mesh} position={p} />
}
