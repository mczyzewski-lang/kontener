import { create } from 'zustand'
import type { CameraMode, ExteriorId, InteriorId, LayoutId, LightingId } from './config/types'

export interface ConfigState {
  layout: LayoutId
  interior: InteriorId
  exterior: ExteriorId
  mode: CameraMode
  lighting: LightingId
  terrace: boolean
  labels: boolean
  murphyOpen: boolean
  highQuality: boolean
  panelOpen: boolean
  /** increments to ask the camera rig to re-frame the current mode */
  resetNonce: number
  /** walkthrough: requested viewpoint id + nonce so re-clicking works */
  walkTarget: string | null
  walkNonce: number
  autoTour: boolean
  set: (patch: Partial<Omit<ConfigState, 'set' | 'resetView' | 'goTo'>>) => void
  resetView: () => void
  goTo: (viewpoint: string) => void
}

const LAYOUTS: LayoutId[] = ['couple', 'family', 'studio']
const INTERIORS: InteriorId[] = ['japandi', 'luxury', 'minimal']
const EXTERIORS: ExteriorId[] = ['wood', 'black', 'contemporary']
const LIGHTS: LightingId[] = ['day', 'sunset', 'night']

function fromHash() {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.hash.slice(1))
  const out: Partial<ConfigState> = {}
  const l = p.get('plan') as LayoutId
  const i = p.get('interior') as InteriorId
  const e = p.get('exterior') as ExteriorId
  const t = p.get('light') as LightingId
  if (LAYOUTS.includes(l)) out.layout = l
  if (INTERIORS.includes(i)) out.interior = i
  if (EXTERIORS.includes(e)) out.exterior = e
  if (LIGHTS.includes(t)) out.lighting = t
  return out
}

export const useConfig = create<ConfigState>((set) => ({
  layout: 'couple',
  interior: 'japandi',
  exterior: 'wood',
  mode: 'exterior',
  lighting: 'day',
  terrace: true,
  labels: true,
  murphyOpen: true,
  highQuality: true,
  panelOpen: typeof window !== 'undefined' ? window.innerWidth >= 900 : true,
  resetNonce: 0,
  walkTarget: null,
  walkNonce: 0,
  autoTour: false,
  ...fromHash(),
  set: (patch) => set(patch),
  resetView: () => set((s) => ({ resetNonce: s.resetNonce + 1, autoTour: false })),
  goTo: (viewpoint) => set((s) => ({ walkTarget: viewpoint, walkNonce: s.walkNonce + 1, autoTour: false })),
}))

// Keep the shareable configuration in the URL hash (no reloads).
useConfig.subscribe((s) => {
  const hash = `plan=${s.layout}&interior=${s.interior}&exterior=${s.exterior}&light=${s.lighting}`
  if (window.location.hash.slice(1) !== hash) window.history.replaceState(null, '', `#${hash}`)
})
