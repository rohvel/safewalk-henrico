/**
 * verify-map.mjs
 * ---------------
 * Proves the map actually renders pixels — the thing loaded()/styleLoaded()/
 * tilesLoaded() cannot prove (all three reported true on 2026-07-23 while the
 * map was a silent blank rectangle, because the CONTAINER had collapsed to
 * 0 height; the map object itself was perfectly "loaded").
 *
 * What it does:
 *   1. Builds the production bundle (skip with --skip-build to iterate faster).
 *   2. Serves it with `vite preview` and discovers the real port from its
 *      own stdout (never assumes 4173 is free).
 *   3. Opens it in headless Chromium (Playwright) with a debug query param
 *      (?verifyMap=1) that MapView.tsx uses to opt into
 *      `canvasContextAttributes: { preserveDrawingBuffer: true }` — the flag
 *      MUST be nested there in MapLibre v5; the top-level MapOptions field of
 *      the same name is silently ignored (this exact mistake produced a
 *      false "blank" reading during manual verification once already).
 *      The flag costs a little GPU memory, so real visitors never get it —
 *      only this script's exact URL shape does.
 *   4. Reads the WebGL drawing buffer directly (one readPixels call) and
 *      checks for: (a) more than a handful of distinct colors (not a
 *      uniformly blank/cleared frame), (b) pixels that look like the
 *      Positron basemap, and (c) pixels matching this app's actual data
 *      colors (crash red, the four status colors) — i.e. the basemap AND
 *      the data layers both actually painted, not just one or neither.
 *
 * Run it with:   npm run verify:map
 *                npm run verify:map -- --skip-build   (reuse an existing dist/)
 *
 * Exits 0 on pass, 1 on any failure, with a clear reason either way.
 */
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = new URL('..', import.meta.url)
const skipBuild = process.argv.includes('--skip-build')

// This app's actual paint colors (src/components/MapView.tsx COLORS / STATUS_COLOR).
// A pixel "matches" one of these if it's within a small distance in RGB space —
// tolerance absorbs anti-aliasing blend with whatever sits behind it.
const DATA_COLORS = [
  [0xb3, 0x26, 0x1e], // crash red
  [0x00, 0x72, 0xb2], // status: announced
  [0x56, 0xb4, 0xe9], // status: design
  [0xe6, 0x9f, 0x00], // status: construction
  [0x00, 0x9e, 0x73], // status: complete
]
const COLOR_TOLERANCE = 22

function log(msg) {
  console.log(msg)
}
function fail(msg) {
  console.error(`\n✗ FAIL: ${msg}`)
  process.exitCode = 1
}

function colorDistance(r, g, b, target) {
  return Math.sqrt((r - target[0]) ** 2 + (g - target[1]) ** 2 + (b - target[2]) ** 2)
}

/** Find a free TCP port by actually binding one, starting from `start`. */
function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', () => {
      if (start > 65000) return reject(new Error('no free port found'))
      resolve(findFreePort(start + 1))
    })
    srv.listen(start, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** Poll a URL until it responds (any status), or throw after `timeoutMs`. */
async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${url} did not respond within ${timeoutMs}ms`)
}

/**
 * Start `vite preview` directly via its local CLI binary (not `npx`, which
 * adds a shell/wrapper layer whose stdout is unreliable to parse cross-
 * platform) on a port we've confirmed is free, and confirm it up via HTTP
 * polling rather than scraping its banner text.
 */
async function startPreview() {
  const port = await findFreePort(4319)
  const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
  const child = spawn(process.execPath, [viteCli, 'preview', '--port', String(port), '--strictPort'], {
    cwd: fileURLToPath(ROOT),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', (d) => (out += d.toString()))
  child.stderr.on('data', (d) => (out += d.toString()))

  const url = `http://localhost:${port}`
  try {
    await waitForHttp(url, 20_000)
  } catch (err) {
    child.kill()
    throw new Error(`${err.message}\nvite preview output so far:\n${out}`)
  }
  return { url, kill: () => child.kill() }
}

async function main() {
  if (!skipBuild) {
    log('Building production bundle (npm run build)...')
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })
  } else {
    log('Skipping build (--skip-build) — using the existing dist/.')
  }

  log('Starting `vite preview`...')
  const preview = await startPreview()
  log(`Preview server up at ${preview.url}`)

  let browser
  try {
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

    // IMPORTANT: the debug flag is a real query string (before '#'), not part
    // of the app's own hash-based router params — window.location.search is
    // independent of location.hash, which is what the app's router reads.
    const targetUrl = `${preview.url}/?verifyMap=1#/`
    log(`Loading ${targetUrl} ...`)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })

    log('Waiting for the map canvas to mount...')
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15_000 })

    // Best-effort settle: network idle if it happens quickly, plus a fixed
    // floor so MapLibre finishes its first paint. The pixel check below is
    // the real arbiter, not this wait.
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {})
    await page.waitForTimeout(1_500)

    log('Reading the WebGL drawing buffer...')
    const result = await page.evaluate(
      ({ dataColors, tolerance }) => {
        const canvas = document.querySelector('.maplibregl-canvas')
        if (!canvas) return { error: 'no .maplibregl-canvas element found' }
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
        if (!gl) return { error: 'canvas has no WebGL context' }
        const attrs = gl.getContextAttributes()
        if (!attrs || !attrs.preserveDrawingBuffer) {
          return {
            error:
              'preserveDrawingBuffer is not set on the live context — the ?verifyMap=1 hook did not ' +
              'take effect (check MapView.tsx reads window.location.search correctly, and that the ' +
              'flag is nested under canvasContextAttributes, not top-level MapOptions)',
          }
        }
        const w = canvas.width
        const h = canvas.height
        if (w === 0 || h === 0) {
          return { error: `canvas has zero size (${w}x${h}) — the map container likely collapsed` }
        }

        // Layout sanity, independent of pixel content: a CSS regression can
        // shrink the container to some small-but-nonzero size (observed: a
        // variant of this exact bug rendered a real, non-blank 300px-tall
        // strip instead of the ~700px+ available — content-only checks below
        // would have PASSED that, even though a real visitor sees a mostly
        // blank page under a thin map sliver). Compare the canvas against its
        // `.map-stage` parent, which should size to fill the viewport below
        // the header/banner chrome.
        const stage = document.querySelector('.map-stage')
        const stageRect = stage ? stage.getBoundingClientRect() : null
        const canvasRect = canvas.getBoundingClientRect()
        if (stageRect && stageRect.height > 0) {
          const fillRatio = canvasRect.height / stageRect.height
          if (fillRatio < 0.85) {
            return {
              error:
                `map canvas fills only ${Math.round(fillRatio * 100)}% of its .map-stage container's ` +
                `height (${Math.round(canvasRect.height)}px of ${Math.round(stageRect.height)}px) — ` +
                'a real visitor would see a cropped/broken map even though it is not literally blank',
            }
          }
        }

        const buf = new Uint8Array(w * h * 4)
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)

        const STRIDE = 7 // sample every 7th pixel in each direction — dense enough, fast
        const seen = new Set()
        let basemapish = 0
        let dataHits = 0
        let sampled = 0
        for (let y = 0; y < h; y += STRIDE) {
          for (let x = 0; x < w; x += STRIDE) {
            const i = (y * w + x) * 4
            const r = buf[i]
            const g = buf[i + 1]
            const b = buf[i + 2]
            sampled++
            seen.add(`${r >> 4},${g >> 4},${b >> 4}`)
            const avg = (r + g + b) / 3
            const spread = Math.max(r, g, b) - Math.min(r, g, b)
            if (avg > 170 && spread < 40) basemapish++
            for (const c of dataColors) {
              const dr = r - c[0]
              const dg = g - c[1]
              const db = b - c[2]
              if (Math.sqrt(dr * dr + dg * dg + db * db) < tolerance) {
                dataHits++
                break
              }
            }
          }
        }
        return {
          bufferSize: [w, h],
          sampled,
          distinctQuantizedColors: seen.size,
          basemapishPixels: basemapish,
          dataColorPixels: dataHits,
        }
      },
      { dataColors: DATA_COLORS, tolerance: COLOR_TOLERANCE },
    )

    if (result.error) {
      fail(result.error)
      return
    }

    log('')
    log(`  Drawing buffer:        ${result.bufferSize[0]}x${result.bufferSize[1]}`)
    log(`  Pixels sampled:        ${result.sampled}`)
    log(`  Distinct colors:       ${result.distinctQuantizedColors}`)
    log(`  Basemap-like pixels:   ${result.basemapishPixels}`)
    log(`  Data-color pixels:     ${result.dataColorPixels}  (crash red / project status colors)`)
    log('')

    const checks = [
      [result.distinctQuantizedColors > 5, `frame is not blank (need > 5 distinct colors, got ${result.distinctQuantizedColors})`],
      [result.basemapishPixels > 0, 'basemap tiles painted (need > 0 pale/basemap-like pixels)'],
      [result.dataColorPixels > 0, 'data layers painted (need > 0 pixels matching crash/project colors)'],
    ]
    const failed = checks.filter(([ok]) => !ok)
    if (failed.length > 0) {
      failed.forEach(([, msg]) => fail(msg))
    } else {
      log('✓ PASS — the map renders: basemap and data layers both produced real pixels.')
    }
  } finally {
    await browser?.close()
    preview.kill()
  }
}

main().catch((err) => {
  fail(err.stack || String(err))
})
