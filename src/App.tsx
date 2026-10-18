import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  FileImage,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react'
import './App.css'

const starterLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" fill="none">
  <path d="M200 25 237 106l89 10-66 60 18 87-78-45-78 45 18-87-66-60 89-10 37-81Z" fill="#F15B43"/>
  <circle cx="200" cy="140" r="45" fill="#F5F4EC"/>
  <circle cx="200" cy="140" r="27" fill="#173D36"/>
  <path d="M194 128h12v24h-12z" fill="#C6E5D8"/>
  <path d="M188 134h24v12h-24z" fill="#C6E5D8"/>
</svg>`

type Motion = 'Lift' | 'Orbit' | 'Pop'

function safeSvg(source: string) {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (root.tagName.toLowerCase() !== 'svg' || document.querySelector('parsererror')) {
    throw new Error('That file is not a valid SVG.')
  }

  root.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((node) => node.remove())
  root.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      const externalUrl = /url\(\s*["']?(?!#|data:image\/)[^)]/i.test(value)
      if (name.startsWith('on') || name === 'srcdoc' || /javascript:/i.test(value) || externalUrl) {
        element.removeAttribute(attribute.name)
      }
      if ((name === 'href' || name.endsWith(':href')) && value && !value.startsWith('#') && !value.startsWith('data:image/')) {
        element.removeAttribute(attribute.name)
      }
    })
  })
  return new XMLSerializer().serializeToString(root)
}

function motionTransform(motion: Motion, progress: number) {
  if (motion === 'Lift') {
    return { y: (1 - progress) * 34, rotation: 0, scale: 0.94 + progress * 0.06, opacity: 0.25 + progress * 0.75 }
  }
  if (motion === 'Orbit') {
    return { y: 0, rotation: (1 - progress) * -120, scale: 0.88 + progress * 0.12, opacity: 0.35 + progress * 0.65 }
  }
  const eased = 1 - (1 - progress) ** 3
  return { y: 0, rotation: 0, scale: 0.65 + eased * 0.35, opacity: 0.12 + eased * 0.88 }
}

function App() {
  const [logoMarkup, setLogoMarkup] = useState(starterLogo)
  const [fileName, setFileName] = useState('northstar-mark.svg')
  const [motion, setMotion] = useState<Motion>('Lift')
  const [duration, setDuration] = useState(3.5)
  const [progress, setProgress] = useState(0.64)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const playbackStart = useRef(0)

  useEffect(() => {
    if (!isPlaying) return
    let frame = 0
    const tick = (now: number) => {
      const nextProgress = Math.min((now - playbackStart.current) / (duration * 1000), 1)
      setProgress(nextProgress)
      if (nextProgress >= 1) setIsPlaying(false)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, isPlaying])

  const handleUpload = async (file?: File) => {
    if (!file) return
    try {
      setLogoMarkup(safeSvg(await file.text()))
      setFileName(file.name)
      setProgress(0.64)
      setNotice('SVG ready to animate')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read that SVG.')
    }
  }

  const exportVideo = async () => {
    if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
      setNotice('Video export is not supported here. Try a current version of Chrome or Safari.')
      return
    }

    setIsExporting(true)
    setNotice('Preparing your animation...')
    let imageUrl = ''
    try {
      const image = new Image()
      imageUrl = URL.createObjectURL(new Blob([logoMarkup], { type: 'image/svg+xml;charset=utf-8' }))
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('This SVG could not be rendered for export.'))
        image.src = imageUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1080
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas video export is unavailable.')
      const mimeType = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('This browser cannot encode a supported video format.')

      const stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })
      const drawFrame = (frameProgress: number) => {
        const values = motionTransform(motion, frameProgress)
        context.fillStyle = '#eff2eb'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.save()
        context.translate(canvas.width / 2, canvas.height / 2 + values.y * 2)
        context.rotate((values.rotation * Math.PI) / 180)
        context.scale(values.scale, values.scale)
        context.globalAlpha = values.opacity
        const scale = Math.min(780 / image.width, 780 / image.height)
        context.drawImage(image, (-image.width * scale) / 2, (-image.height * scale) / 2, image.width * scale, image.height * scale)
        context.restore()
      }

      drawFrame(0)
      recorder.start()
      const startedAt = performance.now()
      await new Promise<void>((resolve) => {
        const render = (now: number) => {
          const frameProgress = Math.min((now - startedAt) / (duration * 1000), 1)
          drawFrame(frameProgress)
          if (frameProgress >= 1) resolve()
          else requestAnimationFrame(render)
        }
        requestAnimationFrame(render)
      })
      recorder.stop()
      await stopped
      stream.getTracks().forEach((track) => track.stop())

      const video = new Blob(chunks, { type: mimeType })
      const videoUrl = URL.createObjectURL(video)
      const link = document.createElement('a')
      link.href = videoUrl
      link.download = `logo-animation.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`
      link.click()
      URL.revokeObjectURL(videoUrl)
      setNotice('Video exported')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Video export failed.')
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      setIsExporting(false)
    }
  }

  const values = motionTransform(motion, progress)
  const timeLabel = (duration * progress).toFixed(2).padStart(4, '0')

  return (
    <main className="studio-shell" id="studio">
      <header className="topbar">
        <a className="wordmark" href="#studio" aria-label="Forma Motion home">
          <span className="brand-mark"><Sparkles size={17} strokeWidth={2.4} /></span>
          <span>forma<span className="wordmark-light">motion</span></span>
        </a>
        <div className="project-title">
          <span className="project-name">Untitled motion</span>
          <span className="saved-state"><Check size={12} /> Local draft</span>
        </div>
        <button className="export-button" type="button" onClick={exportVideo} disabled={isExporting}>
          <ArrowDownToLine size={16} /><span>{isExporting ? 'Rendering...' : 'Export video'}</span>
        </button>
      </header>

      <div className="workspace">
        <section className="editor-column" aria-label="Animation workspace">
          <div className="canvas-heading">
            <div><span className="eyebrow">CANVAS</span><h1>Make it move.</h1></div>
            <div className="canvas-actions">
              <span className="format-tag">1080 <span>×</span> 1080</span>
              <button className="icon-button help-button" type="button" title="Video is rendered in a square format" aria-label="About the canvas format"><CircleHelp size={16} /></button>
            </div>
          </div>

          <div className="preview-stage">
            <div className="stage-grid" aria-hidden="true" />
            <div
              className="logo-art"
              style={{ transform: `translateY(${values.y}px) rotate(${values.rotation}deg) scale(${values.scale})`, opacity: values.opacity }}
              dangerouslySetInnerHTML={{ __html: logoMarkup }}
            />
            <div className="stage-label"><span className="live-dot" /> LIVE PREVIEW</div>
            <div className="stage-size">1:1</div>
          </div>

          <div className="timeline-panel">
            <div className="timeline-toolbar">
              <div className="transport-controls">
                <button className="icon-button play-button" type="button" onClick={() => {
                  if (progress >= 1) setProgress(0)
                  playbackStart.current = performance.now() - (progress >= 1 ? 0 : progress) * duration * 1000
                  setIsPlaying(!isPlaying)
                }} aria-label={isPlaying ? 'Pause animation' : 'Play animation'}>
                  {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
                <button className="icon-button reset-button" type="button" onClick={() => { setIsPlaying(false); setProgress(0) }} title="Rewind" aria-label="Rewind animation"><RotateCcw size={15} /></button>
                <span className="time-readout"><strong>{timeLabel}</strong><span> / {duration.toFixed(2)}s</span></span>
              </div>
              <div className="timeline-options">
                <label htmlFor="duration">Duration</label>
                <select id="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                  {[2, 2.5, 3, 3.5, 4, 5, 6, 8].map((seconds) => <option key={seconds} value={seconds}>{seconds.toFixed(1)}s</option>)}
                </select>
                <ChevronDown className="select-chevron" size={13} />
              </div>
            </div>
            <div className="scrubber-wrap">
              <div className="ruler"><span>0:00</span><span>{(duration / 2).toFixed(1)}s</span><span>{duration.toFixed(1)}s</span></div>
              <div className="track-row">
                <span className="track-name"><Sparkles size={13} /> Logo</span>
                <input className="scrubber" type="range" min="0" max="1" step="0.001" value={progress} aria-label="Animation timeline" onChange={(event) => { setIsPlaying(false); setProgress(Number(event.target.value)) }} />
                <span className="track-end" />
              </div>
            </div>
          </div>
        </section>

        <aside className="properties-panel" aria-label="Animation properties">
          <div className="panel-heading">
            <div><span className="eyebrow">YOUR PROJECT</span><h2>Logo motion</h2></div>
            <button className="icon-button" type="button" title="Project options" aria-label="Project options"><ChevronDown size={16} /></button>
          </div>

          <div className="property-section asset-section">
            <div className="section-title"><h3>Artwork</h3><span className="file-type">SVG</span></div>
            <div className="asset-row">
              <div className="asset-thumb"><span dangerouslySetInnerHTML={{ __html: logoMarkup }} /></div>
              <div className="asset-meta"><strong title={fileName}>{fileName}</strong><span>Vector artwork</span></div>
              <button className="icon-button small-icon" type="button" onClick={() => fileInput.current?.click()} title="Replace SVG" aria-label="Replace SVG"><Upload size={15} /></button>
              <input ref={fileInput} className="visually-hidden" type="file" accept=".svg,image/svg+xml" onChange={(event) => handleUpload(event.target.files?.[0])} />
            </div>
            <button className="upload-link" type="button" onClick={() => fileInput.current?.click()}><FileImage size={14} /> Replace artwork</button>
          </div>

          <div className="property-section motion-section">
            <div className="section-title"><h3>Motion style</h3><span className="motion-index">01</span></div>
            <div className="motion-options" role="group" aria-label="Motion style">
              {(['Lift', 'Orbit', 'Pop'] as const).map((style, index) => (
                <button className={`motion-option ${motion === style ? 'selected' : ''}`} key={style} type="button" onClick={() => setMotion(style)} aria-pressed={motion === style}>
                  <span className={`motion-glyph glyph-${style.toLowerCase()}`}><span /></span>
                  <span>{style}</span><small>{['Gentle rise', 'Turn in', 'Soft scale'][index]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="property-section duration-section">
            <div className="section-title"><h3>Timing</h3><span className="setting-value">{duration.toFixed(1)} sec</span></div>
            <input className="duration-slider" type="range" min="2" max="8" step="0.5" value={duration} aria-label="Animation duration" onChange={(event) => setDuration(Number(event.target.value))} />
            <div className="range-labels"><span>2 sec</span><span>8 sec</span></div>
          </div>

          <div className="export-note">
            <span className="note-icon"><Clapperboard size={16} /></span>
            <p><strong>Ready for the big screen</strong><span>Square video, 30 fps. Export format is chosen for your browser.</span></p>
          </div>
          <button className="export-wide" type="button" onClick={exportVideo} disabled={isExporting}>
            <ArrowDownToLine size={16} /> {isExporting ? 'Rendering video...' : 'Export animation'}
          </button>
          <p className="notice" role="status">{notice || 'Nothing is uploaded. Draft resets when this tab closes.'}</p>
        </aside>
      </div>
      <footer className="app-footer"><span>FORMA MOTION STUDIO</span><span>Built for the small details.</span></footer>
    </main>
  )
}

export default App
