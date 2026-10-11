import { Environment, Lightformer, Sky, Stars } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CEIL_Y } from '../../config/dimensions'
import { INTERIORS, LIGHTING, EXTERIORS } from '../../config/styles'
import type { LayoutDef } from '../../config/types'
import { fadeRegistry, glowRegistry } from '../../lib/materials'
import { useConfig } from '../../store'
import { exteriorLightSpots } from '../building/lightSpots'

const deg = THREE.MathUtils.degToRad

function sunVector(el: number, az: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(deg(az)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(az)) * Math.cos(deg(el)))
}

/**
 * Drives sun, sky, fog, environment, interior & exterior artificial light.
 * Every value is damped towards the active preset so Day → Sunset → Night
 * blends continuously instead of popping.
 */
export function LightingRig({ layout }: { layout: LayoutDef }) {
  const lighting = useConfig((s) => s.lighting)
  const interiorId = useConfig((s) => s.interior)
  const exteriorId = useConfig((s) => s.exterior)
  const highQuality = useConfig((s) => s.highQuality)
  const scene = useThree((s) => s.scene)

  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sky = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Points>(null)
  const interiorLights = useRef<(THREE.PointLight | null)[]>([])
  const exteriorLights = useRef<(THREE.PointLight | null)[]>([])

  const spots = useMemo(() => exteriorLightSpots(layout).sort((a, b) => Number(b.primary) - Number(a.primary)).slice(0, 4), [layout])

  // animated state
  const st = useRef({
    skyEl: LIGHTING[lighting].elevation,
    skyAz: LIGHTING[lighting].azimuth,
    lightDir: sunVector(LIGHTING[lighting].elevation, LIGHTING[lighting].azimuth),
    sunI: LIGHTING[lighting].sunIntensity,
    sunC: new THREE.Color(LIGHTING[lighting].sunColor),
    hemiI: LIGHTING[lighting].hemiIntensity,
    hemiSky: new THREE.Color(LIGHTING[lighting].hemiSky),
    hemiGround: new THREE.Color(LIGHTING[lighting].hemiGround),
    env: LIGHTING[lighting].envIntensity,
    fog: new THREE.Color(LIGHTING[lighting].fog),
    turbidity: LIGHTING[lighting].turbidity,
    rayleigh: LIGHTING[lighting].rayleigh,
    mie: LIGHTING[lighting].mie,
    interior: LIGHTING[lighting].interior,
    exterior: LIGHTING[lighting].exterior,
    stars: LIGHTING[lighting].stars,
  })

  const tmpV = useMemo(() => new THREE.Vector3(), [])
  const tmpC = useMemo(() => new THREE.Color(), [])
  const fog = useMemo(() => new THREE.Fog(LIGHTING[lighting].fog, 45, 190), []) // eslint-disable-line react-hooks/exhaustive-deps
  scene.fog = fog

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const p = LIGHTING[lighting]
    const s = st.current
    const k = 2.2
    const d = (a: number, b: number) => THREE.MathUtils.damp(a, b, k, dt)
    s.skyEl = d(s.skyEl, p.elevation)
    s.skyAz = d(s.skyAz, p.azimuth)
    // the shadow-casting light is the moon at night: keep it high
    const lightEl = p.elevation < 0 ? 42 : p.elevation
    const lightAz = p.elevation < 0 ? -35 : p.azimuth
    s.lightDir.lerp(sunVector(Math.max(lightEl, 7), lightAz, tmpV), 1 - Math.exp(-k * dt)).normalize()
    s.sunI = d(s.sunI, p.sunIntensity)
    s.sunC.lerp(tmpC.set(p.sunColor), 1 - Math.exp(-k * dt))
    s.hemiI = d(s.hemiI, p.hemiIntensity)
    s.hemiSky.lerp(tmpC.set(p.hemiSky), 1 - Math.exp(-k * dt))
    s.hemiGround.lerp(tmpC.set(p.hemiGround), 1 - Math.exp(-k * dt))
    s.env = d(s.env, p.envIntensity)
    s.fog.lerp(tmpC.set(p.fog), 1 - Math.exp(-k * dt))
    s.turbidity = d(s.turbidity, p.turbidity)
    s.rayleigh = d(s.rayleigh, p.rayleigh)
    s.mie = d(s.mie, p.mie)
    s.interior = d(s.interior, p.interior)
    s.exterior = d(s.exterior, p.exterior)
    s.stars = d(s.stars, p.stars)

    if (sun.current) {
      sun.current.position.copy(s.lightDir).multiplyScalar(40)
      sun.current.intensity = s.sunI
      sun.current.color.copy(s.sunC)
    }
    if (hemi.current) {
      hemi.current.intensity = s.hemiI
      hemi.current.color.copy(s.hemiSky)
      hemi.current.groundColor.copy(s.hemiGround)
    }
    scene.environmentIntensity = s.env
    fog.color.copy(s.fog)
    if (sky.current) {
      const u = (sky.current.material as THREE.ShaderMaterial).uniforms
      u.sunPosition.value.copy(sunVector(s.skyEl, s.skyAz, tmpV))
      u.turbidity.value = s.turbidity
      u.rayleigh.value = s.rayleigh
      u.mieCoefficient.value = s.mie
    }
    if (stars.current) {
      stars.current.visible = s.stars > 0.05
      ;(stars.current.material as THREE.ShaderMaterial).opacity = s.stars
    }

    const ist = INTERIORS[interiorId]
    interiorLights.current.forEach((l) => {
      if (!l) return
      l.intensity = s.interior * 3.2 * ist.lightIntensity
      l.color.set(ist.light)
    })
    const est = EXTERIORS[exteriorId]
    exteriorLights.current.forEach((l) => {
      if (!l) return
      l.intensity = s.exterior * 2.4 * est.lampIntensity
      l.color.set(est.lampColor)
    })
    for (const g of glowRegistry) {
      const level = g.kind === 'interior' ? s.interior : g.kind === 'led' ? s.interior : g.kind === 'screen' ? 1 : s.exterior
      // lamps still read as "on" during the day, just faintly
      const floor = g.kind === 'interior' ? 0.12 : 0
      g.mat.emissiveIntensity = g.base * Math.max(level, floor)
    }
    for (const f of fadeRegistry) {
      const level = f.kind === 'exterior' ? s.exterior : s.interior
      f.mat.opacity = f.base * level
      f.mat.visible = level > 0.01
    }
  })

  const shadowSize = highQuality ? 4096 : 2048

  return (
    <>
      <Sky ref={sky as never} distance={4000} sunPosition={[1, 0.5, 1]} mieDirectionalG={0.85} />
      <Stars ref={stars as never} radius={300} depth={80} count={2500} factor={5} saturation={0} fade speed={0.3} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.025}
        shadow-radius={4}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      {layout.lights.map(([x, z], i) => (
        <pointLight
          key={`i${i}`}
          ref={(el) => {
            interiorLights.current[i] = el
          }}
          position={[x, CEIL_Y - 0.4, z]}
          distance={6}
          decay={2}
          intensity={0}
        />
      ))}
      {spots.map((sp, i) => (
        <pointLight
          key={`e${i}`}
          ref={(el) => {
            exteriorLights.current[i] = el
          }}
          position={[sp.world[0], sp.world[1] - 0.3, sp.world[2] + (sp.side === 'front' ? 0.25 : sp.side === 'back' ? -0.25 : 0)]}
          distance={7}
          decay={2}
          intensity={0}
        />
      ))}
      {/* studio-style environment for believable reflections on glass & metal */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#cfe0ff" position={[0, 4, 30]} scale={[60, 8, 1]} />
        <Lightformer form="rect" intensity={1.0} color="#fff1dd" position={[30, 4, 0]} rotation-y={-Math.PI / 2} scale={[60, 8, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#dfe9ff" position={[-30, 4, 0]} rotation-y={Math.PI / 2} scale={[60, 8, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#b8b0a0" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[60, 60, 1]} />
      </Environment>
    </>
  )
}
