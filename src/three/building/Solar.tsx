import { useMemo } from 'react'
import * as THREE from 'three'
import { HALF_L, ROOF_Y } from '../../config/dimensions'
import { solarTexture } from '../../lib/textures'
import { Box } from '../primitives'

/** 10 × 435 Wp monocrystalline modules (1.134 × 1.722 m), ballasted frames tilted 12° to the front (south). */
export const SOLAR = {
  modules: 10,
  wp: 435,
  w: 1.134,
  l: 1.722,
  tilt: 12,
  /** specific yield for central Europe, kWh per kWp per year */
  yieldPerKwp: 950,
}
export const SOLAR_KWP = (SOLAR.modules * SOLAR.wp) / 1000

const cellMat = new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.12, metalness: 0.35, envMapIntensity: 1.6 })
const frameMat = new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.35, metalness: 0.85 })
const backMat = new THREE.MeshStandardMaterial({ color: '#e9e9e7', roughness: 0.8 })
const ballastMat = new THREE.MeshStandardMaterial({ color: '#8e8b86', roughness: 0.95 })

export function Solar() {
  const tilt = THREE.MathUtils.degToRad(SOLAR.tilt)
  const rise = Math.sin(tilt) * SOLAR.l
  const run = Math.cos(tilt) * SOLAR.l
  const gap = 0.02
  const total = SOLAR.modules * SOLAR.w + (SOLAR.modules - 1) * gap
  const xs = useMemo(() => Array.from({ length: SOLAR.modules }, (_, i) => -total / 2 + SOLAR.w / 2 + i * (SOLAR.w + gap)), [total])
  const low = ROOF_Y + 0.14
  return (
    <group>
      {/* ballast trays + rails */}
      {[-1, 1].map((s) => (
        <Box key={s} s={[total + 0.1, 0.05, 0.1]} p={[0, ROOF_Y + 0.025, s * (run / 2 - 0.15)]} m={frameMat} />
      ))}
      {xs
        .filter((_, i) => i % 2 === 0)
        .map((x) => (
          <group key={x} position={[x + SOLAR.w / 2, 0, 0]}>
            <Box s={[0.35, 0.08, 0.4]} p={[0, ROOF_Y + 0.04, run / 2 - 0.2]} m={ballastMat} />
            <Box s={[0.35, 0.08, 0.4]} p={[0, ROOF_Y + 0.04, -run / 2 + 0.2]} m={ballastMat} />
            <Box s={[0.04, rise + 0.12, 0.04]} p={[0, ROOF_Y + (rise + 0.12) / 2, -run / 2 + 0.05]} m={frameMat} />
          </group>
        ))}
      {/* modules: high edge at the back (−Z), facing the front (+Z) */}
      <group position={[0, low + rise / 2, 0]} rotation-x={tilt}>
        {xs.map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <Box s={[SOLAR.w - 0.03, 0.006, SOLAR.l - 0.03]} p={[0, 0.017, 0]} m={cellMat} cast={false} />
            <Box s={[SOLAR.w, 0.035, SOLAR.l]} p={[0, 0, 0]} m={backMat} />
            <Box s={[SOLAR.w, 0.04, 0.02]} p={[0, 0.003, SOLAR.l / 2 - 0.01]} m={frameMat} />
            <Box s={[SOLAR.w, 0.04, 0.02]} p={[0, 0.003, -SOLAR.l / 2 + 0.01]} m={frameMat} />
            <Box s={[0.02, 0.04, SOLAR.l]} p={[SOLAR.w / 2 - 0.01, 0.003, 0]} m={frameMat} />
            <Box s={[0.02, 0.04, SOLAR.l]} p={[-SOLAR.w / 2 + 0.01, 0.003, 0]} m={frameMat} />
          </group>
        ))}
      </group>
      {/* cable duct to the inverter */}
      <Box s={[0.08, 0.05, 0.6]} p={[-HALF_L + 0.6, ROOF_Y + 0.025, -0.6]} m={frameMat} />
    </group>
  )
}
