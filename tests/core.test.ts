import assert from 'node:assert/strict'
import test from 'node:test'
import { unzipSync } from 'fflate'
import { makeZip } from '../src/core/archive.ts'
import type { CapturedFrame } from '../src/core/media.ts'
import { frameName, sampleTimes } from '../src/core/sampling.ts'

test('count sampling uses range midpoints, including a single frame and short clips', () => {
  assert.deepEqual(sampleTimes(10, 2, 10, { mode: 'count', count: 4 }), [3, 5, 7, 9])
  assert.deepEqual(sampleTimes(0.1, 0, 0.1, { mode: 'count', count: 1 }), [0.05])
  assert.ok(sampleTimes(0.1, 0, 0.1, { mode: 'count', count: 30 }).every(time => time < 0.1))
})

test('interval sampling starts at the range start and never reaches the end', () => {
  assert.deepEqual(sampleTimes(10, 2, 10, { mode: 'interval', interval: 3 }), [2, 5, 8])
  assert.deepEqual(sampleTimes(10, 0, 10, { mode: 'interval', interval: 5 }), [0, 5])
})

test('invalid ranges, counts, and intervals are rejected before capture', () => {
  assert.throws(() => sampleTimes(Infinity, 0, 1, { mode: 'count', count: 1 }))
  assert.throws(() => sampleTimes(10, 1, 1, { mode: 'count', count: 1 }))
  assert.throws(() => sampleTimes(10, 0, 11, { mode: 'count', count: 1 }))
  assert.throws(() => sampleTimes(10, 0, 10, { mode: 'count', count: 31 }))
  assert.throws(() => sampleTimes(10, 0, 10, { mode: 'interval', interval: 0 }))
  assert.throws(() => sampleTimes(10, 0, 10, { mode: 'interval', interval: 0.01 }))
})

test('sequence names stay unique for repeated timestamps', () => {
  assert.notEqual(frameName(0, 1), frameName(1, 1))
  assert.equal(frameName(0, 1.234), 'frame-001-1234ms.png')
})

test('ZIP contains only selected original PNG bytes with stable names', async () => {
  const bytesA = Uint8Array.of(137, 80, 78, 71, 1)
  const bytesB = Uint8Array.of(137, 80, 78, 71, 2)
  const frame = (index: number, bytes: Uint8Array): CapturedFrame => ({
    index, requestedTime: index, decodedTime: null, duplicate: false,
    name: frameName(index, index), blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
  })
  const zip = await makeZip([frame(0, bytesA), frame(2, bytesB)])
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()))
  assert.deepEqual(Object.keys(entries), ['frame-001-0ms.png', 'frame-003-2000ms.png'])
  assert.deepEqual(entries['frame-001-0ms.png'], bytesA)
  assert.deepEqual(entries['frame-003-2000ms.png'], bytesB)
})

test('ZIP creation can be cancelled before it starts', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(makeZip([{ index: 0, requestedTime: 0, decodedTime: null, duplicate: false, name: 'one.png', blob: new Blob(['x']) }], controller.signal), { name: 'AbortError' })
})
