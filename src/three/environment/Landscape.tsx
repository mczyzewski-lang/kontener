import { useMemo } from 'react'
import * as THREE from 'three'
import { EXTERIOR, HALF_L, HALF_W } from '../../config/dimensions'
import type { LayoutDef } from '../../config/types'
import { glowRegistry, shared, washMaterial } from '../../lib/materials'
import { gravelTexture, grassTexture, concreteTexture } from '../../lib/textures'
import { useConfig } from '../../store'
import { Foliage, seeded } from '../furniture/common'
import { Box, Cyl } from '../primitives'
import { Grasses } from '../building/ExteriorDetails'

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */
function Ground() {
  const mat = useMemo(() => {
    const t = grassTexture().clone()
    t.repeat.set(36, 36)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, vertexColors: true })
  }, [])
  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(150, 96, 0, Math.PI * 2)
    // add rings for vertex-colour variation
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const n = seeded(4)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const d = Math.hypot(x, y)
      const v = 0.85 + n() * 0.2
      const far = Math.min(1, d / 120)
      colors[i * 3] = v * (1 - far * 0.15)
      colors[i * 3 + 1] = v * (1 - far * 0.05)
      colors[i * 3 + 2] = v * (1 - far * 0.2)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    // circle UVs are 0..1; rescale to metres/4 for the repeat to read naturally
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 4)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  return <mesh geometry={geo} material={mat} receiveShadow />
}

/** Instanced grass blades near the house for close-up realism */
function GrassBlades({ exclude }: { exclude: (x: number, z: number) => boolean }) {
  const mesh = useMemo(() => {
    const blade = new THREE.BufferGeometry()
    const verts = new Float32Array([-0.012, 0, 0, 0.012, 0, 0, 0, 0.16, 0.01])
    blade.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    blade.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ color: '#5f7d36', roughness: 0.9, side: THREE.DoubleSide })
    const COUNT = 26000
    const m = new THREE.InstancedMesh(blade, mat, COUNT)
    const r = seeded(17)
    const d = new THREE.Object3D()
    const c = new THREE.Color()
    let i = 0
    let guard = 0
    while (i < COUNT && guard < COUNT * 4) {
      guard++
      const a = r() * Math.PI * 2
      const rad = 2 + Math.sqrt(r()) * 13
      const x = Math.cos(a) * rad * 1.25
      const z = Math.sin(a) * rad
      if (exclude(x, z)) continue
      d.position.set(x, 0, z)
      d.rotation.set((r() - 0.5) * 0.5, r() * Math.PI, (r() - 0.5) * 0.5)
      const s = 0.6 + r() * 0.9
      d.scale.set(s, s * (0.7 + r() * 0.8), s)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      c.setHSL(0.24 + r() * 0.05, 0.42 + r() * 0.15, 0.25 + r() * 0.12)
      m.setColorAt(i, c)
      i++
    }
    m.count = i
    m.receiveShadow = true
    return m
  }, [exclude])
  return <primitive object={mesh} />
}

/* ------------------------------------------------------------------ */
/* Trees & shrubs                                                      */
/* ------------------------------------------------------------------ */
const barkMat = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.95 })
const birchMat = new THREE.MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.8 })
const foliageMats = ['#4e6b2e', '#5c7a34', '#6f8a3c', '#41592a', '#7a8f45'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }),
)
const pineMat = new THREE.MeshStandardMaterial({ color: '#2f4a2a', roughness: 0.9, flatShading: true })
const hedgeMat = new THREE.MeshStandardMaterial({ color: '#3f5a2a', roughness: 0.95 })

function DeciduousTree({ p, s = 1, seed = 1, birch = false }: { p: [number, number, number]; s?: number; seed?: number; birch?: boolean }) {
  const r = seeded(seed)
  const clusters = useMemo(
    () =>
      Array.from({ length: birch ? 4 : 6 }).map(() => ({
        p: [(r() - 0.5) * 2.2, 3.4 + r() * 2.2, (r() - 0.5) * 2.2] as [number, number, number],
        rad: (birch ? 0.9 : 1.25) + r() * 0.6,
        m: foliageMats[Math.floor(r() * foliageMats.length)],
        seed: Math.floor(r() * 1000),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, birch],
  )
  return (
    <group position={p} scale={s}>
      <Cyl r={birch ? 0.09 : 0.14} r2={birch ? 0.05 : 0.08} h={4.4} p={[0, 2.2, 0]} m={birch ? birchMat : barkMat} seg={10} />
      {!birch && (
        <>
          <Cyl r={0.06} r2={0.03} h={1.8} p={[0.5, 3.6, 0.2]} rotation={[0.3, 0, -0.6]} m={barkMat} seg={6} />
          <Cyl r={0.06} r2={0.03} h={1.6} p={[-0.45, 3.8, -0.2]} rotation={[-0.3, 0, 0.6]} m={barkMat} seg={6} />
        </>
      )}
      {clusters.map((c, i) => (
        <Foliage key={i} count={birch ? 140 : 190} radius={c.rad} leaf={birch ? 0.2 : 0.28} seed={c.seed} material={c.m} p={c.p} />
      ))}
    </group>
  )
}

function Pine({ p, s = 1 }: { p: [number, number, number]; s?: number }) {
  return (
    <group position={p} scale={s}>
      <Cyl r={0.15} r2={0.08} h={2} p={[0, 1, 0]} m={barkMat} seg={8} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 2.2 + i * 1.25, 0]} material={pineMat} castShadow receiveShadow>
          <coneGeometry args={[2.0 - i * 0.42, 2.6, 9]} />
        </mesh>
      ))}
    </group>
  )
}

function Shrub({ p, s = 1, seed = 1 }: { p: [number, number, number]; s?: number; seed?: number }) {
  return (
    <group position={p} scale={s}>
      <Foliage count={120} radius={0.55} leaf={0.14} seed={seed} material={foliageMats[seed % foliageMats.length]} p={[0, 0.42, 0]} stretch={[1, 0.75, 1]} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Hardscape                                                           */
/* ------------------------------------------------------------------ */
const gravelMat = (() => {
  const t = gravelTexture().clone()
  t.repeat.set(1, 1)
  t.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: t, roughness: 1 })
})()
const slabMat = new THREE.MeshStandardMaterial({ map: concreteTexture('#bdb6ab', { tile: 1.5, seed: 33 }), roughness: 0.9 })

function GravelBorder() {
  const w = EXTERIOR.length + 1.2
  const d = EXTERIOR.width + 1.2
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow material={gravelMat}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* steel edging */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box s={[w, 0.05, 0.01]} p={[0, 0.02, s * (d / 2)]} m={shared.steelDark} cast={false} />
          <Box s={[0.01, 0.05, d]} p={[s * (w / 2), 0.02, 0]} m={shared.steelDark} cast={false} />
        </group>
      ))}
    </group>
  )
}

function pathPoints(layout: LayoutDef): [number, number][] {
  const x0 = layout.entranceX
  const z0 = HALF_W + 2.05
  const pts: [number, number][] = []
  const away = (layout.terrace[0] + layout.terrace[1]) / 2 > x0 ? -1 : 1
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const z = z0 + i * 1.05
    const x = x0 + away * (Math.sin(t * Math.PI) * 0.8 + t * 1.4)
    pts.push([x, z])
  }
  return pts
}

function SteppingStones({ layout }: { layout: LayoutDef }) {
  const pts = useMemo(() => pathPoints(layout), [layout])
  const bollard = washMaterial('#ffcf96', 'exterior', 0.5, false)
  return (
    <group>
      {pts.map(([x, z], i) => (
        <group key={i}>
          <Box s={[1.25, 0.06, 0.62]} p={[x, 0.02, z]} m={slabMat} rotation={[0, (i % 2 ? 0.04 : -0.03) + (i > 4 ? 0.12 : 0), 0]} />
          {i % 3 === 1 && (
            <group position={[x + 0.95, 0, z]}>
              <Box s={[0.1, 0.6, 0.1]} p={[0, 0.3, 0]} m={shared.steelDark} />
              <BollardGlow />
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} scale={[2.2, 2.2, 1]} material={bollard}>
                <planeGeometry />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  )
}

function BollardGlow() {
  return <Box s={[0.105, 0.05, 0.105]} p={[0, 0.52, 0]} m={bollardGlowMat} cast={false} />
}
const bollardGlowMat = (() => {
  const m = new THREE.MeshStandardMaterial({ color: '#222', emissive: new THREE.Color('#ffc887'), emissiveIntensity: 0 })
  glowRegistry.add({ mat: m, kind: 'exterior', base: 5 })
  return m
})()

/* ------------------------------------------------------------------ */
/* Distant scenery                                                     */
/* ------------------------------------------------------------------ */
const hillMat = new THREE.MeshStandardMaterial({ color: '#56703c', roughness: 1 })
const farTreeMat = new THREE.MeshStandardMaterial({ color: '#34502a', roughness: 1, flatShading: true })

function Distant() {
  const trees = useMemo(() => {
    const geo = new THREE.ConeGeometry(1, 1, 7)
    geo.translate(0, 0.5, 0)
    const COUNT = 260
    const m = new THREE.InstancedMesh(geo, farTreeMat, COUNT)
    const r = seeded(91)
    const d = new THREE.Object3D()
    for (let i = 0; i < COUNT; i++) {
      const a = r() * Math.PI * 2
      // keep the front (camera) side more open
      const front = Math.sin(a) > 0.2
      const rad = (front ? 95 : 70) + r() * 45
      d.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad)
      const h = 5 + r() * 7
      d.scale.set(1.6 + r() * 1.5, h, 1.6 + r() * 1.5)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    return m
  }, [])
  return (
    <group>
      <primitive object={trees} />
      {[
        [-80, -95, 60, 14],
        [40, -110, 80, 18],
        [120, -40, 70, 12],
        [-130, 20, 70, 15],
        [100, 80, 60, 10],
      ].map(([x, z, r, h], i) => (
        <mesh key={i} position={[x, -2, z]} scale={[r, h, r * 0.7]} material={hillMat}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
export function Landscape({ layout }: { layout: LayoutDef }) {
  const terrace = useConfig((s) => s.terrace)
  const exclude = useMemo(() => {
    const pts = pathPoints(layout)
    const [t0, t1] = layout.terrace
    return (x: number, z: number) => {
      if (Math.abs(x) < HALF_L + 0.7 && Math.abs(z) < HALF_W + 0.7) return true
      if (Math.abs(x - layout.entranceX) < 0.9 && z > HALF_W && z < HALF_W + 2.1) return true
      if (terrace && x > t0 - 0.1 && x < t1 + 0.1 && z > 0 && z < HALF_W + 3.5) return true
      for (const [px, pz] of pts) if (Math.abs(x - px) < 0.7 && Math.abs(z - pz) < 0.4) return true
      return false
    }
  }, [layout, terrace])

  return (
    <group>
      <Ground />
      <GrassBlades exclude={exclude} />
      <GravelBorder />
      <SteppingStones layout={layout} />
      {/* planting along the façade */}
      <Grasses p={[-HALF_L - 0.35, 0.01, 1.4]} spread={[0.25, 0.6]} count={70} />
      <Grasses p={[HALF_L + 0.35, 0.01, -1.6]} spread={[0.25, 0.5]} count={50} color="#9aa36a" />
      <Grasses p={[-3.5, 0.01, -HALF_W - 0.35]} spread={[1.2, 0.2]} count={80} />
      <Shrub p={[-HALF_L - 1.4, 0, -1.6]} s={1.2} seed={3} />
      <Shrub p={[-HALF_L - 0.9, 0, 2.6]} s={0.9} seed={7} />
      <Shrub p={[HALF_L + 1.6, 0, -2.6]} s={1.1} seed={11} />
      <Shrub p={[4, 0, -HALF_W - 1.6]} s={1.0} seed={5} />
      <Shrub p={[-1.5, 0, -HALF_W - 1.8]} s={1.3} seed={13} />
      {/* hedge along the back boundary */}
      <mesh position={[0, 0.6, -10.5]} material={hedgeMat} castShadow receiveShadow>
        <boxGeometry args={[34, 1.2, 0.9]} />
      </mesh>
      {/* trees framing the composition */}
      <DeciduousTree p={[-12.5, 0, -7.5]} s={1.25} seed={2} />
      <DeciduousTree p={[-17, 0, 1.5]} s={1.1} seed={5} />
      <DeciduousTree p={[11.5, 0, -9]} s={1.3} seed={9} />
      <DeciduousTree p={[-10.5, 0, 9.5]} s={0.75} seed={21} birch />
      <DeciduousTree p={[-11.8, 0, 8.1]} s={0.7} seed={22} birch />
      <DeciduousTree p={[16, 0, 2.5]} s={0.85} seed={31} birch />
      <DeciduousTree p={[1, 0, -15]} s={1.15} seed={14} />
      <Pine p={[-22, 0, -14]} s={1.4} />
      <Pine p={[24, 0, -12]} s={1.6} />
      <Pine p={[-7, 0, -19]} s={1.2} />
      <Distant />
    </group>
  )
}
