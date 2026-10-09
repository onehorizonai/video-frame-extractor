import { frameName, MAX_FRAMES } from './sampling.ts'

export const MAX_INPUT_BYTES = 2 * 1024 ** 3
export const MAX_SOURCE_PIXELS = 4096 * 4096
export const MAX_OUTPUT_PIXELS = 1920 * 1080
export const MAX_WORK_BYTES = 256 * 1024 ** 2
export const MAX_PNG_BYTES = 128 * 1024 ** 2

export interface VideoInfo {
  duration: number
  width: number
  height: number
  outputWidth: number
  outputHeight: number
}

export interface CapturedFrame {
  index: number
  requestedTime: number
  decodedTime: number | null
  duplicate: boolean
  name: string
  blob: Blob
}

function aborted(): DOMException {
  return new DOMException('Operation cancelled.', 'AbortError')
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted()
}

function waitForMedia(video: HTMLVideoElement, event: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(event, success)
      video.removeEventListener('error', failure)
      signal?.removeEventListener('abort', cancelled)
    }
    const success = () => { cleanup(); resolve() }
    const failure = () => { cleanup(); reject(new Error('The browser could not decode this video. Try a browser-playable MP4 or WebM file.')) }
    const cancelled = () => { cleanup(); reject(aborted()) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('The video did not respond in time. Try a shorter or different file.')) }, timeoutMs)
    video.addEventListener(event, success, { once: true })
    video.addEventListener('error', failure, { once: true })
    signal?.addEventListener('abort', cancelled, { once: true })
  })
}

function outputSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, 1920 / width, 1920 / height, Math.sqrt(MAX_OUTPUT_PIXELS / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}

async function waitForPresentedFrame(video: HTMLVideoElement, signal?: AbortSignal): Promise<number | null> {
  checkAbort(signal)
  if (!video.requestVideoFrameCallback) {
    await new Promise(resolve => setTimeout(resolve, 50))
    checkAbort(signal)
    return null
  }
  return new Promise((resolve, reject) => {
    let id: number | undefined
    const cleanup = () => {
      clearTimeout(timer)
      if (id !== undefined) video.cancelVideoFrameCallback?.(id)
      signal?.removeEventListener('abort', cancelled)
    }
    const cancelled = () => { cleanup(); reject(aborted()) }
    const timer = setTimeout(() => { cleanup(); resolve(null) }, 500)
    id = video.requestVideoFrameCallback((_now, metadata) => {
      cleanup()
      resolve(Number.isFinite(metadata.mediaTime) ? metadata.mediaTime : null)
    })
    signal?.addEventListener('abort', cancelled, { once: true })
  })
}

function canvasBlob(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (signal?.aborted) reject(aborted())
      else if (!blob || blob.type !== 'image/png') reject(new Error('This browser could not encode a PNG image.'))
      else resolve(blob)
    }, 'image/png')
  })
}

export class VideoSession {
  private video: HTMLVideoElement
  private canvas: HTMLCanvasElement
  private url: string
  private closed = false
  readonly info: VideoInfo

  private constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement, url: string, info: VideoInfo) {
    this.video = video
    this.canvas = canvas
    this.url = url
    this.info = info
  }

  static async open(file: File, signal?: AbortSignal): Promise<VideoSession> {
    if (!file.size) throw new Error('Choose a nonempty video file.')
    if (file.size > MAX_INPUT_BYTES) throw new Error('This file is over the 2 GiB browser safety limit. Try a smaller clip.')
    if (file.type && !file.type.startsWith('video/')) throw new Error('Choose a video file from your device.')
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    const canvas = document.createElement('canvas')
    const url = URL.createObjectURL(file)
    try {
      const metadata = waitForMedia(video, 'loadedmetadata', 15000, signal)
      video.src = url
      video.load()
      await metadata
      const { duration, videoWidth: width, videoHeight: height } = video
      if (!Number.isFinite(duration) || duration <= 0 || !width || !height || width * height > MAX_SOURCE_PIXELS) {
        throw new Error('This video has an unknown duration or unsupported dimensions (maximum 4096 × 4096).')
      }
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForMedia(video, 'loadeddata', 15000, signal)
      }
      if (!video.seekable.length || video.seekable.end(video.seekable.length - 1) < duration - 0.05) {
        throw new Error('This video is not seekable in this browser. Try a different browser-playable file.')
      }
      const output = outputSize(width, height)
      canvas.width = output.width
      canvas.height = output.height
      return new VideoSession(video, canvas, url, {
        duration, width, height, outputWidth: output.width, outputHeight: output.height,
      })
    } catch (error) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      canvas.width = canvas.height = 0
      throw error
    }
  }

  estimateBytes(frameCount: number): number {
    return this.info.outputWidth * this.info.outputHeight * 4 * frameCount
  }

  async capture(times: number[], onFrame: (frame: CapturedFrame) => void, signal?: AbortSignal): Promise<void> {
    if (this.closed) throw new Error('Select a video first.')
    if (!times.length || times.length > MAX_FRAMES) throw new Error(`Choose between 1 and ${MAX_FRAMES} frames.`)
    if (this.estimateBytes(times.length) > MAX_WORK_BYTES) {
      throw new Error('This batch could use too much memory. Reduce the frame count or use a smaller video.')
    }
    const context = this.canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas capture is unavailable in this browser.')
    let totalBytes = 0
    const seenTimes: number[] = []
    for (const [index, requestedTime] of times.entries()) {
      checkAbort(signal)
      if (!Number.isFinite(requestedTime) || requestedTime < 0 || requestedTime >= this.info.duration) {
        throw new Error('A requested time is outside the video.')
      }
      if (Math.abs(this.video.currentTime - requestedTime) > 0.0001 || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        const seeked = waitForMedia(this.video, 'seeked', 15000, signal)
        this.video.currentTime = requestedTime
        await seeked
      }
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForMedia(this.video, 'loadeddata', 15000, signal)
      }
      const decodedTime = await waitForPresentedFrame(this.video, signal)
      checkAbort(signal)
      context.drawImage(this.video, 0, 0, this.info.outputWidth, this.info.outputHeight)
      const blob = await canvasBlob(this.canvas, signal)
      totalBytes += blob.size
      if (totalBytes > MAX_PNG_BYTES) throw new Error('Captured images exceeded the 128 MiB safety limit. Use fewer frames or a smaller video.')
      onFrame({
        index, requestedTime, decodedTime,
        duplicate: decodedTime !== null && seenTimes.some(time => Math.abs(decodedTime - time) < 0.0005),
        name: frameName(index, requestedTime), blob,
      })
      if (decodedTime !== null) seenTimes.push(decodedTime)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    URL.revokeObjectURL(this.url)
    this.canvas.width = this.canvas.height = 0
  }
}
