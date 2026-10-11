import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EYE_Y, HALF_W, INTERIOR, PARTITION } from '../config/dimensions'
import type { LayoutDef, Viewpoint } from '../config/types'
import { subtractRanges } from '../lib/geometry'
import { useConfig } from '../store'
import { footprint } from './furniture/Furniture'

/** Shared input channel so on-screen controls and the keyboard drive the same walker */
export const walkInput = { forward: 0, strafe: 0, turn: 0 }
export const walkBus: { goToPoint: ((x: number, z: number) => void) | null } = { goToPoint: null }

interface Pose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

const RADIUS = 0.2
const rad = THREE.MathUtils.degToRad

function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function vpPose(v: Viewpoint): Pose {
  return { x: v.x, y: EYE_Y, z: v.z, yaw: rad(v.yaw), pitch: rad(v.pitch ?? -4) }
}

/** Obstacles: partition solids + blocking furniture, as AABBs in plan */
function buildObstacles(layout: LayoutDef) {
  const rects: [number, number, number, number][] = []
  for (const p of layout.partitions) {
    const alongX = p.a[1] === p.b[1]
    const a = alongX ? Math.min(p.a[0], p.b[0]) : Math.min(p.a[1], p.b[1])
    const b = alongX ? Math.max(p.a[0], p.b[0]) : Math.max(p.a[1], p.b[1])
    for (const [s0, s1] of subtractRanges(a, b, (p.openings ?? []).map((o) => [o.from + 0.04, o.to - 0.04]))) {
      if (alongX) rects.push([s0, s1, p.a[1] - PARTITION / 2, p.a[1] + PARTITION / 2])
      else rects.push([p.a[0] - PARTITION / 2, p.a[0] + PARTITION / 2, s0, s1])
    }
  }
  for (const f of layout.furniture) {
    const r = footprint(f)
    if (r) rects.push(r)
  }
  return rects
}

export function WalkController({ layout }: { layout: LayoutDef }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const walkTarget = useConfig((s) => s.walkTarget)
  const walkNonce = useConfig((s) => s.walkNonce)
  const obstacles = useMemo(() => buildObstacles(layout), [layout])
  const keys = useRef<Record<string, boolean>>({})
  const tourIdx = useRef(0)
  const tourWait = useRef(0)

  const s = useRef<{ pose: Pose; queue: Pose[]; inside: boolean }>({
    pose: { x: 0, y: EYE_Y, z: 0, yaw: 0, pitch: 0 },
    queue: [],
    inside: false,
  })

  const blocked = (x: number, z: number) => {
    if (x < INTERIOR.x0 + RADIUS || x > INTERIOR.x1 - RADIUS || z < INTERIOR.z0 + RADIUS || z > INTERIOR.z1 - RADIUS) return true
    for (const [x0, x1, z0, z1] of obstacles) {
      if (x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS) return true
    }
    return false
  }

  // Enter: glide from wherever the orbit camera was, up the path, through the front door.
  useEffect(() => {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const pose = s.current.pose
    pose.x = camera.position.x
    pose.y = camera.position.y
    pose.z = camera.position.z
    pose.yaw = Math.atan2(dir.z, dir.x)
    pose.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
    const outside = Math.abs(pose.x) > INTERIOR.x1 || Math.abs(pose.z) > INTERIOR.z1 || pose.y > EYE_Y + 1.5
    s.current.inside = !outside
    s.current.queue = route(vpPose(layout.viewpoints[0]))
    tourIdx.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Path to a pose; from outside it always goes through the front door */
  function route(to: Pose): Pose[] {
    if (s.current.inside) return [to]
    const ex = layout.entranceX
    const facing = rad(270)
    return [
      { x: ex, y: EYE_Y, z: HALF_W + 3.2, yaw: facing, pitch: rad(-3) },
      { x: ex, y: EYE_Y, z: HALF_W - 0.35, yaw: facing, pitch: rad(-3) },
      to,
    ]
  }

  // Guided jumps to a named viewpoint
  useEffect(() => {
    if (!walkTarget) return
    const v = layout.viewpoints.find((p) => p.id === walkTarget)
    if (v) s.current.queue = route(vpPose(v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkNonce])

  // Layout swapped while walking: move to the new entry point
  useEffect(() => {
    if (s.current.inside) s.current.queue = [vpPose(layout.viewpoints[0])]
  }, [layout])

  // keyboard, drag-to-look, wheel-to-step
  useEffect(() => {
    const el = gl.domElement
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      keys.current[e.code] = true
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    let dragging = false
    let lx = 0
    let ly = 0
    const pd = (e: PointerEvent) => {
      dragging = true
      lx = e.clientX
      ly = e.clientY
    }
    const pm = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      const p = s.current.pose
      p.yaw -= dx * 0.0042
      p.pitch = THREE.MathUtils.clamp(p.pitch + dy * 0.0042, -1.15, 1.0)
      if (Math.abs(dx) + Math.abs(dy) > 1 && s.current.inside) {
        s.current.queue = []
        useConfig.getState().autoTour && useConfig.getState().set({ autoTour: false })
      }
    }
    const pu = () => {
      dragging = false
    }
    const wheel = (e: WheelEvent) => {
      if (!s.current.inside) return
      e.preventDefault()
      s.current.queue = []
      step(-e.deltaY * 0.0022, 0)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      el.removeEventListener('wheel', wheel)
      walkInput.forward = walkInput.strafe = walkInput.turn = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, obstacles])

  // double-click on the floor → walk there
  useEffect(() => {
    walkBus.goToPoint = (x, z) => {
      const p = s.current.pose
      const tx = THREE.MathUtils.clamp(x, INTERIOR.x0 + RADIUS + 0.05, INTERIOR.x1 - RADIUS - 0.05)
      const tz = THREE.MathUtils.clamp(z, INTERIOR.z0 + RADIUS + 0.05, INTERIOR.z1 - RADIUS - 0.05)
      const yaw = Math.atan2(tz - p.z, tx - p.x)
      s.current.queue = [{ x: tx, y: EYE_Y, z: tz, yaw, pitch: rad(-4) }]
      useConfig.getState().set({ autoTour: false })
    }
    return () => {
      walkBus.goToPoint = null
    }
  }, [])

  function step(fwd: number, strafe: number) {
    const p = s.current.pose
    const cx = Math.cos(p.yaw)
    const cz = Math.sin(p.yaw)
    const dx = cx * fwd - cz * strafe
    const dz = cz * fwd + cx * strafe
    const wasBlocked = blocked(p.x, p.z)
    if (!blocked(p.x + dx, p.z) || wasBlocked) p.x += dx
    if (!blocked(p.x, p.z + dz) || wasBlocked) p.z += dz
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const st = s.current
    const p = st.pose
    const k = keys.current
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + walkInput.forward
    const str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + walkInput.strafe
    const turn = (k.ArrowRight || k.KeyE ? 1 : 0) - (k.ArrowLeft || k.KeyQ ? 1 : 0) + walkInput.turn
    const manual = fwd !== 0 || str !== 0 || turn !== 0

    if (manual && st.inside) {
      st.queue = []
      if (useConfig.getState().autoTour) useConfig.getState().set({ autoTour: false })
      const speed = (k.ShiftLeft || k.ShiftRight ? 2.6 : 1.4) * dt
      step(fwd * speed, str * speed)
      p.yaw += turn * 1.6 * dt
      p.pitch = THREE.MathUtils.damp(p.pitch, rad(-3), 1.5, dt)
    } else if (st.queue.length) {
      const t = st.queue[0]
      const dx = t.x - p.x
      const dy = t.y - p.y
      const dz = t.z - p.z
      const dist = Math.hypot(dx, dy, dz)
      const move = Math.min(dist, Math.max(dist * (1 - Math.exp(-2.4 * dt)), (st.inside ? 1.1 : 2.4) * dt))
      if (dist > 1e-4) {
        p.x += (dx / dist) * move
        p.y += (dy / dist) * move
        p.z += (dz / dist) * move
      }
      // look roughly where we are going while travelling, then settle on the target view
      const travelYaw = dist > 0.6 && Math.hypot(dx, dz) > 0.3 ? Math.atan2(dz, dx) : t.yaw
      const wantYaw = st.queue.length > 1 || dist > 0.6 ? travelYaw : t.yaw
      p.yaw += angleDelta(p.yaw, wantYaw) * (1 - Math.exp(-3.2 * dt))
      p.pitch = THREE.MathUtils.damp(p.pitch, dist > 0.6 ? rad(-2) : t.pitch, 3, dt)
      if (dist < 0.02 && Math.abs(angleDelta(p.yaw, t.yaw)) < 0.03) {
        st.queue.shift()
        if (st.queue.length === 0) st.inside = true
      }
      if (Math.abs(p.x) < INTERIOR.x1 - 0.1 && Math.abs(p.z) < INTERIOR.z1 - 0.1 && p.y < EYE_Y + 0.3) st.inside = true
    } else if (useConfig.getState().autoTour) {
      tourWait.current += dt
      if (tourWait.current > 3.2) {
        tourWait.current = 0
        tourIdx.current = (tourIdx.current + 1) % layout.viewpoints.length
        st.queue = [vpPose(layout.viewpoints[tourIdx.current])]
      }
    }

    camera.position.set(p.x, p.y, p.z)
    const dir = new THREE.Vector3(Math.cos(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.sin(p.yaw) * Math.cos(p.pitch))
    camera.lookAt(p.x + dir.x, p.y + dir.y, p.z + dir.z)
  })

  return null
}
