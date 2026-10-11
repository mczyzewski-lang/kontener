import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Footprints,
  Grid2x2,
  Home,
  Link2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { CONTAINER, EXTERIOR, INTERIOR, WALL } from '../config/dimensions'
import { LAYOUTS } from '../config/layouts'
import { EXTERIORS, INTERIORS } from '../config/styles'
import type { CameraMode } from '../config/types'
import { useConfig } from '../store'
import { walkInput } from '../three/WalkController'

/* ------------------------------------------------------------------ */
export function TopBar() {
  const s = useConfig()
  const [copied, setCopied] = useState(false)
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/50 bg-white/70 py-2 pl-2.5 pr-4 shadow-glass backdrop-blur-xl"
      >
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#e8d3b0" strokeWidth="1.6">
            <rect x="2.5" y="7.5" width="19" height="9" rx="1" />
            <path d="M7 7.5v9M11.5 7.5v9M16 7.5v9" opacity=".55" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-tight text-ink-900">Haven 40</div>
          <div className="text-[11px] text-ink-900/55">Container Home Configurator</div>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="pointer-events-auto hidden items-center gap-2 rounded-full border border-white/50 bg-white/70 px-4 py-2 text-[12.5px] text-ink-900/80 shadow-glass backdrop-blur-xl lg:flex"
      >
        <span className="font-semibold text-ink-900">{LAYOUTS[s.layout].name}</span>
        <span className="text-ink-900/30">/</span>
        <span>{INTERIORS[s.interior].name}</span>
        <span className="text-ink-900/30">/</span>
        <span>{EXTERIORS[s.exterior].name}</span>
      </motion.div>

      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="pointer-events-auto flex items-center gap-2"
      >
        <button
          onClick={share}
          title="Copy a link to this configuration"
          className="hidden h-11 items-center gap-2 rounded-2xl border border-white/50 bg-white/70 px-3.5 text-[13px] font-medium text-ink-900 shadow-glass backdrop-blur-xl transition hover:bg-white sm:flex"
        >
          <Link2 size={16} />
          {copied ? 'Copied' : 'Share'}
        </button>
        <button
          onClick={s.resetView}
          className="flex h-11 items-center gap-2 rounded-2xl bg-ink-900 px-4 text-[13px] font-medium text-white shadow-glass transition hover:bg-ink-800"
        >
          <RotateCcw size={16} />
          <span className="hidden sm:inline">Reset View</span>
        </button>
        <button
          onClick={() => s.set({ panelOpen: !s.panelOpen })}
          title={s.panelOpen ? 'Hide configuration' : 'Show configuration'}
          className="grid h-11 w-11 place-items-center rounded-2xl border border-white/50 bg-white/70 text-ink-900 shadow-glass backdrop-blur-xl transition hover:bg-white"
        >
          {s.panelOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
        </button>
      </motion.div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
const MODES: { id: CameraMode; label: string; icon: ReactNode }[] = [
  { id: 'exterior', label: 'Exterior', icon: <Home size={17} /> },
  { id: 'dollhouse', label: 'Dollhouse', icon: <Box size={17} /> },
  { id: 'topdown', label: 'Top Down', icon: <Grid2x2 size={17} /> },
  { id: 'walkthrough', label: 'Walkthrough', icon: <Footprints size={17} /> },
]

export function ModeBar() {
  const mode = useConfig((s) => s.mode)
  const set = useConfig((s) => s.set)
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
    <motion.nav
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 24 }}
      className="pointer-events-auto flex gap-1 rounded-[22px] border border-white/15 bg-ink-900/80 p-1.5 shadow-glass backdrop-blur-xl"
    >
      {MODES.map((m) => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            onClick={() => set({ mode: m.id, autoTour: false })}
            className={`relative flex min-w-[68px] flex-col items-center gap-0.5 rounded-[16px] px-2.5 py-2 text-[10.5px] font-medium transition-colors sm:min-w-0 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-[13px] ${active ? 'text-ink-900' : 'text-white/70 hover:text-white'}`}
          >
            {active && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-[16px] bg-white" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative z-10">{m.icon}</span>
            <span className="relative z-10">{m.label}</span>
          </button>
        )
      })}
    </motion.nav>
    </div>
  )
}

/* ------------------------------------------------------------------ */
const HINTS: Record<CameraMode, string> = {
  exterior: 'Drag to orbit · Scroll to zoom · Right-drag to pan',
  dollhouse: 'Roof lifted · Section cut at 1.35 m · Drag to orbit',
  topdown: 'Orthographic plan · Drag to pan · Scroll to zoom',
  walkthrough: 'Drag to look · WASD / arrows to move · Double-click the floor to walk there',
}
const TOUCH_HINTS: Record<CameraMode, string> = {
  exterior: 'Drag to orbit · Pinch to zoom · Two fingers to pan',
  dollhouse: 'Roof lifted · Drag to orbit · Pinch to zoom',
  topdown: 'Drag to pan · Pinch to zoom',
  walkthrough: 'Drag to look · Tap the floor to walk there',
}
const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export function ModeHint() {
  const mode = useConfig((s) => s.mode)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 5200)
    return () => clearTimeout(t)
  }, [mode])
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[86px] z-20 flex justify-center">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="whitespace-nowrap rounded-full bg-black/45 px-4 py-1.5 text-[12px] text-white/90 backdrop-blur-md max-sm:max-w-[92vw] max-sm:truncate"
          >
            {(isTouch ? TOUCH_HINTS : HINTS)[mode]}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function SpecsCard() {
  const s = useConfig()
  const mode = s.mode
  if (mode === 'walkthrough') return null
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6 }}
      className="pointer-events-auto absolute bottom-4 left-3 z-20 hidden rounded-2xl border border-white/50 bg-white/70 px-4 py-3 shadow-glass backdrop-blur-xl xl:block"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-900/45">40′ High Cube · insulated outside</div>
      <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12px] tabular-nums">
        <span className="text-ink-900/55">Building</span>
        <span className="font-medium text-ink-900">
          {EXTERIOR.length.toFixed(2)} × {EXTERIOR.width.toFixed(2)} m · h {EXTERIOR.height.toFixed(2)} m
        </span>
        <span className="text-ink-900/55">Container</span>
        <span className="font-medium text-ink-900">
          {CONTAINER.length.toFixed(2)} × {CONTAINER.width.toFixed(2)} × {CONTAINER.height.toFixed(2)} m
        </span>
        <span className="text-ink-900/55">Interior</span>
        <span className="font-medium text-ink-900">
          {INTERIOR.length.toFixed(2)} × {INTERIOR.width.toFixed(2)} × {INTERIOR.height.toFixed(2)} m
        </span>
        <span className="text-ink-900/55">Walls</span>
        <span className="font-medium text-ink-900">{Math.round(WALL * 1000)} mm · 200 mm wool / EPS</span>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
function HoldButton({ onChange, children, label }: { onChange: (on: boolean) => void; children: ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        onChange(true)
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onPointerLeave={() => onChange(false)}
      className="grid h-11 w-11 select-none place-items-center rounded-xl bg-white/15 text-white transition active:bg-white/35"
    >
      {children}
    </button>
  )
}

export function WalkHUD() {
  const mode = useConfig((s) => s.mode)
  const layoutId = useConfig((s) => s.layout)
  const goTo = useConfig((s) => s.goTo)
  const autoTour = useConfig((s) => s.autoTour)
  const set = useConfig((s) => s.set)
  const panelOpen = useConfig((s) => s.panelOpen)
  const layout = LAYOUTS[layoutId]
  return (
    <AnimatePresence>
      {mode === 'walkthrough' && (
        <>
          <div key="rooms-wrap" className={`pointer-events-none absolute inset-x-0 top-[76px] z-20 flex justify-center ${panelOpen ? 'min-[900px]:pr-[400px]' : ''}`}>
          <motion.div
            key="rooms"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.4 }}
            className="pointer-events-auto flex max-w-[94vw] items-center gap-1 overflow-x-auto rounded-2xl border border-white/15 bg-ink-900/70 p-1.5 backdrop-blur-xl"
          >
            <button
              onClick={() => set({ autoTour: !autoTour })}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition ${autoTour ? 'bg-sand-400 text-ink-900' : 'text-white/80 hover:bg-white/10'}`}
            >
              {autoTour ? <Pause size={14} /> : <Play size={14} />} Guided tour
            </button>
            <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />
            {layout.viewpoints.map((v) => (
              <button key={v.id} onClick={() => goTo(v.id)} className="shrink-0 rounded-xl px-3 py-2 text-[12.5px] text-white/80 transition hover:bg-white/10 hover:text-white">
                {v.name}
              </button>
            ))}
          </motion.div>
          </div>
          <motion.div
            key="pad"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`pointer-events-auto absolute bottom-[88px] left-3 z-20 grid grid-cols-3 gap-1 rounded-2xl bg-ink-900/55 p-1.5 backdrop-blur-xl ${panelOpen ? 'max-[899px]:hidden' : ''}`}
          >
            <span />
            <HoldButton label="Forward" onChange={(on) => (walkInput.forward = on ? 1 : 0)}>
              <ArrowUp size={18} />
            </HoldButton>
            <span />
            <HoldButton label="Turn left" onChange={(on) => (walkInput.turn = on ? -1 : 0)}>
              <ArrowLeft size={18} />
            </HoldButton>
            <HoldButton label="Back" onChange={(on) => (walkInput.forward = on ? -1 : 0)}>
              <ArrowDown size={18} />
            </HoldButton>
            <HoldButton label="Turn right" onChange={(on) => (walkInput.turn = on ? 1 : 0)}>
              <ArrowRight size={18} />
            </HoldButton>
          </motion.div>
          <motion.div
            key="eye"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-[96px] right-3 z-10 hidden rounded-full bg-black/40 px-3 py-1 text-[11px] text-white/80 backdrop-blur md:block"
            style={{ right: panelOpen ? 400 : 12 }}
          >
            Eye level 1.62 m · ceiling 2.50 m
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/** Explains the colours of the section cut (wall build-up) */
export function SectionLegend() {
  const mode = useConfig((s) => s.mode)
  const labels = useConfig((s) => s.labels)
  const show = labels && (mode === 'dollhouse' || mode === 'topdown')
  const items: [string, string][] = [
    ['#5b5650', 'Façade 30 mm'],
    ['#e9dca6', 'Insulation 200 mm'],
    ['#141517', 'Container steel'],
    ['#c9c2b6', 'Lining 40 mm'],
  ]
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="pointer-events-auto absolute left-3 top-[76px] z-20 hidden rounded-2xl border border-white/50 bg-white/75 px-3.5 py-2.5 shadow-glass backdrop-blur-xl sm:block"
        >
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-900/45">Wall section</div>
          <div className="mt-1.5 grid gap-1">
            {items.map(([c, t]) => (
              <div key={t} className="flex items-center gap-2 text-[11.5px] text-ink-900/80">
                <span className="h-2.5 w-5 rounded-sm ring-1 ring-black/10" style={{ background: c }} />
                {t}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/** Short veil that hides the perspective ↔ orthographic camera swap */
export function CameraVeil() {
  const mode = useConfig((s) => s.mode)
  const ortho = mode === 'topdown'
  const [key, setKey] = useState(0)
  const [last, setLast] = useState(ortho)
  if (last !== ortho) {
    setLast(ortho)
    setKey((k) => k + 1)
  }
  return (
    <AnimatePresence>
      {key > 0 && (
        <motion.div
          key={key}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 z-10 bg-[#eef0f2]"
        />
      )}
    </AnimatePresence>
  )
}
