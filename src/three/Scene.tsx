import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { FLOOR_Y, INTERIOR, ROOF_Y, SECTION_Y } from '../config/dimensions'
import { LAYOUTS } from '../config/layouts'
import { LIGHTING } from '../config/styles'
import type { LayoutDef } from '../config/types'
import { sectionPlane } from '../lib/materials'
import { useConfig } from '../store'
import { PlanDimensions, RoomLabels } from './Annotations'
import { ExteriorDetails } from './building/ExteriorDetails'
import { Partitions } from './building/Partitions'
import { Shell, ShellCaps } from './building/Shell'
import { CameraRig } from './CameraRig'
import { LightingRig } from './environment/LightingRig'
import { Landscape } from './environment/Landscape'
import { FurnitureSet } from './furniture/Furniture'
import { walkBus } from './WalkController'

/** Animates the horizontal section cut used by dollhouse & plan views */
function SectionController({ layout }: { layout: LayoutDef }) {
  const mode = useConfig((s) => s.mode)
  const caps = useRef<THREE.Group>(null)
  const cut = useRef(ROOF_Y + 0.6)
  useFrame((_, dt) => {
    const active = mode === 'dollhouse' || mode === 'topdown'
    const target = active ? SECTION_Y : ROOF_Y + 0.6
    cut.current = THREE.MathUtils.damp(cut.current, target, mode === 'topdown' ? 7 : 2.4, dt)
    const atTop = !active && cut.current > ROOF_Y + 0.5
    sectionPlane.constant = atTop ? 1000 : cut.current
    if (caps.current) {
      caps.current.visible = cut.current < ROOF_Y - 0.05
      caps.current.position.y = cut.current - 0.004
    }
  })
  return (
    <group ref={caps}>
      <ShellCaps layout={layout} />
    </group>
  )
}

/** Invisible interior floor — double-click to walk there in walkthrough mode */
function FloorPicker() {
  const mode = useConfig((s) => s.mode)
  if (mode !== 'walkthrough') return null
  const onDbl = (e: ThreeEvent<MouseEvent>) => {
    const first = e.intersections[0]
    if (first && e.distance > first.distance + 0.6) return
    walkBus.goToPoint?.(e.point.x, e.point.z)
  }
  return (
    <mesh
      position={[0, FLOOR_Y + 0.005, 0]}
      rotation-x={-Math.PI / 2}
      onDoubleClick={onDbl}
      onClick={(e) => {
        // a tap (not the end of a look-around drag) walks there on touch screens
        const moved = Math.hypot(e.nativeEvent.clientX - walkBus.downX, e.nativeEvent.clientY - walkBus.downY)
        if (walkBus.lastPointer === 'touch' && moved < 8) onDbl(e)
      }}
    >
      <planeGeometry args={[INTERIOR.length, INTERIOR.width]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function House({ layout }: { layout: LayoutDef }) {
  return (
    <group>
      <Shell layout={layout} />
      <Partitions layout={layout} />
      <FurnitureSet layout={layout} />
      <ExteriorDetails layout={layout} />
    </group>
  )
}

function Effects() {
  const highQuality = useConfig((s) => s.highQuality)
  const lighting = useConfig((s) => s.lighting)
  const mode = useConfig((s) => s.mode)
  if (!highQuality) {
    return (
      <EffectComposer multisampling={4}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    )
  }
  const night = LIGHTING[lighting].bloom
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        aoRadius={mode === 'exterior' ? 1.2 : 0.7}
        distanceFalloff={0.6}
        intensity={mode === 'topdown' ? 1.5 : 2.6}
        quality="medium"
        halfRes
        screenSpaceRadius={false}
      />
      <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.35 + night * 0.65} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <Vignette offset={0.25} darkness={mode === 'topdown' ? 0.2 : 0.45} />
    </EffectComposer>
  )
}

function World() {
  const layoutId = useConfig((s) => s.layout)
  const layout = LAYOUTS[layoutId]
  return (
    <>
      <CameraRig layout={layout} />
      <LightingRig layout={layout} />
      <House layout={layout} />
      <SectionController layout={layout} />
      <Landscape layout={layout} />
      <RoomLabels layout={layout} />
      <PlanDimensions />
      <FloorPicker />
      <Effects />
    </>
  )
}

export function Scene() {
  const highQuality = useConfig((s) => s.highQuality)
  return (
    <Canvas
      shadows="soft"
      dpr={highQuality ? [1, 2] : [1, 1.5]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        gl.toneMapping = THREE.ACESFilmicToneMapping
      }}
      className="!absolute inset-0"
    >
      <Suspense fallback={null}>
        <World />
        <Preload all />
      </Suspense>
      <AdaptiveDpr pixelated={false} />
    </Canvas>
  )
}
