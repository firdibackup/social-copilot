// Run with PLAYWRIGHT_MODULE pointing to an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const out = process.env.QA_OUTPUT || '/tmp/carousely-homepage-qa'
fs.mkdirSync(out, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const results = []
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } })
      const errors = [], apiCalls = []
      page.on('pageerror', e => errors.push(e.message))
      page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(r.url()) })
      await page.goto(process.env.QA_URL || 'http://127.0.0.1:3042', { waitUntil: 'networkidle' })
      const name = mobile ? 'mobile' : 'desktop'
      assert.match(await page.locator('h1').innerText(), /Social media aktif./)
      assert.equal(await page.locator('section[aria-labelledby="hero-title"] .mimo-mascot').count(), 0)
      assert.equal(await page.locator('[aria-label="Panduan Mimo"]').getAttribute('data-active'), '-1')
      const gallery = page.locator('[aria-label="Galeri 20 contoh carousel"]')
      assert.equal(await gallery.locator('img').evaluateAll(imgs => new Set(imgs.map(i => i.getAttribute('src'))).size), 20)
      await page.getByRole('button', { name: 'Jeda galeri', exact: true }).click()
      assert.equal(await gallery.getAttribute('data-paused'), 'true')
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({ path: `${out}/${name}-hero.png` })
      await page.getByRole('button', { name: 'Putar galeri', exact: true }).click()
      assert.equal(await gallery.getAttribute('data-paused'), 'false')
      let lastX
      for (const [i, id] of ['jadwal', 'asisten', 'desain', 'auto-dm'].entries()) {
        await page.locator(`#${id}`).evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY))
        await page.waitForTimeout(1000)
        const guide = page.locator('[aria-label="Panduan Mimo"]')
        assert.equal(await guide.getAttribute('data-active'), String(i))
        const box = await guide.boundingBox()
        assert.ok(box.x >= 0 && box.x + box.width <= (mobile ? 390 : 1440))
        if (!mobile && lastX !== undefined) assert.ok(Math.abs(box.x - lastX) > 300)
        lastX = box.x
        await page.screenshot({ path: `${out}/${name}-${id}.png` })
      }
      await page.getByLabel('Minggu berikutnya').click()
      assert.match(await page.locator('#jadwal').innerText(), /28 Oktober/)
      await page.getByRole('button', { name: 'Buat konten', exact: true }).click()
      assert.match(await page.locator('#asisten').innerText(), /DRAF CAROUSEL/)
      await page.getByRole('button', { name: 'Susun jadwal', exact: true }).click()
      assert.match(await page.locator('#asisten').innerText(), /Menunggu tinjauan kamu/)
      await page.getByRole('button', { name: 'Contoh unggahan', exact: true }).click()
      await page.getByRole('button', { name: 'Coba buat desain', exact: true }).click()
      assert.match(await page.locator('#desain').innerText(), /Draf demo siap/)
      await page.getByLabel('Coba komentar').fill('halo')
      await page.getByRole('button', { name: 'Uji Auto DM' }).click()
      assert.match(await page.locator('#auto-dm').innerText(), /belum cocok/)
      await page.getByLabel('Coba komentar').fill(' info ')
      await page.getByRole('button', { name: 'Uji Auto DM' }).click()
      assert.match(await page.locator('#auto-dm').innerText(), /Kata pemicu cocok/)
      await page.screenshot({ path: `${out}/${name}-dm-result.png` })
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(600)
      assert.equal(await page.locator('[aria-label="Panduan Mimo"]').getAttribute('data-active'), '-1')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      if (mobile) {
        await page.getByRole('button', { name: 'Buka menu' }).click()
        await page.locator('#landing-mobile-menu').getByRole('link', { name: 'Harga', exact: true }).click()
        assert.equal(await page.locator('#landing-mobile-menu').count(), 0)
      }
      assert.equal(await page.locator('#harga').count(), 1)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForTimeout(200)
      assert.equal(await gallery.getAttribute('data-paused'), 'true')
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForFunction(() => document.querySelector('[aria-label="Galeri 20 contoh carousel"]').dataset.paused === 'true')
      assert.equal(await gallery.getAttribute('data-paused'), 'true')
      assert.equal(await gallery.locator('div').first().evaluate(el => getComputedStyle(el).animationName), 'none')
      assert.deepEqual(errors, [])
      assert.deepEqual(apiCalls, [])
      results.push({ viewport: name, passed: true, consoleErrors: errors, apiCalls })
      await page.close()
    }
    fs.writeFileSync(`${out}/browser-results.json`, JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
