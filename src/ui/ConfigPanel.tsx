import { AnimatePresence, motion } from 'framer-motion'
import { BedDouble, Check, Gauge, Moon, Sparkles, Sun, SunMedium, Sunset, Tag, Trees } from 'lucide-react'
import type { ReactNode } from 'react'
import { INTERIOR as INT } from '../config/dimensions'
import { LAYOUTS, LAYOUT_ORDER, usableArea } from '../config/layouts'
import { EXTERIORS, EXTERIOR_ORDER, INTERIORS, INTERIOR_ORDER, LIGHTING_ORDER } from '../config/styles'
import type { LightingId } from '../config/types'
import { useConfig } from '../store'
import { PlanThumb } from './PlanThumb'
import { SOLAR, SOLAR_KWP } from '../three/building/Solar'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-900/55">{title}</h3>
        {hint && <span className="text-[11px] text-ink-900/40">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function OptionCard({ active, onClick, children, className = '' }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative w-full rounded-2xl border text-left transition-all duration-300 ${
        active ? 'border-ink-900 bg-white shadow-[0_6px_24px_-10px_rgba(0,0,0,0.35)]' : 'border-black/[0.07] bg-white/50 hover:border-black/20 hover:bg-white/80'
      } ${className}`}
    >
      {children}
      <AnimatePresence>
        {active && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-ink-900 text-white"
          >
            <Check size={12} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="flex -space-x-1.5">
      {colors.map((c) => (
        <span key={c} className="h-6 w-6 rounded-full ring-2 ring-white" style={{ background: c, boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15)' }} />
      ))}
    </div>
  )
}

function Toggle({ label, icon, on, onChange, disabled }: { label: string; icon: ReactNode; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${disabled ? 'opacity-35' : 'hover:bg-black/[0.04]'}`}
    >
      <span className="flex items-center gap-2.5 text-ink-900/80">
        <span className="text-ink-900/50">{icon}</span>
        {label}
      </span>
      <span className={`relative h-6 w-10 rounded-full transition-colors ${on ? 'bg-ink-900' : 'bg-black/15'}`}>
        <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

const LIGHT_ICON: Record<LightingId, ReactNode> = {
  day: <Sun size={16} />,
  sunset: <Sunset size={16} />,
  night: <Moon size={16} />,
}

export function ConfigPanel() {
  const s = useConfig()
  const layout = LAYOUTS[s.layout]
  const area = usableArea(layout)

  return (
    <AnimatePresence>
      {s.panelOpen && (
        <motion.aside
          key="panel"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className="pointer-events-auto absolute bottom-[92px] right-3 top-[76px] z-20 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-[26px] border border-white/60 bg-[#f7f5f1]/85 shadow-glass backdrop-blur-2xl max-[899px]:top-auto max-[899px]:h-[58vh]"
        >
          <div className="border-b border-black/[0.06] px-5 pb-4 pt-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sand-500">Haven 40 · 40′ High Cube</div>
            <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-ink-900">Configure your home</h2>
            <p className="mt-1 text-[13px] leading-snug text-ink-900/55">72 combinations · one container · real dimensions</p>
          </div>

          <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
            <Section title="Floor plan" hint={`${INT.length.toFixed(2)} × ${INT.width.toFixed(2)} m inside`}>
              <div className="space-y-2.5">
                {LAYOUT_ORDER.map((id) => {
                  const l = LAYOUTS[id]
                  const active = s.layout === id
                  return (
                    <OptionCard key={id} active={active} onClick={() => s.set({ layout: id })}>
                      <div className="p-3.5">
                        <div className="h-[46px] w-full">
                          <PlanThumb layout={l} active={active} />
                        </div>
                        <div className="mt-2.5 flex items-end justify-between pr-1">
                          <div>
                            <div className="text-[15px] font-semibold text-ink-900">{l.name}</div>
                            <div className="text-[12px] text-ink-900/55">{l.tagline}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[13px] font-semibold tabular-nums text-ink-900">{usableArea(l).toFixed(1)} m²</div>
                            <div className="text-[11px] text-ink-900/50">{l.sleeps}</div>
                          </div>
                        </div>
                      </div>
                    </OptionCard>
                  )
                })}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={layout.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
                  <p className="text-[12.5px] leading-relaxed text-ink-900/65">{layout.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {layout.features.map((f) => (
                      <span key={f} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] text-ink-900/70">
                        {f}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </Section>

            <div className="mx-5 h-px bg-black/[0.06]" />

            <Section title="Interior">
              <div className="space-y-2">
                {INTERIOR_ORDER.map((id) => {
                  const st = INTERIORS[id]
                  return (
                    <OptionCard key={id} active={s.interior === id} onClick={() => s.set({ interior: id })}>
                      <div className="flex items-center gap-3.5 p-3">
                        <Swatches colors={st.swatches} />
                        <div>
                          <div className="text-[14px] font-semibold text-ink-900">{st.name}</div>
                          <div className="text-[12px] text-ink-900/55">{st.subtitle}</div>
                        </div>
                      </div>
                    </OptionCard>
                  )
                })}
              </div>
            </Section>

            <div className="mx-5 h-px bg-black/[0.06]" />

            <Section title="Exterior" hint="200 mm insulated envelope">
              <div className="grid grid-cols-2 gap-2">
                {EXTERIOR_ORDER.map((id) => {
                  const st = EXTERIORS[id]
                  return (
                    <OptionCard key={id} active={s.exterior === id} onClick={() => s.set({ exterior: id })}>
                      <div className="p-3">
                        <Swatches colors={st.swatches} />
                        <div className="mt-2 pr-4 text-[13px] font-semibold leading-tight text-ink-900">{st.name}</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-ink-900/55">{st.subtitle}</div>
                      </div>
                    </OptionCard>
                  )
                })}
              </div>
            </Section>

            <div className="mx-5 h-px bg-black/[0.06]" />

            <Section title="Lighting">
              <div className="relative grid grid-cols-3 rounded-2xl bg-black/[0.05] p-1">
                {LIGHTING_ORDER.map((id) => (
                  <button key={id} onClick={() => s.set({ lighting: id })} className="relative z-10 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-medium">
                    {s.lighting === id && (
                      <motion.span layoutId="light-pill" className="absolute inset-0 -z-10 rounded-xl bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                    )}
                    <span className={s.lighting === id ? 'text-ink-900' : 'text-ink-900/50'}>{LIGHT_ICON[id]}</span>
                    <span className={s.lighting === id ? 'text-ink-900' : 'text-ink-900/55'}>{id === 'day' ? 'Day' : id === 'sunset' ? 'Sunset' : 'Night'}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Options">
              <div className="-mx-2">
                <Toggle label="Wooden terrace" icon={<Trees size={16} />} on={s.terrace} onChange={(v) => s.set({ terrace: v })} />
                <Toggle label="Rooftop solar (PV)" icon={<SunMedium size={16} />} on={s.solar} onChange={(v) => s.set({ solar: v })} />
                <AnimatePresence>
                  {s.solar && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mx-3 mb-1 overflow-hidden rounded-xl bg-black/[0.04] px-3 py-2 text-[12px] leading-relaxed text-ink-900/70"
                    >
                      {SOLAR.modules} × {SOLAR.wp} Wp modules · <b className="font-semibold text-ink-900">{SOLAR_KWP.toFixed(2)} kWp</b>
                      <br />≈ {(Math.round((SOLAR_KWP * SOLAR.yieldPerKwp) / 100) * 100).toLocaleString('en-US')} kWh / year, tilted {SOLAR.tilt}° on ballast frames
                    </motion.div>
                  )}
                </AnimatePresence>
                <Toggle label="Room names & dimensions" icon={<Tag size={16} />} on={s.labels} onChange={(v) => s.set({ labels: v })} />
                <Toggle
                  label={s.layout === 'studio' ? 'Murphy bed unfolded' : 'Murphy bed (Studio only)'}
                  icon={<BedDouble size={16} />}
                  on={s.murphyOpen}
                  disabled={s.layout !== 'studio'}
                  onChange={(v) => s.set({ murphyOpen: v })}
                />
                <Toggle label="High-quality rendering" icon={<Gauge size={16} />} on={s.highQuality} onChange={(v) => s.set({ highQuality: v })} />
              </div>
            </Section>
          </div>

          {/* summary */}
          <div className="border-t border-black/[0.06] bg-white/60 px-5 py-4">
            <div className="flex items-end justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-900/45">Your configuration</div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${s.layout}${s.interior}${s.exterior}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-1 truncate text-[13px] font-medium text-ink-900"
                  >
                    {layout.name} · {INTERIORS[s.interior].name} · {EXTERIORS[s.exterior].name}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="pl-3 text-right">
                <div className="text-[11px] text-ink-900/45">Usable area</div>
                <div className="flex items-baseline gap-0.5">
                  <motion.span key={area} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[26px] font-semibold tabular-nums leading-none tracking-tight text-ink-900">
                    ≈{area.toFixed(1)}
                  </motion.span>
                  <span className="text-[13px] font-medium text-ink-900/60">m²</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-900/45">
              <Sparkles size={12} /> Net floor area inside the walls, partitions excluded
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
