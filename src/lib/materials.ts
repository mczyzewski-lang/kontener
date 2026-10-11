import * as THREE from 'three'
import { useMemo } from 'react'
import { EXTERIORS, INTERIORS, type ExteriorStyle, type Finish, type InteriorStyle } from '../config/styles'
import type { ExteriorId, InteriorId } from '../config/types'
import { useConfig } from '../store'
import {
  brickTexture,
  charredTexture,
  claddingTexture,
  concreteTexture,
  fabricTexture,
  panelTexture,
  rotated90,
  stackedStoneBump,
  stackedStoneTexture,
  stoneTexture,
  tileTexture,
  radialTexture,
  woodTexture,
} from './textures'

/* ------------------------------------------------------------------ */
/* Section (cut) plane shared by every building material.              */
/* Keeps y < constant. A huge constant = no cut.                       */
/* ------------------------------------------------------------------ */
export const sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000)
const CLIP = [sectionPlane]

/* ------------------------------------------------------------------ */
/* Glow registry — the lighting rig drives emissive intensities.       */
/* ------------------------------------------------------------------ */
export type GlowKind = 'interior' | 'exterior' | 'led' | 'screen'
export const glowRegistry = new Set<{ mat: THREE.MeshStandardMaterial; kind: GlowKind; base: number }>()
function glow(color: string, kind: GlowKind, base: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: new THREE.Color(color),
    emissiveIntensity: 0,
    roughness: 0.6,
    toneMapped: true,
    clippingPlanes: CLIP,
    ...extra,
  })
  glowRegistry.add({ mat, kind, base })
  return mat
}

type Std = THREE.MeshStandardMaterialParameters
const std = (p: Std, clip = false) =>
  new THREE.MeshStandardMaterial({ ...p, ...(clip ? { clippingPlanes: CLIP, clipShadows: true } : {}) })
const phys = (p: THREE.MeshPhysicalMaterialParameters, clip = false) =>
  new THREE.MeshPhysicalMaterial({ ...p, ...(clip ? { clippingPlanes: CLIP, clipShadows: true } : {}) })

/* ------------------------------------------------------------------ */
/* Interior                                                            */
/* ------------------------------------------------------------------ */
export interface InteriorMats {
  style: InteriorStyle
  wall: THREE.MeshStandardMaterial
  ceiling: THREE.MeshStandardMaterial
  floor: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  woodAccent: THREE.MeshStandardMaterial
  front: THREE.MeshStandardMaterial
  carcass: THREE.MeshStandardMaterial
  countertop: THREE.MeshStandardMaterial
  sofa: THREE.MeshStandardMaterial
  accentFabric: THREE.MeshStandardMaterial
  bedding: THREE.MeshStandardMaterial
  throwMat: THREE.MeshStandardMaterial
  rug: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  bathWall: THREE.MeshStandardMaterial
  bathFloor: THREE.MeshStandardMaterial
  paneling: THREE.MeshStandardMaterial
  doorLeaf: THREE.MeshStandardMaterial
  lampShade: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
  led: THREE.MeshStandardMaterial
  leather: THREE.MeshStandardMaterial
}

const interiorCache = new Map<InteriorId, InteriorMats>()

export function getInteriorMats(id: InteriorId): InteriorMats {
  const hit = interiorCache.get(id)
  if (hit) return hit
  const s = INTERIORS[id]
  const floorMap =
    s.floorKind === 'planks'
      ? woodTexture(s.floor, { plank: s.floorPlankWidth, tile: 2.4, seed: 17 })
      : concreteTexture(s.floor, { tile: 2.5, seed: 8, strength: 1.4 })
  const floorBump =
    s.floorKind === 'planks'
      ? woodTexture(s.floor, { plank: s.floorPlankWidth, tile: 2.4, seed: 17, bump: true })
      : concreteTexture(s.floor, { tile: 2.5, seed: 8, bump: true })
  const woodMap = woodTexture(s.wood, { tile: 1.2, boards: false, seed: 29 })
  const woodAccMap = woodTexture(s.woodAccent, { tile: 1.2, boards: false, seed: 33 })
  const counterMap =
    s.countertopKind === 'stone'
      ? stoneTexture(s.countertop, { tile: 1.4, seed: 5 })
      : s.countertopKind === 'concrete'
        ? concreteTexture(s.countertop, { tile: 1.5, seed: 61, strength: 1.2 })
        : stoneTexture(s.countertop, { tile: 1.0, seed: 3, vein: '#d7cfc3' })
  const bathMap =
    s.bathStoneKind === 'tile'
      ? tileTexture(s.bathStone, s.grout, { tileW: 0.3, tileH: 0.6, tile: 1.2 })
      : s.bathStoneKind === 'stone'
        ? stoneTexture(s.bathStone, { tile: 1.2, seed: 77 })
        : concreteTexture(s.bathStone, { tile: 2, seed: 19, strength: 1.3 })
  const bathFloorMap =
    s.bathStoneKind === 'tile'
      ? tileTexture(s.bathStone, s.grout, { tileW: 0.6, tileH: 0.6, tile: 1.2, seed: 2 })
      : bathMap
  const isLux = id === 'luxury'
  const mats: InteriorMats = {
    style: s,
    wall: std({ color: s.wall, roughness: 0.92, map: concreteTexture('#ffffff', { tile: 3, strength: 0.25, pores: false, seed: 91 }) }, true),
    ceiling: std({ color: s.ceiling, roughness: 0.95 }, true),
    floor: std({
      map: floorMap,
      bumpMap: floorBump,
      bumpScale: s.floorKind === 'planks' ? 0.6 : 0.25,
      roughness: s.floorKind === 'planks' ? 0.55 : 0.62,
      metalness: 0,
    }),
    wood: std({ map: woodMap, roughness: isLux ? 0.42 : 0.6 }, true),
    woodAccent: std({ map: woodAccMap, roughness: 0.5 }, true),
    front: s.cabinet ? std({ color: s.cabinet, roughness: 0.55 }, true) : std({ map: woodMap, roughness: isLux ? 0.4 : 0.58 }, true),
    carcass: std({ color: s.cabinet ?? s.wall, roughness: 0.7 }, true),
    countertop: std({ map: counterMap, roughness: s.countertopKind === 'quartz' ? 0.25 : 0.4 }, true),
    sofa: std({ map: fabricTexture(s.sofa, { boucle: id === 'japandi', seed: 3 }), roughness: 0.95 }, true),
    accentFabric: std({ map: fabricTexture(s.accentFabric, { seed: 9 }), roughness: 0.9 }, true),
    bedding: std({ map: fabricTexture(s.bedding, { seed: 12, tile: 0.4 }), roughness: 0.95 }, true),
    throwMat: std({ map: fabricTexture(s.throwColor, { seed: 15, tile: 0.18 }), roughness: 0.95 }, true),
    rug: std({ map: fabricTexture(s.rug, { seed: 21, tile: 0.35, boucle: true }), roughness: 1 }, true),
    metal: std({ color: s.metal, roughness: s.metalRough, metalness: s.metalMetalness }, true),
    bathWall: std({ map: bathMap, roughness: 0.35 }, true),
    bathFloor: std({ map: bathFloorMap, roughness: 0.45 }, true),
    paneling:
      s.paneling === 'walnut'
        ? std({ map: claddingTexture(s.wood, { board: 0.06, tile: 0.96, gap: 0.006, seed: 3 }), roughness: 0.45 }, true)
        : std({ map: claddingTexture(s.woodAccent, { board: 0.045, tile: 0.72, gap: 0.012, seed: 8 }), roughness: 0.6 }, true),
    doorLeaf: s.cabinet ? std({ color: s.wall, roughness: 0.6 }, true) : std({ map: woodMap, roughness: 0.55 }, true),
    lampShade: std({ color: isLux ? '#e9dcc6' : '#f3eee5', roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(s.light), emissiveIntensity: 0 }, true),
    glow: glow(s.light, 'interior', 4.5),
    led: glow(s.ledColor, 'led', s.ledIntensity * 2.2),
    leather: std({ color: isLux ? '#7d4b2a' : id === 'japandi' ? '#9a7656' : '#3a3836', roughness: 0.55 }, true),
  }
  // lamp shades glow softly with the interior lights
  glowRegistry.add({ mat: mats.lampShade, kind: 'interior', base: 0.9 })
  interiorCache.set(id, mats)
  return mats
}

export function useInteriorMats() {
  const id = useConfig((s) => s.interior)
  return useMemo(() => getInteriorMats(id), [id])
}

/* ------------------------------------------------------------------ */
/* Exterior                                                            */
/* ------------------------------------------------------------------ */
export interface ExteriorMats {
  style: ExteriorStyle
  longSkin: THREE.MeshStandardMaterial
  endSkin: THREE.MeshStandardMaterial
  /** flat dark trims: base band, corner trims, roof-edge flashing */
  trim: THREE.MeshStandardMaterial
  base: THREE.MeshStandardMaterial
  roofEdge: THREE.MeshStandardMaterial
  roof: THREE.MeshStandardMaterial
  windowFrame: THREE.MeshStandardMaterial
  reveal: THREE.MeshStandardMaterial
  door: THREE.MeshStandardMaterial
  accent: THREE.MeshStandardMaterial
  canopy: THREE.MeshStandardMaterial
  lampBody: THREE.MeshStandardMaterial
  lampGlow: THREE.MeshStandardMaterial
  cornice: THREE.MeshStandardMaterial
}

const exteriorCache = new Map<ExteriorId, ExteriorMats>()

function finishMaterial(f: Finish): THREE.MeshStandardMaterial {
  const c = f.color
  switch (f.kind) {
    case 'vboards':
      return std(
        {
          map: claddingTexture(c, { board: 0.11, tile: 1.32, seed: 13 }),
          bumpMap: claddingTexture(c, { board: 0.11, tile: 1.32, seed: 13, bump: true }),
          bumpScale: 1.5,
          roughness: 0.72,
        },
        true,
      )
    case 'hboards': {
      const map = rotated90(claddingTexture(c, { board: 0.13, tile: 1.3, seed: 31 }), `h:${c}`)
      const bump = rotated90(claddingTexture(c, { board: 0.13, tile: 1.3, seed: 31, bump: true }), `hb:${c}`, false)
      return std({ map, bumpMap: bump, bumpScale: 1.5, roughness: 0.7 }, true)
    }
    case 'panels':
      return std(
        {
          map: panelTexture(c, { w: 1.25, h: 2.5, tile: 2.5 }),
          bumpMap: panelTexture(c, { w: 1.25, h: 2.5, tile: 2.5, bump: true }),
          bumpScale: 1.2,
          roughness: 0.62,
          metalness: 0.15,
        },
        true,
      )
    case 'seam':
      return std(
        {
          map: panelTexture(c, { w: 0.5, h: 10, tile: 2, seam: true, seed: 9 }),
          bumpMap: panelTexture(c, { w: 0.5, h: 10, tile: 2, seam: true, seed: 9, bump: true }),
          bumpScale: 2,
          roughness: 0.45,
          metalness: 0.55,
        },
        true,
      )
    case 'brick':
      return std({ map: brickTexture(c), bumpMap: brickTexture(c, { bump: true }), bumpScale: 2.5, roughness: 0.88 }, true)
    case 'charred':
      return std({ map: charredTexture(), bumpMap: charredTexture({ bump: true }), bumpScale: 2.5, roughness: 0.82, metalness: 0.05 }, true)
    default:
      return std({ map: concreteTexture(c, { tile: 4, seed: 51, strength: 0.6, pores: false }), roughness: 0.9 }, true)
  }
}

export function getExteriorMats(id: ExteriorId): ExteriorMats {
  const hit = exteriorCache.get(id)
  if (hit) return hit
  const s = EXTERIORS[id]
  const render = (c: string) => std({ map: concreteTexture(c, { tile: 4, seed: 51, strength: 0.6, pores: false }), roughness: 0.9 }, true)
  const oak = (c: string) =>
    std(
      {
        map: claddingTexture(c, { board: 0.09, tile: 1.08, seed: 23, gap: 0.01 }),
        bumpMap: claddingTexture(c, { board: 0.09, tile: 1.08, seed: 23, gap: 0.01, bump: true }),
        bumpScale: 1.2,
        roughness: 0.6,
      },
      true,
    )
  const accent =
    s.accent === 'stone'
      ? std({ map: stackedStoneTexture(s.accentColor), bumpMap: stackedStoneBump(s.accentColor), bumpScale: 3, roughness: 0.9 }, true)
      : oak(s.accentColor)
  const doorMat =
    s.doorKind === 'oak'
      ? std({ map: woodTexture(s.door, { boards: false, tile: 1.2, seed: 81 }), roughness: 0.55 }, true)
      : s.doorKind === 'timberBlack'
        ? std({ map: claddingTexture(s.door, { board: 0.08, tile: 0.96, gap: 0.01, seed: 4 }), roughness: 0.55 }, true)
        : std({ color: s.door, roughness: 0.45, metalness: 0.4 }, true)
  const metal = (c: string) => std({ color: c, roughness: 0.5, metalness: 0.45 }, true)
  const mats: ExteriorMats = {
    style: s,
    longSkin: finishMaterial(s.long),
    endSkin: finishMaterial(s.end),
    trim: metal(s.cornerTrim ?? s.roofEdge),
    base: s.long.kind === 'render' ? render(s.base) : metal(s.base),
    roofEdge: metal(s.roofEdge),
    roof: std({ map: concreteTexture('#4b4d50', { tile: 3, seed: 12, strength: 0.8 }), roughness: 0.92 }, true),
    windowFrame: std({ color: s.windowFrame, roughness: 0.4, metalness: 0.55 }, true),
    reveal: s.id === 'charred' ? oak(s.reveal) : s.long.kind === 'render' ? render(s.reveal) : metal(s.reveal),
    door: doorMat,
    accent,
    canopy:
      s.canopy === 'timber'
        ? std({ map: woodTexture('#4a3426', { boards: false, tile: 1.2, seed: 2 }), roughness: 0.6 }, true)
        : s.canopy === 'oak'
          ? oak(s.accentColor)
          : s.canopy === 'render'
            ? render('#bdb5a9')
            : metal(s.roofEdge),
    lampBody: std({ color: s.windowFrame, roughness: 0.45, metalness: 0.6 }, true),
    lampGlow: glow(s.lampColor, 'exterior', 6 * s.lampIntensity),
    cornice: glow(s.lampColor, 'exterior', s.ledCornice ? 5 : 0),
  }
  exteriorCache.set(id, mats)
  return mats
}

export function useExteriorMats() {
  const id = useConfig((s) => s.exterior)
  return useMemo(() => getExteriorMats(id), [id])
}

/* ------------------------------------------------------------------ */
/* Shared neutral materials                                            */
/* ------------------------------------------------------------------ */
export const shared = {
  glass: std(
    { color: '#bfd2db', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 2.2, depthWrite: false },
    true,
  ),
  showerGlass: phys({ color: '#e8f2f2', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 2, depthWrite: false }, true),
  mirror: std({ color: '#d9dfe2', roughness: 0.02, metalness: 1, envMapIntensity: 1.6 }, true),
  ceramic: std({ color: '#f7f6f3', roughness: 0.12, metalness: 0 }, true),
  chrome: std({ color: '#e3e3e3', roughness: 0.12, metalness: 1 }, true),
  blackGlass: std({ color: '#0d0e10', roughness: 0.08, metalness: 0.3 }, true),
  steel: std({ color: '#b9bcbf', roughness: 0.32, metalness: 0.9 }, true),
  black: std({ color: '#151515', roughness: 0.6, metalness: 0.2 }, true),
  white: std({ color: '#f2f1ee', roughness: 0.6 }, true),
  leaf: std({ color: '#47652e', roughness: 0.75, side: THREE.DoubleSide }, true),
  leafLight: std({ color: '#6d8a3e', roughness: 0.75, side: THREE.DoubleSide }, true),
  olive: std({ color: '#7e8e64', roughness: 0.8, side: THREE.DoubleSide }, true),
  soil: std({ color: '#3a2c22', roughness: 1 }, true),
  terracotta: std({ color: '#b98a6a', roughness: 0.85 }, true),
  stoneware: std({ color: '#d8d2c8', roughness: 0.7 }, true),
  darkStoneware: std({ color: '#3b3a38', roughness: 0.7 }, true),
  water: std({ color: '#aac3c9', roughness: 0.05, metalness: 0.2 }, true),
  screen: glow('#7fa6c9', 'screen', 0.35, { color: '#0a0b0c', roughness: 0.15 }),
  concrete: std({ map: concreteTexture('#a8a39b', { tile: 2, seed: 70 }), roughness: 0.9 }, true),
  plinth: std({ map: concreteTexture('#8f8a83', { tile: 2, seed: 71 }), roughness: 0.92 }, true),
  steelDark: std({ color: '#2a2c2f', roughness: 0.5, metalness: 0.6 }, true),
  seal: std({ color: '#1a1a1a', roughness: 0.8 }, true),
  ceilingShadow: std({ color: '#222', roughness: 1 }, true),
  poche: new THREE.MeshBasicMaterial({ color: '#2a2b2e' }),
  capFacade: new THREE.MeshBasicMaterial({ color: '#5b5650' }),
  capInsulation: new THREE.MeshBasicMaterial({ color: '#e9dca6' }),
  capSteel: new THREE.MeshBasicMaterial({ color: '#141517' }),
  capLining: new THREE.MeshBasicMaterial({ color: '#c9c2b6' }),
  pocheLight: new THREE.MeshBasicMaterial({ color: '#3b3d41' }),
}

export const bookColors = ['#7b6a58', '#b9a183', '#3f4a52', '#8d4f3a', '#d8cfbf', '#5f6b52', '#2e2b28', '#a68a63'].map(
  (c) => std({ color: c, roughness: 0.8 }, true),
)

/* ------------------------------------------------------------------ */
/* Additive light "washes" (fake light pools on walls / ground)        */
/* ------------------------------------------------------------------ */
export const fadeRegistry = new Set<{ mat: THREE.MeshBasicMaterial; kind: GlowKind; base: number }>()
const washCache = new Map<string, THREE.MeshBasicMaterial>()
export function washMaterial(color: string, kind: GlowKind = 'exterior', base = 0.55, clip = true) {
  const key = `${color}:${kind}:${base}:${clip}`
  let m = washCache.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      map: radialTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      ...(clip ? { clippingPlanes: CLIP } : {}),
    })
    fadeRegistry.add({ mat: m, kind, base })
    washCache.set(key, m)
  }
  return m
}
