/* eslint-disable @typescript-eslint/no-require-imports -- Uses an externally supplied Playwright installation. */
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright QA_URL=http://127.0.0.1:3042 node scripts/homepage-e2e.cjs
// Optional: QA_OUTPUT, CHROME_PATH (existing executable), CHROME_CHANNEL (e.g. chrome).
// Does not start a server, install dependencies or submit account forms.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const url = process.env.QA_URL || 'http://127.0.0.1:3042'
const out = process.env.QA_OUTPUT || path.join(os.tmpdir(), 'carousely-orbit-qa')
fs.mkdirSync(out, { recursive: true })
const results = []
const cases = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'desktop-compact', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-small', width: 320, height: 568 },
  { name: 'landscape', width: 844, height: 390 },
]

async function paused(page, value) {
  await page.waitForFunction(expected => document.querySelector('[data-orbit-stage]')?.dataset.paused === String(expected), value)
}

async function top(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForFunction(() => scrollY < 2)
}

async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  assert.ok(sizes.document <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, `Horizontal overflow: ${JSON.stringify(sizes)}`)
}

// Clip card bounds to the stage and viewport before checking copy clearance.
// Ancestor opacity matters (e.g. an intentionally invisible card at a phase).
async function geometry(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-orbit-stage]')
    const copy = document.querySelector('[data-orbit-copy]')
    const rect = el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const s = rect(stage), c = rect(copy), ring = rect(document.querySelector('[data-orbit-ring]'))
    const collisions = [], tilted = []
    for (const [index, card] of [...stage.querySelectorAll('[data-orbit-card]')].entries()) {
      let opacity = 1, matrix = new DOMMatrix()
      let visible = true
      let bounds = rect(card)
      for (let el = card; el; el = el.parentElement) {
        const style = getComputedStyle(el)
        opacity *= Number(style.opacity)
        visible &&= style.visibility !== 'hidden' && style.display !== 'none'
        if (style.transform !== 'none') matrix = new DOMMatrix(style.transform).multiply(matrix)
        if (el !== card && /(hidden|clip|scroll|auto)/.test(style.overflowX + style.overflowY)) {
          const clip = rect(el)
          bounds = { left: Math.max(bounds.left, clip.left), right: Math.min(bounds.right, clip.right), top: Math.max(bounds.top, clip.top), bottom: Math.min(bounds.bottom, clip.bottom) }
        }
      }
      bounds = { left: Math.max(bounds.left, s.left, 0), right: Math.min(bounds.right, s.right, innerWidth), top: Math.max(bounds.top, s.top, 0), bottom: Math.min(bounds.bottom, s.bottom, innerHeight) }
      if (!visible || opacity < .05 || bounds.right <= bounds.left || bounds.bottom <= bounds.top) continue
      if (Math.min(bounds.right, c.right) - Math.max(bounds.left, c.left) > 1 && Math.min(bounds.bottom, c.bottom) - Math.max(bounds.top, c.top) > 1) collisions.push(index)
      const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
      if (Math.abs(angle) > 1) tilted.push({ index, angle })
    }
    return { stage: s, copy: c, ring, collisions, tilted, separated: c.top >= s.bottom - 2 }
  })
}

async function sampleCycle(page, label, record) {
  const local = page.locator('[data-orbit-toggle]')
  await local.click()
  await paused(page, true)
  await page.waitForFunction(() => document.querySelector('[data-orbit-stage]').getAnimations({ subtree: true }).every(a => a.playState === 'paused' || a.playState === 'finished'))
  const animations = await page.locator('[data-orbit-stage]').evaluate(stage => stage.getAnimations({ subtree: true }).map(a => ({ duration: a.effect.getTiming().duration, iterations: String(a.effect.getTiming().iterations), playState: a.playState })))
  assert.ok(animations.length > 0, 'Expected seekable WAAPI/CSS orbit animations; cannot claim cycle coverage without them')
  assert.ok(animations.every(a => a.playState === 'paused' || a.playState === 'finished'), 'UI pause must freeze every stage animation before seeking')
  record.animations = animations
  record.cycleSamples = 0
  record.screenshots = []
  // 73 samples cover a complete 18-second cycle, including its wrap boundary.
  for (let time = 0; time <= 18000; time += 250) {
    await page.locator('[data-orbit-stage]').evaluate((stage, ms) => {
      // Seek only: calling pause() here would override CSS play-state ownership
      // and could prevent the real UI control from resuming its animations.
      for (const animation of stage.getAnimations({ subtree: true })) animation.currentTime = ms
    }, time)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())))
    const g = await geometry(page)
    assert.deepEqual(g.collisions, [], `${label}: cards overlap copy at ${time}ms: ${JSON.stringify(g)}`)
    assert.deepEqual(g.tilted, [], `${label}: cards not upright at ${time}ms`)
    if (time === 0) {
      record.layout = g
      if (record.viewport.width >= 1024 && record.viewport.height >= 800) assert.equal(g.separated, false, 'Spacious desktop must center copy inside the ring')
      if (record.viewport.width <= 390 || record.viewport.height <= 400) assert.equal(g.separated, true, 'Mobile/compact landscape must separate visual and copy')
      if (!g.separated) {
        assert.ok(Math.abs(g.copy.x - g.ring.x) <= 32, `Copy not horizontally centered: ${JSON.stringify(g)}`)
        assert.ok(Math.abs(g.copy.y - g.ring.y) <= 48, `Copy not vertically centered: ${JSON.stringify(g)}`)
      }
    }
    await noOverflow(page)
    record.cycleSamples++
    if ([0, 3000, 6000, 9000, 12000, 15000, 18000].includes(time)) {
      const file = `${label}-phase-${time}.png`
      await page.screenshot({ path: path.join(out, file) })
      record.screenshots.push(file)
    }
  }
  await local.click()
  await paused(page, false)
  await page.waitForFunction(() => document.querySelector('[data-orbit-stage]').getAnimations({ subtree: true }).some(a => a.playState === 'running'))
}

async function interactions(page, record) {
  const local = page.locator('[data-orbit-toggle]')
  const footer = page.locator('footer button[aria-pressed]')
  // Local pause is the same user state exposed by the existing footer.
  await local.click()
  await paused(page, true)
  assert.equal(await footer.getAttribute('aria-pressed'), 'true')
  const times = () => page.locator('[data-orbit-stage]').evaluate(stage => stage.getAnimations({ subtree: true }).map(a => a.currentTime))
  const before = await times()
  await page.waitForTimeout(120)
  assert.deepEqual(await times(), before, 'User pause must freeze animations')
  await footer.click()
  assert.equal(await footer.getAttribute('aria-pressed'), 'false')
  await top(page)
  await paused(page, false)
  await footer.click()
  await top(page)
  await paused(page, true)
  await local.click()
  await paused(page, false)

  await page.locator('[data-orbit-copy] a[href="#konten"]').click()
  await page.waitForURL(u => u.hash === '#konten')
  await page.waitForFunction(() => {
    const r = document.querySelector('#konten').getBoundingClientRect()
    return r.top < innerHeight && r.bottom > 0
  })
  await page.waitForFunction(() => document.querySelector('[data-orbit-hero]').getBoundingClientRect().bottom <= 0)
  await paused(page, true) // Offscreen, not a user pause.
  assert.equal(await footer.getAttribute('aria-pressed'), 'false')
  const folder = page.locator('#konten [data-folder="beauty"] button[aria-expanded]')
  await folder.click()
  await page.waitForFunction(() => document.querySelector('#konten [data-folder="beauty"] button')?.getAttribute('aria-expanded') === 'true')
  await page.waitForFunction(() => document.querySelectorAll('#konten figure').length === 5)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelectorAll('#konten button[aria-expanded="false"]').length === 4)
  await top(page)
  await paused(page, false)
  if (record.viewport.width === 390) {
    await page.locator('button[aria-controls="landing-mobile-menu"]').click()
    await page.locator('#landing-mobile-menu a[href="#harga"]').click()
    await page.waitForURL(u => u.hash === '#harga')
    assert.equal(await page.locator('#landing-mobile-menu').count(), 0)
    await page.waitForFunction(() => document.querySelector('#harga').getBoundingClientRect().top < innerHeight)
    await top(page)
    await paused(page, false)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await paused(page, true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await top(page)
  await paused(page, true)
  await page.waitForFunction(() => document.querySelector('[data-orbit-stage]').getAnimations({ subtree: true }).every(a => a.playState !== 'running'))
  assert.deepEqual((await geometry(page)).collisions, [], 'Reduced-motion composition overlaps copy')
  await noOverflow(page)
  await page.screenshot({ path: path.join(out, `${record.name}-reduced-motion.png`) })
  // Follow the actual registration link, without filling/submitting any account form.
  await page.locator('[data-orbit-copy] a[href="/daftar"]').click()
  await page.waitForURL(u => u.pathname === '/daftar')
  record.interactions = 'local/footer pause, offscreen, showcase anchor/folder/Escape, reduced motion + reload, registration navigation; mobile menu at 390px'
}

;(async () => {
  const launch = { headless: true }
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH
  else if (process.env.CHROME_CHANNEL) launch.channel = process.env.CHROME_CHANNEL
  const browser = await chromium.launch(launch)
  try {
    for (const locale of ['id', 'en']) {
      for (const size of cases) {
        const name = `${locale}-${size.name}`
        const record = { name, locale, viewport: { width: size.width, height: size.height }, passed: false, consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], imageFailures: [] }
        results.push(record)
        const context = await browser.newContext({ viewport: record.viewport, reducedMotion: 'no-preference' })
        // src/i18n/locale-config.ts LOCALE_COOKIE, consumed by getUserLocale().
        await context.addCookies([{ name: 'locale', value: locale, url: new URL(url).origin }])
        const page = await context.newPage()
        page.on('console', msg => { if (msg.type() === 'error') record.consoleErrors.push(msg.text()) })
        page.on('pageerror', error => record.pageErrors.push(error.message))
        page.on('requestfailed', request => record.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }))
        page.on('response', response => { if (response.status() >= 400) record.httpErrors.push({ url: response.url(), status: response.status() }) })
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' })
          await page.locator('[data-orbit-hero]').waitFor()
          await page.evaluate(() => document.fonts.ready)
          await top(page)
          await paused(page, false)
          assert.equal(await page.locator('h1').count(), 1)
          record.documentLanguage = await page.locator('html').getAttribute('lang')
          assert.equal(record.documentLanguage, locale, 'Requested locale must reach the document, not silently fall back')
          const opening = JSON.parse(fs.readFileSync(path.join(__dirname, `../messages/${locale}/landing.json`), 'utf8')).story.opening
          const normalize = text => text.replace(/\s+/g, ' ').trim()
          record.heroTitle = normalize(await page.locator('[data-orbit-hero] h1').innerText())
          assert.equal(record.heroTitle, normalize(`${opening.title1} ${opening.title2}`), 'Hero title must match the requested language catalog')
          assert.equal(await page.locator('[data-orbit-hero]#fitur').count(), 1)
          assert.equal(await page.locator('[data-opening-chat], [data-mascot]').count(), 0)
          const cards = page.locator('[data-orbit-card]')
          assert.equal(await cards.count(), 20)
          const images = page.locator('[data-orbit-stage] img')
          assert.equal(await images.count(), 20)
          assert.equal(await images.evaluateAll(imgs => new Set(imgs.map(img => img.getAttribute('src'))).size), 20)
          await images.evaluateAll(imgs => Promise.all(imgs.map(img => img.decode().catch(() => undefined))))
          record.imageFailures = await images.evaluateAll(imgs => imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.currentSrc || img.src))
          assert.deepEqual(record.imageFailures, [], 'Orbit cover images failed to load')
          assert.equal(await images.evaluateAll(imgs => imgs.every(img => img.alt === '' && img.closest('[aria-hidden="true"]'))), true)
          assert.equal(await page.locator('#konten [data-folder]').count(), 4)
          assert.equal(await page.locator('#konten img').count(), 20)
          assert.equal(await page.locator('#konten img').evaluateAll(imgs => new Set(imgs.map(img => img.getAttribute('src'))).size), 20)
          await sampleCycle(page, name, record)
          // Interaction coverage is bounded to one desktop and one mobile case per locale.
          if (size.name === 'desktop' || size.name === 'mobile') await interactions(page, record)
          record.passed = true
        } catch (error) {
          record.failure = error.stack || String(error)
          await page.screenshot({ path: path.join(out, `${name}-failure.png`), fullPage: true }).catch(() => {})
        } finally {
          record.imageFailures.push(...await page.locator('img').evaluateAll(imgs => imgs.filter(img => img.complete && img.naturalWidth === 0).map(img => img.currentSrc || img.src)).catch(() => []))
          await context.close()
          const hasWarnings = ['consoleErrors', 'pageErrors', 'failedRequests', 'httpErrors', 'imageFailures'].some(key => record[key].length > 0)
          record.status = !record.passed ? 'failed' : hasWarnings ? 'limited' : 'passed'
          if (hasWarnings) record.limitation = 'Browser errors or resource failures were recorded. Hero assertions alone do not establish a clean page; orchestrator review is required.'
          fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(results, null, 2))
        }
      }
    }
  } finally { await browser.close() }
  // Existing backend/console failures are retained as warnings, not silently
  // conflated with hero failures. Inspect them in the JSON evidence report.
  console.log(JSON.stringify(results, null, 2))
  if (results.some(result => !result.passed)) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
