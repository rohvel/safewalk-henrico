/**
 * make-icons.mjs
 * --------------
 * Generates the PWA icons (icon-192.png, icon-512.png, icon-maskable-512.png)
 * from the same crosswalk mark as favicon.svg — drawn pixel-by-pixel and
 * encoded as PNG with Node's built-in zlib, so the project needs no image
 * dependencies. Outputs are committed; re-run only if the mark changes:
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const INK = [0x16, 0x18, 0x1d, 255]
const PAPER = [0xfa, 0xfb, 0xfc, 255]
const YELLOW = [0xf5, 0xb7, 0x00, 255]

/** Draw the crosswalk mark into an RGBA buffer. */
function draw(size, { maskable = false } = {}) {
  const px = new Uint8Array(size * size * 4)
  const put = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }

  // Maskable icons must keep content inside the central 80% safe zone,
  // and the background must bleed to every edge (no rounded corners).
  const radius = maskable ? 0 : Math.round(size * 0.22)
  const inset = maskable ? size * 0.2 : size * 0.2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-rect clip
      const cx = Math.max(radius - x, x - (size - 1 - radius), 0)
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0)
      if (cx * cx + cy * cy > radius * radius) continue
      put(x, y, INK)
    }
  }

  // three vertical stripes, middle one sign-yellow
  const stripeTop = Math.round(inset)
  const stripeBottom = size - stripeTop
  const stripeW = Math.round(size * 0.14)
  const gap = Math.round(size * 0.085)
  const totalW = stripeW * 3 + gap * 2
  const left0 = Math.round((size - totalW) / 2)
  const colors = [PAPER, YELLOW, PAPER]
  for (let s = 0; s < 3; s++) {
    const x0 = left0 + s * (stripeW + gap)
    for (let y = stripeTop; y < stripeBottom; y++) {
      for (let x = x0; x < x0 + stripeW; x++) put(x, y, colors[s])
    }
  }
  return px
}

// ---- minimal PNG encoder (truecolor+alpha, no interlace) ----

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePNG(px, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // raw scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = fileURLToPath(new URL('../public/', import.meta.url))
for (const [file, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
]) {
  writeFileSync(outDir + file, encodePNG(draw(size, opts), size))
  console.log(`wrote public/${file}`)
}
