import { useEffect, useRef, useState } from 'react'
import { formatTime, makeZip, MAX_ZIP_BYTES, sampleTimes, VideoSession } from './core/index.ts'
import type { CapturedFrame, Sampling, VideoInfo } from './core/index.ts'

type PreviewFrame = CapturedFrame & { previewUrl: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try another file.'
}

export function App({ embedded = false }: { embedded?: boolean } = {}) {
  const session = useRef<VideoSession | null>(null)
  const operation = useRef<AbortController | null>(null)
  const previews = useRef<PreviewFrame[]>([])
  const downloadUrls = useRef<Set<string>>(new Set())
  const [fileName, setFileName] = useState('')
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [mode, setMode] = useState<'count' | 'interval'>('count')
  const [count, setCount] = useState(8)
  const [interval, setIntervalValue] = useState(2)
  const [frames, setFrames] = useState<PreviewFrame[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob)
    downloadUrls.current.add(url)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      downloadUrls.current.delete(url)
    }, 60000)
  }

  function clearFrames() {
    previews.current.forEach(frame => URL.revokeObjectURL(frame.previewUrl))
    previews.current = []
    setFrames([])
    setSelected(new Set())
  }

  function reset() {
    operation.current?.abort()
    operation.current = null
    session.current?.close()
    session.current = null
    downloadUrls.current.forEach(url => URL.revokeObjectURL(url))
    downloadUrls.current.clear()
    clearFrames()
    setInfo(null)
    setFileName('')
    setError('')
    setNotice('')
    setProgress('')
    setBusy(false)
  }

  useEffect(() => () => {
    operation.current?.abort()
    session.current?.close()
    previews.current.forEach(frame => URL.revokeObjectURL(frame.previewUrl))
    downloadUrls.current.forEach(url => URL.revokeObjectURL(url))
    downloadUrls.current.clear()
  }, [])

  async function selectFile(file?: File) {
    reset()
    if (!file) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setProgress('Reading video metadata…')
    try {
      const next = await VideoSession.open(file, controller.signal)
      if (operation.current !== controller) { next.close(); return }
      session.current = next
      setFileName(file.name)
      setInfo(next.info)
      setStart(0)
      setEnd(next.info.duration)
      setProgress('')
    } catch (cause) {
      if (operation.current === controller && !(cause instanceof DOMException && cause.name === 'AbortError')) setError(errorMessage(cause))
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false) }
    }
  }

  async function extract() {
    const current = session.current
    if (!current || !info) return
    setError('')
    setNotice('')
    let times: number[]
    try {
      const sampling: Sampling = mode === 'count' ? { mode, count } : { mode, interval }
      times = sampleTimes(info.duration, start, end, sampling)
      if (current.estimateBytes(times.length) > 256 * 1024 ** 2) {
        throw new Error('This batch could use too much memory. Reduce the count or choose a smaller video.')
      }
    } catch (cause) { setError(errorMessage(cause)); return }
    clearFrames()
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setProgress(`Capturing 0 of ${times.length}…`)
    try {
      await current.capture(times, frame => {
        if (operation.current !== controller) return
        const preview: PreviewFrame = { ...frame, previewUrl: URL.createObjectURL(frame.blob) }
        previews.current = [...previews.current, preview]
        setFrames(previews.current)
        setSelected(previous => new Set(previous).add(frame.index))
        setProgress(`Capturing ${frame.index + 1} of ${times.length}…`)
      }, controller.signal)
      if (operation.current === controller) setNotice(`${times.length} PNG ${times.length === 1 ? 'frame is' : 'frames are'} ready. Choose which to export.`)
    } catch (cause) {
      if (operation.current === controller) {
        clearFrames()
        setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'Capture cancelled. No frames were kept.' : errorMessage(cause))
      }
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); setProgress('') }
    }
  }

  function cancel() {
    operation.current?.abort()
    setNotice('')
  }

  function toggle(index: number) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const chosen = frames.filter(frame => selected.has(frame.index))
  const zipBytes = chosen.reduce((sum, frame) => sum + frame.blob.size, 0)

  async function exportZip() {
    setError('')
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setProgress('Creating ZIP on this device…')
    try {
      const blob = await makeZip(chosen, controller.signal)
      if (operation.current === controller) download(blob, 'video-frames.zip')
    } catch (cause) {
      if (operation.current === controller) setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'ZIP creation cancelled.' : errorMessage(cause))
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); setProgress('') }
    }
  }

  const MainTag = embedded ? 'div' : 'main'
  return <div className={embedded ? 'site embedded' : 'site'}>
    {!embedded && <header className="topbar"><a className="brand" href="https://onehorizon.ai/" aria-label="One Horizon home"><span className="brand-mark">◧</span> One Horizon</a><span className="topbar-label">Free local tools</span></header>}
    <MainTag className="content">
      <div className="hero"><p className="eyebrow">A lighter way to find your stills</p><h1>Video frame extractor</h1><p className="intro">Turn a local video into a small set of timestamped PNGs. Review the frames, keep the useful ones, and export them directly from your browser.</p><div className="privacy"><span aria-hidden="true">●</span> Your video and images stay on this device. No account or upload.</div></div>
      <div className="workspace">
        <section className="panel setup" aria-labelledby="choose-title"><div className="section-heading"><span className="step">01</span><div><h2 id="choose-title">Choose a video</h2><p>Use a file your browser can play, such as a supported MP4 or WebM.</p></div></div>
          <label className="file-picker"><input type="file" accept="video/*" onChange={event => { void selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /><span>Select local video</span><span aria-hidden="true">↗</span></label>
          {info && <div className="file-details"><strong>{fileName}</strong><span>{formatTime(info.duration)} · {info.width} × {info.height} source · {info.outputWidth} × {info.outputHeight} PNG</span><button className="text-button" type="button" onClick={reset}>Remove video and frames</button></div>}
        </section>
        <section className="panel controls" aria-labelledby="capture-title"><div className="section-heading"><span className="step">02</span><div><h2 id="capture-title">Choose your frames</h2><p>Set a range, then sample by count or interval.</p></div></div>
          <div className="form-grid"><label>Start (seconds)<input type="number" min="0" max={info?.duration} step="0.001" value={start} disabled={!info || busy} onChange={event => setStart(event.currentTarget.valueAsNumber)} /></label><label>End (seconds)<input type="number" min="0" max={info?.duration} step="0.001" value={end} disabled={!info || busy} onChange={event => setEnd(event.currentTarget.valueAsNumber)} /></label><label>Sampling<select value={mode} disabled={!info || busy} onChange={event => setMode(event.currentTarget.value as 'count' | 'interval')}><option value="count">Even count</option><option value="interval">Time interval</option></select></label>{mode === 'count' ? <label>Number of frames<input type="number" min="1" max="30" step="1" value={count} disabled={!info || busy} onChange={event => setCount(event.currentTarget.valueAsNumber)} /></label> : <label>Every (seconds)<input type="number" min="0.001" step="0.001" value={interval} disabled={!info || busy} onChange={event => setIntervalValue(event.currentTarget.valueAsNumber)} /></label>}</div>
          <p className="hint">{mode === 'count' ? 'Frames are requested at the midpoint of each equal part of the range. One frame uses the range midpoint.' : 'Frames are requested at the start, then at each interval strictly before the end.'} Browser seeking may show a nearby decoded frame.</p>
          <div className="actions"><button className="primary" type="button" disabled={!info || busy} onClick={() => void extract()}>Extract frames <span aria-hidden="true">→</span></button>{busy && <button className="secondary" type="button" onClick={cancel}>Cancel</button>}</div>
          {busy && <p className="status" role="status">{progress}</p>}
          {error && <p className="message error" role="alert">{error}</p>}
          {notice && <p className="message success" role="status">{notice}</p>}
        </section>
      </div>
      <section className="results" aria-labelledby="results-title"><div className="results-heading"><div className="section-heading"><span className="step">03</span><div><h2 id="results-title">Review &amp; export</h2><p>{frames.length ? `${frames.length} captured · ${selected.size} selected` : 'Your captured frames will appear here.'}</p></div></div>{frames.length > 0 && <div className="result-actions"><button className="secondary" type="button" disabled={!selected.size || busy} onClick={() => chosen.forEach(frame => download(frame.blob, frame.name))}>Download selected PNGs</button><button className="primary" type="button" disabled={!selected.size || zipBytes > MAX_ZIP_BYTES || busy} onClick={() => void exportZip()}>Download ZIP <span aria-hidden="true">↓</span></button></div>}</div>
        {zipBytes > MAX_ZIP_BYTES && <p className="message error">Selected images exceed the 64 MiB ZIP limit. Download individual PNGs instead.</p>}
        {frames.length ? <div className="frame-grid">{frames.map(frame => <article className="frame-card" key={frame.index}><img src={frame.previewUrl} alt={`Captured frame ${frame.index + 1} requested at ${formatTime(frame.requestedTime)}`} /><div className="frame-meta"><label className="frame-select"><input type="checkbox" checked={selected.has(frame.index)} onChange={() => toggle(frame.index)} /> <strong>Frame {String(frame.index + 1).padStart(2, '0')}</strong></label><dl><div><dt>Requested</dt><dd>{formatTime(frame.requestedTime)}</dd></div><div><dt>Decoded</dt><dd>{frame.decodedTime === null ? 'Unavailable' : formatTime(frame.decodedTime)}</dd></div></dl>{frame.duplicate && <p className="duplicate">Same decoded time as an earlier frame</p>}<button className="text-button" type="button" onClick={() => download(frame.blob, frame.name)}>Download PNG ↓</button></div></article>)}</div> : <div className="empty"><span aria-hidden="true">▧</span><p>Frames you capture will be shown here for selection.</p></div>}
      </section>
      <aside className="limits"><h2>Good to know</h2><p>Capture is limited to 30 frames, a 2 GiB source file, and resized PNGs up to 1920 × 1080 pixels. Browser codec support varies; the file extension alone does not guarantee playback. Decoded times are shown only when the browser reports them. The browser may return the same frame for nearby requests.</p></aside>
    </MainTag>
    {!embedded && <footer><span>Made by <a href="https://onehorizon.ai/">One Horizon</a></span><a href="https://github.com/onehorizonai/video-frame-extractor">View source</a></footer>}
  </div>
}
