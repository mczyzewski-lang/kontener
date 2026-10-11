import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Scene } from './three/Scene'
import { ConfigPanel } from './ui/ConfigPanel'
import { CameraVeil, ModeBar, ModeHint, SectionLegend, SpecsCard, TopBar, WalkHUD } from './ui/Chrome'

function Intro() {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 1400)
    return () => clearTimeout(t)
  }, [])
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-[#101215]"
        >
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sand-400">Haven 40</div>
            <div className="mt-2 text-xl font-light tracking-tight text-white/90">Preparing your home…</div>
            <div className="mx-auto mt-5 h-0.5 w-40 overflow-hidden rounded bg-white/10">
              <motion.div className="h-full bg-sand-400" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 1.3, ease: 'easeInOut' }} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#c9d6e0] font-sans antialiased">
      <Scene />
      <CameraVeil />
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <ConfigPanel />
        <WalkHUD />
        <SpecsCard />
        <SectionLegend />
        <ModeHint />
        <ModeBar />
      </div>
      <Intro />
    </div>
  )
}
