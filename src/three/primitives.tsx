import { RoundedBox } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { boxGeo } from '../lib/geometry'

type V3 = [number, number, number]

interface BoxProps extends Omit<ThreeElements['mesh'], 'args'> {
  /** width, height, depth in metres */
  s: V3
  p?: V3
  m: THREE.Material
  cast?: boolean
  receive?: boolean
}

/** Shadow-casting box with metre-scaled UVs */
export function Box({ s, p, m, cast = true, receive = true, ...rest }: BoxProps) {
  return <mesh geometry={boxGeo(s[0], s[1], s[2])} material={m} position={p} castShadow={cast} receiveShadow={receive} {...rest} />
}

interface SoftProps {
  s: V3
  p?: V3
  m: THREE.Material
  r?: number
  rotation?: V3
  cast?: boolean
}

/** Rounded upholstery block */
export function Soft({ s, p, m, r = 0.04, rotation, cast = true }: SoftProps) {
  const radius = Math.min(r, s[0] / 2 - 0.001, s[1] / 2 - 0.001, s[2] / 2 - 0.001)
  return (
    <RoundedBox args={s} radius={radius} smoothness={3} position={p} rotation={rotation} material={m} castShadow={cast} receiveShadow />
  )
}

interface CylProps {
  r: number
  h: number
  p?: V3
  m: THREE.Material
  r2?: number
  seg?: number
  rotation?: V3
  cast?: boolean
}

export function Cyl({ r, h, p, m, r2, seg = 24, rotation, cast = true }: CylProps) {
  return (
    <mesh position={p} rotation={rotation} material={m} castShadow={cast} receiveShadow>
      <cylinderGeometry args={[r2 ?? r, r, h, seg]} />
    </mesh>
  )
}
