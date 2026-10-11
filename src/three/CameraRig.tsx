import { CameraControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import CameraControlsImpl from 'camera-controls'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FLOOR_Y } from '../config/dimensions'
import type { LayoutDef } from '../config/types'
import { useConfig } from '../store'
import { WalkController } from './WalkController'

const ACTION = CameraControlsImpl.ACTION

/** Width of the right-hand panel in px that the 3D framing should avoid */
function panelPx(width: number, open: boolean) {
  return open && width >= 900 ? 400 : 0
}

export function CameraRig({ layout }: { layout: LayoutDef }) {
  const mode = useConfig((s) => s.mode)
  const resetNonce = useConfig((s) => s.resetNonce)
  const panelOpen = useConfig((s) => s.panelOpen)
  const controls = useRef<CameraControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const ortho = mode === 'topdown'
  const prevMode = useRef(mode)
  const persp = useRef<THREE.PerspectiveCamera>(null)

  useEffect(() => {
    const c = controls.current
    if (!c || mode === 'walkthrough') return
    const from = prevMode.current
    prevMode.current = mode
    const animate = true
    const off = panelPx(size.width, panelOpen)

    c.smoothTime = 0.55
    c.draggingSmoothTime = 0.12
    c.dollyToCursor = mode !== 'topdown'
    c.infinityDolly = false

    if (from === 'walkthrough') {
      // hand the walkthrough pose back to the orbit controls without a jump
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      const p = camera.position
      c.setLookAt(p.x, p.y, p.z, p.x + dir.x * 3, p.y + dir.y * 3, p.z + dir.z * 3, false)
    }

    if (mode === 'exterior') {
      c.minDistance = 7
      c.maxDistance = 48
      c.minPolarAngle = 0.12
      c.maxPolarAngle = Math.PI * 0.485
      c.minAzimuthAngle = -Infinity
      c.maxAzimuthAngle = Infinity
      c.mouseButtons.left = ACTION.ROTATE
      c.mouseButtons.right = ACTION.TRUCK
      c.mouseButtons.wheel = ACTION.DOLLY
      c.touches.one = ACTION.TOUCH_ROTATE
      c.touches.two = ACTION.TOUCH_DOLLY_TRUCK
      const k = size.width < 700 ? 1.45 : 1
      c.setLookAt(13.6 * k, 4.1 * k, 16.0 * k, 0.2, 1.7, 0, animate)
      c.setFocalOffset(off ? 2.1 : 0, 0, 0, animate)
    } else if (mode === 'dollhouse') {
      c.minDistance = 5
      c.maxDistance = 34
      c.minPolarAngle = 0.08
      c.maxPolarAngle = Math.PI * 0.44
      c.minAzimuthAngle = -Infinity
      c.maxAzimuthAngle = Infinity
      c.mouseButtons.left = ACTION.ROTATE
      c.mouseButtons.right = ACTION.TRUCK
      c.mouseButtons.wheel = ACTION.DOLLY
      c.touches.one = ACTION.TOUCH_ROTATE
      c.touches.two = ACTION.TOUCH_DOLLY_TRUCK
      const k = size.width < 700 ? 1.5 : 1
      // 45° elevation looking at the interior
      c.setLookAt(3.6 * k, FLOOR_Y + 12.4 * k, 12.2 * k, 0.3, FLOOR_Y + 0.2, 0, animate)
      c.setFocalOffset(off ? 1.6 : 0, 0, 0, animate)
    } else if (mode === 'topdown') {
      c.minPolarAngle = 0
      c.maxPolarAngle = 0
      c.minAzimuthAngle = 0
      c.maxAzimuthAngle = 0
      c.mouseButtons.left = ACTION.TRUCK
      c.mouseButtons.right = ACTION.TRUCK
      c.mouseButtons.wheel = ACTION.ZOOM
      c.touches.one = ACTION.TOUCH_TRUCK
      c.touches.two = ACTION.TOUCH_ZOOM_TRUCK
      const visW = size.width - off - 40
      const visH = size.height - 230
      const zoom = Math.max(18, Math.min(visW / 14.6, visH / 6.4))
      c.minZoom = zoom * 0.6
      c.maxZoom = zoom * 6
      c.setLookAt(0, 40, 0.001, 0, 0, 0, false)
      c.setFocalOffset(off / 2 / zoom, -18 / zoom, 0, false)
      c.zoomTo(zoom * 0.82, false)
      c.zoomTo(zoom, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, resetNonce, camera, layout.id])

  // re-frame on panel toggle without changing the orbit
  useEffect(() => {
    const c = controls.current
    if (!c || mode === 'walkthrough') return
    const off = panelPx(size.width, panelOpen)
    if (mode === 'exterior') c.setFocalOffset(off ? 2.1 : 0, 0, 0, true)
    if (mode === 'dollhouse') c.setFocalOffset(off ? 1.6 : 0, 0, 0, true)
    if (mode === 'topdown') c.setFocalOffset(off / 2 / (camera as THREE.OrthographicCamera).zoom, -18 / (camera as THREE.OrthographicCamera).zoom, 0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, size.width])

  // smooth field-of-view change between orbit and eye-level modes
  useFrame((_, dt) => {
    const cam = persp.current
    if (!cam) return
    const target = mode === 'walkthrough' ? (size.width < size.height ? 78 : 66) : size.width < size.height ? 48 : 36
    if (Math.abs(cam.fov - target) > 0.01) {
      cam.fov = THREE.MathUtils.damp(cam.fov, target, 3, dt)
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <PerspectiveCamera ref={persp} makeDefault={!ortho} position={[30, 14, 34]} fov={36} near={0.05} far={6000} />
      <OrthographicCamera makeDefault={ortho} position={[0, 40, 0.001]} zoom={60} near={0.1} far={200} />
      <CameraControls ref={controls} makeDefault enabled={mode !== 'walkthrough'} />
      {mode === 'walkthrough' && <WalkController layout={layout} />}
    </>
  )
}
