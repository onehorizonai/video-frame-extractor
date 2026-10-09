import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { unzipSync } from 'fflate'

const fixture = process.env.VIDEO_FIXTURE
if (!fixture) throw new Error('Set VIDEO_FIXTURE to a local browser-playable video file.')
await stat(fixture)
const appUrl = new URL(process.env.APP_URL || 'http://127.0.0.1:5173/')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } })
const requests = []
page.on('request', request => requests.push(request.url()))
try {
  await page.goto(appUrl.href)
  await page.locator('input[type=file]').setInputFiles(fixture)
  await page.locator('.file-details').waitFor()
  await page.getByLabel('Number of frames').fill('3')
  await page.getByRole('button', { name: /Extract frames/ }).click()
  await page.locator('.frame-card').first().waitFor()
  await page.getByText('3 PNG frames are ready').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('.frame-card').count(), 3)
  assert.equal(await page.locator('.frame-card img').count(), 3)

  const previewBytes = Buffer.from(await page.locator('.frame-card img').first().evaluate(async image => {
    const response = await fetch(image.src)
    return [...new Uint8Array(await response.arrayBuffer())]
  }))
  const pngPromise = page.waitForEvent('download')
  await page.locator('.frame-card').first().getByRole('button', { name: 'Download PNG' }).click()
  const png = await pngPromise
  assert.deepEqual(await readFile(await png.path()), previewBytes)

  await page.locator('.frame-card').nth(1).getByRole('checkbox').uncheck()
  const zipPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download ZIP/ }).click()
  const zip = await zipPromise
  const entries = unzipSync(new Uint8Array(await readFile(await zip.path())))
  assert.deepEqual(Object.keys(entries).length, 2)
  assert.deepEqual(Buffer.from(Object.values(entries)[0]), previewBytes)

  if (process.env.ONE_WORKER_ARTIFACTS_DIR) {
    await page.screenshot({ path: join(process.env.ONE_WORKER_ARTIFACTS_DIR, 'extractor-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: join(process.env.ONE_WORKER_ARTIFACTS_DIR, 'extractor-mobile.png'), fullPage: true })
  }

  await page.getByLabel('Sampling').selectOption('interval')
  await page.getByLabel('Every (seconds)').fill('2')
  await page.getByRole('button', { name: /Extract frames/ }).click()
  await page.getByText('3 PNG frames are ready').waitFor({ timeout: 30000 })
  assert.deepEqual(await page.locator('.frame-card dl div:first-child dd').allTextContents(), ['00:00.000', '00:02.000', '00:04.000'])

  await page.getByLabel('Sampling').selectOption('count')
  await page.getByLabel('Number of frames').fill('30')
  await page.getByRole('button', { name: /Extract frames/ }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByText('Capture cancelled. No frames were kept.').waitFor({ timeout: 10000 })
  assert.equal(await page.locator('.frame-card').count(), 0)

  await page.locator('input[type=file]').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') })
  await page.getByRole('alert').waitFor({ timeout: 20000 })
  assert.equal(await page.locator('.frame-card').count(), 0)
  assert.ok(requests.every(url => new URL(url).origin === appUrl.origin || url.startsWith('blob:')), `Unexpected request: ${requests.join(', ')}`)
  console.log('Chrome smoke passed: count and interval capture, PNG identity, selected ZIP, cancellation, malformed input, responsive screenshots, and local requests.')
} finally {
  await browser.close()
}
