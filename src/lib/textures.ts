import * as THREE from 'three'

/*
 * Procedural, canvas-generated PBR-ish textures. Everything is cached by key
 * so switching styles never regenerates the same texture twice.
 * All textures are authored for world-space UVs where 1 UV unit = 1 metre;
 * `repeat` converts that to the texture's physical tile size.
 */

const cache = new Map<string, THREE.Texture>()

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** smooth value noise in [0,1], tileable over `period` */
function makeNoise(seed: number, period: number) {
  const r = rng(seed)
  const grid = new Float32Array(period * period).map(() => r())
  const at = (x: number, y: number) => grid[((y % period) + period) % period * period + (((x % period) + period) % period)]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct = 4) {
  let v = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < oct; i++) {
    v += amp * noise(x * f, y * f)
    amp *= 0.5
    f *= 2
  }
  return v
}

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex)
  return [c.r * 255, c.g * 255, c.b * 255]
}

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  return { c, ctx, img: ctx.createImageData(size, size) }
}

function finish(c: HTMLCanvasElement, repeat: number, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / repeat, 1 / repeat)
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key)
  if (!t) {
    t = make()
    cache.set(key, t)
  }
  return t
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/* ------------------------------------------------------------------ */

/**
 * Timber planks. Returns the colour map; `bump` variant returns a
 * grayscale map highlighting plank joints and grain.
 * Tile covers `tile` metres; boards run along V.
 */
export function woodTexture(color: string, opts: { plank?: number; tile?: number; bump?: boolean; seed?: number; boards?: boolean } = {}) {
  const { plank = 0.19, tile = 2.4, bump = false, seed = 7, boards = true } = opts
  return cached(`wood:${color}:${plank}:${tile}:${bump}:${seed}:${boards}`, () => {
    const size = 1024
    const { c, ctx, img } = canvas(size)
    const [r0, g0, b0] = hexToRgb(color)
    const n = makeNoise(seed, 64)
    const n2 = makeNoise(seed + 3, 16)
    const R = rng(seed + 11)
    const plankPx = boards ? Math.max(8, Math.round((plank / tile) * size)) : size
    const cols = Math.ceil(size / plankPx)
    // per-plank properties
    const tones = Array.from({ length: cols * 8 }, () => 0.86 + R() * 0.26)
    const offsets = Array.from({ length: cols }, () => R())
    const plankLen = 0.45 + R() * 0.25 // fraction of tile
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const col = Math.floor(x / plankPx)
        const fx = (x % plankPx) / plankPx
        const vy = y / size + offsets[col % cols]
        const seg = boards ? Math.floor(vy / plankLen) : 0
        const segF = boards ? (vy / plankLen) % 1 : 0.5
        const tone = tones[(col * 8 + seg) % tones.length]
        // grain: stretched noise along the board
        const gx = x / size * 140 + col * 17.3
        const gy = y / size * 6 + seg * 5.1
        const grain = fbm(n, gx, gy, 3)
        const fine = n2(x / size * 600, y / size * 30)
        const ring = Math.sin((grain * 9 + fx * 2.5) * Math.PI) * 0.5 + 0.5
        let shade = tone * (0.84 + 0.16 * ring) * (0.94 + 0.06 * fine)
        // joints
        let joint = 0
        if (boards) {
          if (fx < 0.012 || fx > 0.988) joint = 1
          if (segF < 0.004 || segF > 0.996) joint = 1
        }
        if (bump) {
          const v = joint ? 0 : 150 + ring * 60 + fine * 30
          const i = (y * size + x) * 4
          img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(v)
          img.data[i + 3] = 255
          continue
        }
        if (joint) shade *= 0.55
        const i = (y * size + x) * 4
        img.data[i] = clamp(r0 * shade)
        img.data[i + 1] = clamp(g0 * shade)
        img.data[i + 2] = clamp(b0 * shade * 0.98)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return finish(c, tile, !bump)
  })
}

/** Mottled concrete / microcement / render */
export function concreteTexture(color: string, opts: { tile?: number; seed?: number; strength?: number; bump?: boolean; pores?: boolean } = {}) {
  const { tile = 3, seed = 3, strength = 1, bump = false, pores = true } = opts
  return cached(`conc:${color}:${tile}:${seed}:${strength}:${bump}:${pores}`, () => {
    const size = 512
    const { c, ctx, img } = canvas(size)
    const [r0, g0, b0] = hexToRgb(color)
    const n = makeNoise(seed, 32)
    const n2 = makeNoise(seed + 5, 128)
    const R = rng(seed)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const big = fbm(n, (x / size) * 8, (y / size) * 8, 4)
        const small = n2((x / size) * 128, (y / size) * 128)
        let s = 1 + ((big - 0.5) * 0.16 + (small - 0.5) * 0.06) * strength
        if (pores && R() < 0.0025) s *= 0.8
        const i = (y * size + x) * 4
        if (bump) {
          const v = 128 + (big - 0.5) * 60 + (small - 0.5) * 90
          img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(v)
        } else {
          img.data[i] = clamp(r0 * s)
          img.data[i + 1] = clamp(g0 * s)
          img.data[i + 2] = clamp(b0 * s)
        }
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return finish(c, tile, !bump)
  })
}

/** Natural stone / travertine with soft veining */
export function stoneTexture(color: string, opts: { tile?: number; seed?: number; vein?: string } = {}) {
  const { tile = 1.2, seed = 21, vein } = opts
  return cached(`stone:${color}:${tile}:${seed}:${vein}`, () => {
    const size = 512
    const { c, ctx, img } = canvas(size)
    const [r0, g0, b0] = hexToRgb(color)
    const [vr, vg, vb] = hexToRgb(vein ?? color)
    const n = makeNoise(seed, 32)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        const w = fbm(n, u * 6, v * 6, 5)
        const band = Math.abs(Math.sin((v * 3 + w * 4) * Math.PI))
        const veinAmt = vein ? Math.pow(1 - band, 18) * 0.7 : 0
        const strata = 0.93 + 0.1 * Math.sin((v * 22 + w * 6) * Math.PI) * (vein ? 0.3 : 1)
        const s = strata * (0.95 + 0.1 * w)
        const i = (y * size + x) * 4
        img.data[i] = clamp(r0 * s * (1 - veinAmt) + vr * veinAmt)
        img.data[i + 1] = clamp(g0 * s * (1 - veinAmt) + vg * veinAmt)
        img.data[i + 2] = clamp(b0 * s * (1 - veinAmt) + vb * veinAmt)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return finish(c, tile)
  })
}

/** Rectangular tiles with grout lines over a subtle stone base */
export function tileTexture(color: string, grout: string, opts: { tileW?: number; tileH?: number; tile?: number; seed?: number; bump?: boolean } = {}) {
  const { tileW = 0.3, tileH = 0.6, tile = 1.2, seed = 9, bump = false } = opts
  return cached(`tile:${color}:${grout}:${tileW}:${tileH}:${tile}:${seed}:${bump}`, () => {
    const size = 512
    const { c, ctx, img } = canvas(size)
    const [r0, g0, b0] = hexToRgb(color)
    const [gr, gg, gb] = hexToRgb(grout)
    const n = makeNoise(seed, 32)
    const R = rng(seed)
    const tw = (tileW / tile) * size
    const th = (tileH / tile) * size
    const tones = Array.from({ length: 64 }, () => 0.94 + R() * 0.1)
    const gw = 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / th)
        const xo = x + (row % 2) * tw * 0.5
        const col = Math.floor(xo / tw)
        const fx = xo % tw
        const fy = y % th
        const isGrout = fx < gw || fy < gw
        const i = (y * size + x) * 4
        if (bump) {
          const v = isGrout ? 40 : 200
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        } else if (isGrout) {
          img.data[i] = gr
          img.data[i + 1] = gg
          img.data[i + 2] = gb
        } else {
          const t = tones[(row * 7 + col) & 63] * (0.97 + 0.06 * fbm(n, (x / size) * 10, (y / size) * 10, 3))
          img.data[i] = clamp(r0 * t)
          img.data[i + 1] = clamp(g0 * t)
          img.data[i + 2] = clamp(b0 * t)
        }
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return finish(c, tile, !bump)
  })
}

/** Woven upholstery / linen */
export function fabricTexture(color: string, opts: { tile?: number; seed?: number; boucle?: boolean } = {}) {
  const { tile = 0.25, seed = 4, boucle = false } = opts
  return cached(`fab:${color}:${tile}:${seed}:${boucle}`, () => {
    const size = 256
    const { c, ctx, img } = canvas(size)
    const [r0, g0, b0] = hexToRgb(color)
    const n = makeNoise(seed, 64)
    const R = rng(seed)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 1.03 : 0.97
        const slub = 0.94 + 0.12 * n((x / size) * 64, (y / size) * 8)
        const loop = boucle ? 0.88 + R() * 0.24 : 1
        const s = weave * slub * loop
        const i = (y * size + x) * 4
        img.data[i] = clamp(r0 * s)
        img.data[i + 1] = clamp(g0 * s)
        img.data[i + 2] = clamp(b0 * s)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return finish(c, tile)
  })
}

/** Vertical board cladding with shadow gaps (façades, decking) */
export function claddingTexture(color: string, opts: { board?: number; tile?: number; seed?: number; bump?: boolean; gap?: number } = {}) {
  const { board = 0.12, tile = 1.44, seed = 13, bump = false, gap = 0.012 } = opts
  return cached(`clad:${color}:${board}:${tile}:${seed}:${bump}:${gap}`, () => {
    const size = 1024
    const { c, ctx, img } = canvas(size)
    const [r0, g0, b0] = hexToRgb(color)
    const n = makeNoise(seed, 64)
    const R = rng(seed + 1)
    const bpx = (board / tile) * size
    const gpx = Math.max(2, (gap / tile) * size)
    const tones = Array.from({ length: 64 }, () => 0.82 + R() * 0.32)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const col = Math.floor(x / bpx)
        const fx = x % bpx
        const tone = tones[col & 63]
        const grain = fbm(n, (x / size) * 160 + col * 9.1, (y / size) * 5, 3)
        const ring = Math.sin((grain * 10) * Math.PI) * 0.5 + 0.5
        const isGap = fx < gpx
        const edge = fx < gpx + 2 || fx > bpx - 2 ? 0.85 : 1
        const i = (y * size + x) * 4
        if (bump) {
          const v = isGap ? 0 : 170 + ring * 50
          img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(v)
        } else {
          const s = isGap ? 0.22 : tone * (0.86 + 0.14 * ring) * edge
          img.data[i] = clamp(r0 * s)
          img.data[i + 1] = clamp(g0 * s)
          img.data[i + 2] = clamp(b0 * s)
        }
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return finish(c, tile, !bump)
  })
}

/**
 * Normal map of ISO container trapezoidal corrugation (pitch ≈ 278 mm).
 * Corrugation runs vertically (ribs vary along U).
 */
export function corrugationNormal(pitch = 0.278) {
  return cached(`corr:${pitch}`, () => {
    const size = 256
    const { c, ctx, img } = canvas(size)
    // profile: flat outer 0.25, slope 0.125, flat inner 0.25, slope 0.125 … (fractions of pitch)
    for (let x = 0; x < size; x++) {
      const f = x / size
      let nx = 0
      if (f > 0.25 && f < 0.37) nx = -0.75
      else if (f > 0.63 && f < 0.75) nx = 0.75
      const nz = Math.sqrt(1 - nx * nx)
      for (let y = 0; y < size; y++) {
        const i = (y * size + x) * 4
        img.data[i] = (nx * 0.5 + 0.5) * 255
        img.data[i + 1] = 128
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const t = finish(c, pitch, false)
    t.repeat.set(1 / pitch, 1)
    return t
  })
}

/** Corrugation AO/colour modulation to match the normal map */
export function corrugationColor(color: string, pitch = 0.278) {
  return cached(`corrc:${color}:${pitch}`, () => {
    const size = 256
    const { c, ctx, img } = canvas(size)
    const [r0, g0, b0] = hexToRgb(color)
    const n = makeNoise(5, 16)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const f = x / size
        let s = 1
        if (f > 0.37 && f < 0.63) s = 0.9
        if ((f > 0.25 && f < 0.37) || (f > 0.63 && f < 0.75)) s = 0.95
        s *= 0.97 + 0.06 * n((x / size) * 4, (y / size) * 16)
        const i = (y * size + x) * 4
        img.data[i] = clamp(r0 * s)
        img.data[i + 1] = clamp(g0 * s)
        img.data[i + 2] = clamp(b0 * s)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const t = finish(c, pitch)
    t.repeat.set(1 / pitch, 1 / 2.9)
    return t
  })
}

/** Lawn base colour */
export function grassTexture() {
  return cached('grass', () => {
    const size = 1024
    const { c, ctx, img } = canvas(size)
    const n = makeNoise(31, 64)
    const n2 = makeNoise(77, 256)
    const R = rng(5)
    const base = hexToRgb('#5d7a37')
    const dry = hexToRgb('#8a8a4a')
    const dark = hexToRgb('#3e5a26')
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const big = fbm(n, (x / size) * 6, (y / size) * 6, 4)
        const blade = n2((x / size) * 256, (y / size) * 256)
        const sp = R()
        let r = base[0]
        let g = base[1]
        let b = base[2]
        const dmix = Math.max(0, big - 0.55) * 1.6
        r = r * (1 - dmix) + dry[0] * dmix
        g = g * (1 - dmix) + dry[1] * dmix
        b = b * (1 - dmix) + dry[2] * dmix
        const k = 0.75 + blade * 0.45 + (sp > 0.97 ? 0.15 : 0) - (sp < 0.04 ? 0.25 : 0)
        const dk = Math.max(0, 0.45 - big) * 0.9
        const i = (y * size + x) * 4
        img.data[i] = clamp((r * (1 - dk) + dark[0] * dk) * k)
        img.data[i + 1] = clamp((g * (1 - dk) + dark[1] * dk) * k)
        img.data[i + 2] = clamp((b * (1 - dk) + dark[2] * dk) * k)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return finish(c, 4)
  })
}

/** Pea gravel */
export function gravelTexture(color = '#b9b2a6') {
  return cached(`gravel:${color}`, () => {
    const size = 512
    const { c, ctx } = canvas(size)
    const R = rng(12)
    const [r0, g0, b0] = hexToRgb(color)
    ctx.fillStyle = `rgb(${r0 * 0.55},${g0 * 0.55},${b0 * 0.55})`
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 9000; i++) {
      const x = R() * size
      const y = R() * size
      const rad = 1.5 + R() * 3.5
      const s = 0.7 + R() * 0.45
      ctx.fillStyle = `rgb(${clamp(r0 * s)},${clamp(g0 * s * 0.98)},${clamp(b0 * s * 0.95)})`
      ctx.beginPath()
      ctx.ellipse(x, y, rad, rad * (0.6 + R() * 0.4), R() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    return finish(c, 1)
  })
}

/** Stacked natural stone cladding */
export function stackedStoneTexture(color: string) {
  return cached(`stack:${color}`, () => {
    const size = 512
    const { c, ctx } = canvas(size)
    const R = rng(44)
    const [r0, g0, b0] = hexToRgb(color)
    ctx.fillStyle = `rgb(${r0 * 0.45},${g0 * 0.45},${b0 * 0.45})`
    ctx.fillRect(0, 0, size, size)
    let y = 0
    while (y < size) {
      const h = 14 + R() * 26
      let x = -R() * 60
      while (x < size) {
        const w = 40 + R() * 120
        const s = 0.75 + R() * 0.45
        const tint = R() * 0.1
        ctx.fillStyle = `rgb(${clamp(r0 * s * (1 + tint))},${clamp(g0 * s)},${clamp(b0 * s * (1 - tint))})`
        ctx.fillRect(x + 2, y + 2, w - 3, h - 3)
        // highlight top edge
        ctx.fillStyle = `rgba(255,255,255,0.10)`
        ctx.fillRect(x + 2, y + 2, w - 3, 2)
        x += w
      }
      y += h
    }
    return finish(c, 1.2)
  })
}

/** Grayscale bump companion for stacked stone (cheap: reuse luminance) */
export function stackedStoneBump(color: string) {
  return cached(`stackb:${color}`, () => {
    const src = stackedStoneTexture(color)
    const t = src.clone()
    t.colorSpace = THREE.NoColorSpace
    t.needsUpdate = true
    return t
  })
}

/** Soft radial gradient used for light pools, blob shadows and glows */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return cached(`rad:${inner}:${outer}`, () => {
    const size = 128
    const { c, ctx } = canvas(size)
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, inner)
    g.addColorStop(1, outer)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })
}

/** Book spines / decorative accents */
export function paperTexture() {
  return cached('paper', () => {
    const size = 64
    const { c, ctx } = canvas(size)
    ctx.fillStyle = '#f4efe6'
    ctx.fillRect(0, 0, size, size)
    return finish(c, 1)
  })
}
