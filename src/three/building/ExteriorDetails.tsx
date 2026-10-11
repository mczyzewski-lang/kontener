import { useMemo } from 'react'
import * as THREE from 'three'
import { BASE_Y, EXTERIOR, FLOOR_Y, HALF_L, HALF_W, ROOF_Y } from '../../config/dimensions'
import type { LayoutDef } from '../../config/types'
import { claddingTexture } from '../../lib/textures'
import { shared, useExteriorMats, washMaterial } from '../../lib/materials'
import { Box, Cyl } from '../primitives'
import { exteriorLightSpots } from './lightSpots'
import { SIDES } from './sides'
import { useConfig } from '../../store'

/* ------------------------------------------------------------------ */
/* Wall lights with fake light-wash on the façade                      */
/* ------------------------------------------------------------------ */
function WallLights({ layout }: { layout: LayoutDef }) {
  const ext = useExteriorMats()
  const spots = useMemo(() => exteriorLightSpots(layout), [layout])
  const wash = washMaterial(ext.style.lampColor, 'exterior', 0.42)
  const square = ext.style.id === 'black'
  return (
    <group>
      {spots.map((s, i) => {
        const f = SIDES[s.side]
        return (
          <group key={i} position={f.position} rotation-y={f.rotationY}>
            <group position={[s.u, s.y, 0]}>
              {square ? (
                <Box s={[0.08, 0.26, 0.09]} p={[0, 0, 0.05]} m={ext.lampBody} />
              ) : (
                <Cyl r={0.045} h={0.24} p={[0, 0, 0.06]} m={ext.lampBody} seg={20} />
              )}
              <Box s={[0.05, 0.004, 0.05]} p={[0, -0.122, 0.055]} m={ext.lampGlow} cast={false} />
              <Box s={[0.05, 0.004, 0.05]} p={[0, 0.122, 0.055]} m={ext.lampGlow} cast={false} />
              {/* up / down wash on the wall */}
              <mesh position={[0, 0.27, 0.006]} scale={[0.42, 0.52, 1]} material={wash}>
                <planeGeometry />
              </mesh>
              <mesh position={[0, -0.85, 0.006]} scale={[0.6, 1.7, 1]} material={wash}>
                <planeGeometry />
              </mesh>
            </group>
          </group>
        )
      })}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* LED cornice (Black Premium)                                         */
/* ------------------------------------------------------------------ */
function Cornice() {
  const ext = useExteriorMats()
  if (!ext.style.ledCornice) return null
  const wash = washMaterial(ext.style.lampColor, 'exterior', 0.35)
  const y = ROOF_Y - 0.13
  return (
    <group>
      {[1, -1].map((sz) => (
        <group key={sz}>
          <Box s={[EXTERIOR.length - 0.4, 0.012, 0.012]} p={[0, y, sz * (HALF_W + 0.012)]} m={ext.cornice} cast={false} />
          <mesh position={[0, y - 0.5, sz * (HALF_W + 0.003)]} rotation-y={sz < 0 ? Math.PI : 0} scale={[EXTERIOR.length * 1.05, 1.2, 1]} material={wash}>
            <planeGeometry />
          </mesh>
        </group>
      ))}
      <Box s={[0.012, 0.012, EXTERIOR.width - 0.4]} p={[HALF_L + 0.012, y, 0]} m={ext.cornice} cast={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Entrance: floating steps + canopy                                   */
/* ------------------------------------------------------------------ */
function Entrance({ layout }: { layout: LayoutDef }) {
  const ext = useExteriorMats()
  const x = layout.entranceX
  const z = HALF_W
  const s = ext.style
  const canopyY = FLOOR_Y + 2.32
  return (
    <group>
      {/* landing + steps (180 mm risers) */}
      <Box s={[1.5, 0.36, 1.0]} p={[x, 0.18, z + 0.5 + 0.02]} m={shared.concrete} />
      <Box s={[1.5, 0.18, 0.42]} p={[x, 0.09, z + 1.02 + 0.21]} m={shared.concrete} />
      <Box s={[1.6, 0.04, 0.6]} p={[x, 0.02, z + 1.55]} m={shared.concrete} />
      {/* doormat recess */}
      <Box s={[0.9, 0.005, 0.5]} p={[x, 0.3625, z + 0.32]} m={shared.black} cast={false} />
      {/* canopy */}
      <Box s={[1.7, 0.07, 1.05]} p={[x, canopyY, z + 0.52]} m={ext.canopy} />
      {s.canopy !== 'steel' && <Box s={[1.72, 0.02, 1.07]} p={[x, canopyY + 0.045, z + 0.52]} m={ext.frame} />}
      {/* house number plaque */}
      <Box s={[0.18, 0.18, 0.012]} p={[x - 0.75, FLOOR_Y + 1.55, z + 0.008]} m={ext.lampBody} cast={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Terrace with outdoor furniture                                      */
/* ------------------------------------------------------------------ */
const deckMat = new THREE.MeshStandardMaterial({
  map: (() => {
    const t = claddingTexture('#a7865f', { board: 0.14, tile: 1.4, gap: 0.008, seed: 99 }).clone()
    t.needsUpdate = true
    t.rotation = Math.PI / 2
    return t
  })(),
  roughness: 0.8,
})
const outdoorFabric = new THREE.MeshStandardMaterial({ color: '#d8d1c4', roughness: 0.95 })
const outdoorFrame = new THREE.MeshStandardMaterial({ color: '#2b2c2e', roughness: 0.5, metalness: 0.5 })

function LoungeChair({ p, r }: { p: [number, number, number]; r: number }) {
  return (
    <group position={p} rotation-y={r}>
      <Box s={[0.62, 0.05, 0.68]} p={[0, 0.3, 0]} m={outdoorFrame} />
      {[-0.28, 0.28].map((x) =>
        [-0.3, 0.3].map((z) => <Box key={`${x}${z}`} s={[0.03, 0.3, 0.03]} p={[x, 0.15, z]} m={outdoorFrame} />),
      )}
      <Box s={[0.6, 0.1, 0.62]} p={[0, 0.38, 0.02]} m={outdoorFabric} />
      <group position={[0, 0.38, -0.3]} rotation-x={-0.35}>
        <Box s={[0.6, 0.5, 0.1]} p={[0, 0.25, 0]} m={outdoorFabric} />
      </group>
    </group>
  )
}

function Terrace({ layout }: { layout: LayoutDef }) {
  const on = useConfig((s) => s.terrace)
  if (!on) return null
  const [x0, x1] = layout.terrace
  const depth = 3.0
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  const top = FLOOR_Y - 0.02
  const z0 = HALF_W
  return (
    <group>
      <Box s={[w, 0.05, depth]} p={[cx, top - 0.025, z0 + depth / 2]} m={deckMat} />
      <Box s={[w - 0.04, top - 0.05, depth - 0.04]} p={[cx, (top - 0.05) / 2, z0 + depth / 2]} m={deckMat} cast={false} />
      {/* wide steps down to the lawn */}
      <Box s={[1.8, 0.05, 0.38]} p={[cx - w / 2 + 1.2, top - 0.19 - 0.025, z0 + depth + 0.19]} m={deckMat} />
      <Box s={[1.8, top - 0.24, 0.34]} p={[cx - w / 2 + 1.2, (top - 0.24) / 2, z0 + depth + 0.19]} m={deckMat} cast={false} />
      {/* furniture */}
      <LoungeChair p={[cx + 0.2, top, z0 + 1.9]} r={Math.PI + 0.35} />
      <LoungeChair p={[cx + 1.2, top, z0 + 1.75]} r={Math.PI - 0.25} />
      <Cyl r={0.24} h={0.42} p={[cx + 0.72, top + 0.21, z0 + 2.35]} m={outdoorFrame} seg={28} />
      <Cyl r={0.26} h={0.02} p={[cx + 0.72, top + 0.43, z0 + 2.35]} m={shared.stoneware} seg={28} />
      {/* planter */}
      <Box s={[0.5, 0.55, 1.4]} p={[x1 - 0.3, top + 0.275, z0 + depth - 0.75]} m={outdoorFrame} />
      <Grasses p={[x1 - 0.3, top + 0.55, z0 + depth - 0.75]} spread={[0.2, 0.6]} />
    </group>
  )
}

/** Clumps of ornamental grass (instanced blades) */
export function Grasses({ p, spread, count = 60, color = '#8b9a5b' }: { p: [number, number, number]; spread: [number, number]; count?: number; color?: string }) {
  const mesh = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.012, 0.55, 3, 1)
    geo.translate(0, 0.275, 0)
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    const m = new THREE.InstancedMesh(geo, mat, count)
    const d = new THREE.Object3D()
    let s = 1
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < count; i++) {
      d.position.set((r() - 0.5) * 2 * spread[0], 0, (r() - 0.5) * 2 * spread[1])
      d.rotation.set((r() - 0.5) * 0.7, r() * Math.PI, (r() - 0.5) * 0.7)
      d.scale.setScalar(0.6 + r() * 0.7)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.castShadow = true
    return m
  }, [count, spread, color])
  return <primitive object={mesh} position={p} />
}

export function ExteriorDetails({ layout }: { layout: LayoutDef }) {
  return (
    <group>
      <WallLights layout={layout} />
      <Cornice />
      <Entrance layout={layout} />
      <Terrace layout={layout} />
      {/* rainwater downpipe at the back-left corner */}
      <Cyl r={0.04} h={EXTERIOR.height} p={[-HALF_L + 0.25, BASE_Y + EXTERIOR.height / 2, -HALF_W - 0.05]} m={shared.steelDark} seg={12} />
    </group>
  )
}
