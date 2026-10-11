import type { ExteriorId, InteriorId, LightingId } from './types'

export type FloorKind = 'planks' | 'concrete'

export interface InteriorStyle {
  id: InteriorId
  name: string
  subtitle: string
  swatches: string[]
  wall: string
  ceiling: string
  floorKind: FloorKind
  floor: string
  floorPlankWidth: number
  /** main joinery timber */
  wood: string
  /** secondary timber (shelves, legs, accents) */
  woodAccent: string
  /** painted cabinet fronts — null means timber fronts */
  cabinet: string | null
  countertop: string
  countertopKind: 'quartz' | 'stone' | 'concrete'
  sofa: string
  accentFabric: string
  bedding: string
  throwColor: string
  rug: string
  /** metal accents: black steel, brushed brass … */
  metal: string
  metalRough: number
  metalMetalness: number
  bathStone: string
  bathStoneKind: 'tile' | 'stone' | 'concrete'
  grout: string
  /** colour temperature of the interior lighting */
  light: string
  lightIntensity: number
  /** architectural LED strips (coves, toe kicks, shelves) */
  ledStrips: boolean
  ledColor: string
  ledIntensity: number
  /** feature-wall panelling behind beds/sofas */
  paneling: 'none' | 'slats' | 'walnut'
}

export const INTERIORS: Record<InteriorId, InteriorStyle> = {
  japandi: {
    id: 'japandi',
    name: 'Japandi',
    subtitle: 'Light oak · warm white · linen',
    swatches: ['#d6b88f', '#f2ede4', '#e3d9c8', '#2b2b2b'],
    wall: '#f1ece3',
    ceiling: '#f5f1ea',
    floorKind: 'planks',
    floor: '#c9a67a',
    floorPlankWidth: 0.19,
    wood: '#d3b48a',
    woodAccent: '#b7956b',
    cabinet: null,
    countertop: '#ece6dc',
    countertopKind: 'quartz',
    sofa: '#e2d8c6',
    accentFabric: '#bfa98a',
    bedding: '#efe9de',
    throwColor: '#c4ae8e',
    rug: '#ddd2bf',
    metal: '#2a2826',
    metalRough: 0.55,
    metalMetalness: 0.4,
    bathStone: '#ddd5c8',
    bathStoneKind: 'tile',
    grout: '#cbc2b3',
    light: '#ffcf96',
    lightIntensity: 1,
    ledStrips: true,
    ledColor: '#ffcb8a',
    ledIntensity: 1.6,
    paneling: 'slats',
  },
  luxury: {
    id: 'luxury',
    name: 'Modern Luxury',
    subtitle: 'Walnut · travertine · brushed brass',
    swatches: ['#5b3b27', '#b9a58a', '#4f4a44', '#b8925a'],
    wall: '#d8cfc3',
    ceiling: '#e8e1d7',
    floorKind: 'planks',
    floor: '#5e3f2a',
    floorPlankWidth: 0.24,
    wood: '#5a3a26',
    woodAccent: '#3f2a1c',
    cabinet: null,
    countertop: '#c3b39c',
    countertopKind: 'stone',
    sofa: '#6d6156',
    accentFabric: '#8a5734',
    bedding: '#ebe4d9',
    throwColor: '#3d3832',
    rug: '#8f7f6d',
    metal: '#c19a5e',
    metalRough: 0.32,
    metalMetalness: 1,
    bathStone: '#bca88c',
    bathStoneKind: 'stone',
    grout: '#a8957a',
    light: '#ffc58a',
    lightIntensity: 1.15,
    ledStrips: true,
    ledColor: '#ffbf75',
    ledIntensity: 3.2,
    paneling: 'walnut',
  },
  minimal: {
    id: 'minimal',
    name: 'Contemporary Minimalist',
    subtitle: 'Warm concrete · light grey · oak',
    swatches: ['#b3ada5', '#e6e4e0', '#c8a77f', '#1c1c1c'],
    wall: '#e7e5e1',
    ceiling: '#f2f1ee',
    floorKind: 'concrete',
    floor: '#b4ada4',
    floorPlankWidth: 0.2,
    wood: '#c9a77d',
    woodAccent: '#b38f63',
    cabinet: '#e2e0dc',
    countertop: '#9e9890',
    countertopKind: 'concrete',
    sofa: '#c3c0ba',
    accentFabric: '#8d8780',
    bedding: '#f2f1ee',
    throwColor: '#a19c95',
    rug: '#cdc8c0',
    metal: '#1b1b1b',
    metalRough: 0.5,
    metalMetalness: 0.5,
    bathStone: '#aaa59d',
    bathStoneKind: 'concrete',
    grout: '#97928a',
    light: '#ffe6c7',
    lightIntensity: 1.25,
    ledStrips: false,
    ledColor: '#ffe2bd',
    ledIntensity: 1.2,
    paneling: 'none',
  },
}

export type FinishKind = 'vboards' | 'hboards' | 'panels' | 'seam' | 'render' | 'brick' | 'charred'

export interface Finish {
  kind: FinishKind
  color: string
}

export interface ExteriorStyle {
  id: ExteriorId
  name: string
  subtitle: string
  swatches: string[]
  /** finish of the long façades (front / back) */
  long: Finish
  /** finish of the short ends */
  end: Finish
  /** window frames, flashing, lamp bodies */
  windowFrame: string
  /** roof-edge flashing / parapet cap */
  roofEdge: string
  /** base band at the bottom of the façade */
  base: string
  /** exterior reveals of openings */
  reveal: string
  door: string
  doorKind: 'oak' | 'timberBlack' | 'anthracite' | 'white'
  /** decorative accent panels around the entrance / one end */
  accent: 'none' | 'timber' | 'stone' | 'oak'
  accentColor: string
  /** charcoal corner trims (board façades) */
  cornerTrim: string | null
  lampColor: string
  lampIntensity: number
  /** linear LED strip under the roof edge */
  ledCornice: boolean
  canopy: 'steel' | 'timber' | 'render' | 'oak'
  /** protruding box frames around windows: depth per opening type */
  boxFrames: { picture: number; window: number }
}

export const EXTERIORS: Record<ExteriorId, ExteriorStyle> = {
  wood: {
    id: 'wood',
    name: 'Modern Wood',
    subtitle: 'Vertical oak cladding · charcoal standing seam',
    swatches: ['#c19a6b', '#2c2e31', '#8f6f4c'],
    long: { kind: 'vboards', color: '#c39a69' },
    end: { kind: 'seam', color: '#33363a' },
    windowFrame: '#26282b',
    roofEdge: '#2a2c2f',
    base: '#2a2c2f',
    reveal: '#2a2c2f',
    door: '#b88d5e',
    doorKind: 'oak',
    accent: 'none',
    accentColor: '#c39a69',
    cornerTrim: '#2a2c2f',
    lampColor: '#ffbf7a',
    lampIntensity: 1,
    ledCornice: false,
    canopy: 'steel',
    boxFrames: { picture: 0.2, window: 0 },
  },
  black: {
    id: 'black',
    name: 'Black Premium',
    subtitle: 'Anthracite panels · dark timber · LED',
    swatches: ['#26282b', '#4a3426', '#d9b98a'],
    long: { kind: 'panels', color: '#2a2c2f' },
    end: { kind: 'panels', color: '#2a2c2f' },
    windowFrame: '#151617',
    roofEdge: '#1d1e20',
    base: '#1d1e20',
    reveal: '#1d1e20',
    door: '#4b3527',
    doorKind: 'timberBlack',
    accent: 'timber',
    accentColor: '#6e4c33',
    cornerTrim: null,
    lampColor: '#ffd29a',
    lampIntensity: 1.1,
    ledCornice: true,
    canopy: 'timber',
    boxFrames: { picture: 0.14, window: 0.12 },
  },
  contemporary: {
    id: 'contemporary',
    name: 'Contemporary House',
    subtitle: 'Warm-grey render on EPS · natural stone',
    swatches: ['#cfc8bd', '#9d9182', '#3a3836'],
    long: { kind: 'render', color: '#d2cbc0' },
    end: { kind: 'render', color: '#d2cbc0' },
    windowFrame: '#3a3836',
    roofEdge: '#9a9389',
    base: '#8a847b',
    reveal: '#c9c2b6',
    door: '#3a3836',
    doorKind: 'anthracite',
    accent: 'stone',
    accentColor: '#a39583',
    cornerTrim: null,
    lampColor: '#ffc684',
    lampIntensity: 1,
    ledCornice: false,
    canopy: 'render',
    boxFrames: { picture: 0.08, window: 0 },
  },
  charred: {
    id: 'charred',
    name: 'Shou Sugi Ban',
    subtitle: 'Charred timber · natural oak entrance',
    swatches: ['#1b1a19', '#b8875a', '#3b3229'],
    long: { kind: 'charred', color: '#1b1a19' },
    end: { kind: 'charred', color: '#1b1a19' },
    windowFrame: '#3b3229',
    roofEdge: '#1c1b1a',
    base: '#1c1b1a',
    reveal: '#b8875a',
    door: '#b8875a',
    doorKind: 'oak',
    accent: 'oak',
    accentColor: '#bb8b5c',
    cornerTrim: null,
    lampColor: '#ffb86e',
    lampIntensity: 1.1,
    ledCornice: false,
    canopy: 'oak',
    boxFrames: { picture: 0.22, window: 0.1 },
  },
  scandi: {
    id: 'scandi',
    name: 'Nordic White',
    subtitle: 'White board-on-board · larch details',
    swatches: ['#eceae4', '#c49a6c', '#8e9196'],
    long: { kind: 'vboards', color: '#ecebe6' },
    end: { kind: 'vboards', color: '#ecebe6' },
    windowFrame: '#6f7378',
    roofEdge: '#8e9196',
    base: '#6f7378',
    reveal: '#e4e2dc',
    door: '#c49a6c',
    doorKind: 'oak',
    accent: 'oak',
    accentColor: '#c79c6a',
    cornerTrim: '#e4e2dc',
    lampColor: '#ffc988',
    lampIntensity: 1,
    ledCornice: false,
    canopy: 'oak',
    boxFrames: { picture: 0.16, window: 0.08 },
  },
  brick: {
    id: 'brick',
    name: 'Clinker & Larch',
    subtitle: 'Brick-slip ETICS · horizontal larch ends',
    swatches: ['#7c4a37', '#b38a5e', '#232426'],
    long: { kind: 'brick', color: '#80503b' },
    end: { kind: 'hboards', color: '#b48a5d' },
    windowFrame: '#232426',
    roofEdge: '#232426',
    base: '#2a2b2d',
    reveal: '#232426',
    door: '#232426',
    doorKind: 'anthracite',
    accent: 'none',
    accentColor: '#b48a5d',
    cornerTrim: '#232426',
    lampColor: '#ffbf7a',
    lampIntensity: 1,
    ledCornice: false,
    canopy: 'steel',
    boxFrames: { picture: 0.18, window: 0.1 },
  },
}

export interface LightingPreset {
  id: LightingId
  name: string
  /** sun elevation / azimuth in degrees (azimuth 0 = +Z, 90 = +X) */
  elevation: number
  azimuth: number
  sunColor: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  envIntensity: number
  fog: string
  turbidity: number
  rayleigh: number
  mie: number
  /** 0…1 multipliers */
  interior: number
  exterior: number
  stars: number
  exposure: number
  bloom: number
}

export const LIGHTING: Record<LightingId, LightingPreset> = {
  day: {
    id: 'day',
    name: 'Day',
    elevation: 34,
    azimuth: 58,
    sunColor: '#fff0da',
    sunIntensity: 3.4,
    hemiSky: '#cfe2ff',
    hemiGround: '#8c8676',
    hemiIntensity: 0.55,
    envIntensity: 0.85,
    fog: '#c9d8e6',
    turbidity: 3.2,
    rayleigh: 1.9,
    mie: 0.0035,
    interior: 0.18,
    exterior: 0,
    stars: 0,
    exposure: 1,
    bloom: 0.25,
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    elevation: 4.5,
    azimuth: 72,
    sunColor: '#ff9e5a',
    sunIntensity: 2.6,
    hemiSky: '#ffc49a',
    hemiGround: '#4f3f30',
    hemiIntensity: 0.32,
    envIntensity: 0.45,
    fog: '#e9b493',
    turbidity: 8,
    rayleigh: 2.6,
    mie: 0.006,
    interior: 0.75,
    exterior: 0.6,
    stars: 0,
    exposure: 1.05,
    bloom: 0.6,
  },
  night: {
    id: 'night',
    name: 'Night',
    elevation: -12,
    azimuth: 250,
    sunColor: '#8fa6d8',
    sunIntensity: 0.32,
    hemiSky: '#334466',
    hemiGround: '#0f1210',
    hemiIntensity: 0.18,
    envIntensity: 0.08,
    fog: '#0d1320',
    turbidity: 2,
    rayleigh: 0.5,
    mie: 0.003,
    interior: 1,
    exterior: 1,
    stars: 1,
    exposure: 1.1,
    bloom: 1,
  },
}

export const INTERIOR_ORDER: InteriorId[] = ['japandi', 'luxury', 'minimal']
export const EXTERIOR_ORDER: ExteriorId[] = ['wood', 'charred', 'scandi', 'black', 'brick', 'contemporary']
export const LIGHTING_ORDER: LightingId[] = ['day', 'sunset', 'night']
