import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  FileImage,
  KeyRound,
  Layers,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Waves,
  Zap,
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
type Effect = 'None' | 'Neon' | 'Flare' | 'Pulse'
type SvgTarget = { id: string; label: string }
type TransformValues = { x: number; y: number; rotation: number; scale: number; opacity: number }
type Keyframe = TransformValues & { id: string; time: number; easing: 'linear' | 'smooth' }
type KeyframeField = keyof TransformValues

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
  const targetCounts = new Map<string, number>()
  root.querySelectorAll('g, path, rect, circle, ellipse, line, polyline, polygon, text, use').forEach((element, index) => {
    const tag = element.tagName.toLowerCase()
    const count = (targetCounts.get(tag) ?? 0) + 1
    targetCounts.set(tag, count)
    element.setAttribute('data-fm-id', `part-${index + 1}`)
    element.setAttribute('data-fm-name', element.getAttribute('id') || element.getAttribute('aria-label') || `${tag} ${count}`)
  })
  return new XMLSerializer().serializeToString(root)
}

function getSvgTargets(markup: string): SvgTarget[] {
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml')
  return Array.from(document.querySelectorAll('[data-fm-id]')).map((element) => ({
    id: element.getAttribute('data-fm-id') ?? '',
    label: element.getAttribute('data-fm-name') ?? 'SVG element',
  }))
}

function effectFilter(effect: Effect, progress: number) {
  const pulse = Math.sin(progress * Math.PI)
  if (effect === 'Neon') {
    return `drop-shadow(0 0 ${5 + pulse * 7}px #74ffe2) drop-shadow(0 0 ${12 + pulse * 17}px rgba(36, 221, 180, ${0.35 + pulse * 0.45}))`
  }
  if (effect === 'Flare') {
    return `brightness(${1 + pulse * 0.55}) drop-shadow(0 0 ${4 + pulse * 12}px rgba(255, 250, 203, ${0.45 + pulse * 0.5})) drop-shadow(0 0 ${10 + pulse * 22}px rgba(255, 126, 62, ${0.2 + pulse * 0.55}))`
  }
  return 'none'
}

function motionTransform(motion: Motion, progress: number, effect: Effect) {
  const pulseScale = effect === 'Pulse' ? 1 + Math.sin(progress * Math.PI * 2) * 0.085 : 1
  if (motion === 'Lift') {
    return { x: 0, y: (1 - progress) * 34, rotation: 0, scale: (0.94 + progress * 0.06) * pulseScale, opacity: 0.25 + progress * 0.75 }
  }
  if (motion === 'Orbit') {
    return { x: 0, y: 0, rotation: (1 - progress) * -120, scale: (0.88 + progress * 0.12) * pulseScale, opacity: 0.35 + progress * 0.65 }
  }
  const eased = 1 - (1 - progress) ** 3
  return { x: 0, y: 0, rotation: 0, scale: (0.65 + eased * 0.35) * pulseScale, opacity: 0.12 + eased * 0.88 }
}

function interpolateKeyframes(keyframes: Keyframe[], time: number): TransformValues | undefined {
  if (keyframes.length === 0) return undefined
  const sorted = [...keyframes].sort((first, second) => first.time - second.time)
  if (time <= sorted[0].time) return sorted[0]
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1]

  const nextIndex = sorted.findIndex((keyframe) => keyframe.time >= time)
  const start = sorted[nextIndex - 1]
  const end = sorted[nextIndex]
  const rawProgress = (time - start.time) / (end.time - start.time)
  const progress = start.easing === 'smooth' ? rawProgress * rawProgress * (3 - 2 * rawProgress) : rawProgress
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
    rotation: start.rotation + (end.rotation - start.rotation) * progress,
    scale: start.scale + (end.scale - start.scale) * progress,
    opacity: start.opacity + (end.opacity - start.opacity) * progress,
  }
}

function frameSvgForTarget(markup: string, targetId: string, values: TransformValues, effect: Effect, progress: number) {
  if (targetId === 'all') return markup
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const target = document.querySelector(`[data-fm-id="${targetId}"]`)
  if (!target) return markup
  const style = [
    target.getAttribute('style') ?? '',
    `translate: ${values.x}px ${values.y}px !important`,
    `rotate: ${values.rotation}deg !important`,
    `scale: ${values.scale} !important`,
    'transform-box: fill-box !important',
    'transform-origin: center !important',
    `opacity: ${values.opacity} !important`,
    `filter: ${effectFilter(effect, progress)} !important`,
  ].filter(Boolean).join('; ')
  target.setAttribute('style', style)
  return new XMLSerializer().serializeToString(document.documentElement)
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('forma-theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const [logoMarkup, setLogoMarkup] = useState(() => safeSvg(starterLogo))
  const [svgTargets, setSvgTargets] = useState(() => getSvgTargets(safeSvg(starterLogo)))
  const [fileName, setFileName] = useState('northstar-mark.svg')
  const [motion, setMotion] = useState<Motion>('Lift')
  const [effect, setEffect] = useState<Effect>('None')
  const [activeTarget, setActiveTarget] = useState('all')
  const [keyframesByTarget, setKeyframesByTarget] = useState<Record<string, Keyframe[]>>({})
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null)
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

  const activeKeyframes = keyframesByTarget[activeTarget] ?? []
  const valuesAtProgress = (frameProgress: number) => interpolateKeyframes(activeKeyframes, frameProgress * duration)
    ?? motionTransform(motion, frameProgress, effect)
  const selectedKeyframe = activeKeyframes.find((keyframe) => keyframe.id === selectedKeyframeId)

  const addKeyframe = () => {
    const existing = activeKeyframes
    const track = existing.length ? existing : [
      { id: crypto.randomUUID(), time: 0, ...motionTransform(motion, 0, effect), easing: 'smooth' as const },
      { id: crypto.randomUUID(), time: duration, ...motionTransform(motion, 1, effect), easing: 'smooth' as const },
    ]
    const time = duration * progress
    const existingAtTime = track.find((keyframe) => Math.abs(keyframe.time - time) < 0.05)
    const values = interpolateKeyframes(track, time) ?? motionTransform(motion, progress, effect)
    const nextKeyframe: Keyframe = {
      id: existingAtTime?.id ?? crypto.randomUUID(),
      time: existingAtTime?.time ?? time,
      ...values,
      easing: existingAtTime?.easing ?? 'smooth',
    }
    const nextTrack = existingAtTime
      ? track.map((keyframe) => keyframe.id === existingAtTime.id ? nextKeyframe : keyframe)
      : [...track, nextKeyframe].sort((first, second) => first.time - second.time)
    setKeyframesByTarget((current) => ({ ...current, [activeTarget]: nextTrack }))
    setSelectedKeyframeId(nextKeyframe.id)
    setNotice(`Keyframe added at ${(time).toFixed(2)}s`)
  }

  const updateKeyframe = (field: KeyframeField, value: number) => {
    if (!selectedKeyframe) return
    setKeyframesByTarget((current) => ({
      ...current,
      [activeTarget]: (current[activeTarget] ?? []).map((keyframe) => keyframe.id === selectedKeyframe.id
        ? { ...keyframe, [field]: value }
        : keyframe),
    }))
  }

  const updateKeyframeTime = (time: number) => {
    if (!selectedKeyframe) return
    const nextTime = Math.max(0, Math.min(duration, time))
    setKeyframesByTarget((current) => ({
      ...current,
      [activeTarget]: (current[activeTarget] ?? []).map((keyframe) => keyframe.id === selectedKeyframe.id
        ? { ...keyframe, time: nextTime }
        : keyframe),
    }))
    setProgress(nextTime / duration)
  }

  const removeKeyframe = () => {
    if (!selectedKeyframe) return
    setKeyframesByTarget((current) => ({
      ...current,
      [activeTarget]: (current[activeTarget] ?? []).filter((keyframe) => keyframe.id !== selectedKeyframe.id),
    }))
    setSelectedKeyframeId(null)
  }

  const changeDuration = (nextDuration: number) => {
    const ratio = nextDuration / duration
    setKeyframesByTarget((current) => Object.fromEntries(Object.entries(current).map(([target, keyframes]) => [
      target,
      keyframes.map((keyframe) => ({ ...keyframe, time: keyframe.time * ratio })),
    ])))
    setDuration(nextDuration)
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    try {
      localStorage.setItem('forma-theme', nextTheme)
    } catch {
      setNotice('Theme preference could not be saved in this browser.')
    }
  }

  const handleUpload = async (file?: File) => {
    if (!file) return
    try {
      const sanitized = safeSvg(await file.text())
      setLogoMarkup(sanitized)
      setSvgTargets(getSvgTargets(sanitized))
      setActiveTarget('all')
      setKeyframesByTarget({})
      setSelectedKeyframeId(null)
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

    setIsPlaying(false)
    setIsExporting(true)
    setNotice('Preparing your animation...')
    let stream: MediaStream | undefined
    let recorder: MediaRecorder | undefined
    try {
      const image = new Image()
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1080
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas video export is unavailable.')
      const mimeType = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('This browser cannot encode a supported video format.')

      stream = canvas.captureStream(30)
      const recorderInstance = new MediaRecorder(stream, { mimeType })
      recorder = recorderInstance
      const chunks: BlobPart[] = []
      recorderInstance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      const stopped = new Promise<void>((resolve) => {
        recorderInstance.onstop = () => resolve()
      })
      const drawFrame = (frameProgress: number) => new Promise<void>((resolve, reject) => {
        const values = valuesAtProgress(frameProgress)
        const frameMarkup = frameSvgForTarget(logoMarkup, activeTarget, values, effect, frameProgress)
        const frameUrl = URL.createObjectURL(new Blob([frameMarkup], { type: 'image/svg+xml;charset=utf-8' }))
        image.onload = () => {
          try {
            context.fillStyle = '#eff2eb'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.save()
            context.translate(canvas.width / 2 + (activeTarget === 'all' ? values.x * 2 : 0), canvas.height / 2 + (activeTarget === 'all' ? values.y * 2 : 0))
            if (activeTarget === 'all') {
              context.rotate((values.rotation * Math.PI) / 180)
              context.scale(values.scale, values.scale)
              context.globalAlpha = values.opacity
              context.filter = effectFilter(effect, frameProgress)
            }
            const scale = Math.min(780 / image.width, 780 / image.height)
            context.drawImage(image, (-image.width * scale) / 2, (-image.height * scale) / 2, image.width * scale, image.height * scale)
            context.restore()
            resolve()
          } catch (error) {
            reject(error)
          } finally {
            URL.revokeObjectURL(frameUrl)
          }
        }
        image.onerror = () => {
          URL.revokeObjectURL(frameUrl)
          reject(new Error('This SVG frame could not be rendered for export.'))
        }
        image.src = frameUrl
      })

      recorderInstance.start()
      const startedAt = performance.now()
      await new Promise<void>((resolve, reject) => {
        const render = (now: number) => {
          const frameProgress = Math.min((now - startedAt) / (duration * 1000), 1)
          void drawFrame(frameProgress).then(() => {
            if (frameProgress >= 1) resolve()
            else requestAnimationFrame(render)
          }).catch(reject)
        }
        requestAnimationFrame(render)
      })
      recorderInstance.stop()
      await stopped
      stream.getTracks().forEach((track) => track.stop())
      stream = undefined

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
      if (recorder?.state === 'recording') recorder.stop()
      stream?.getTracks().forEach((track) => track.stop())
      setIsExporting(false)
    }
  }

  const values = valuesAtProgress(progress)
  const timeLabel = (duration * progress).toFixed(2).padStart(4, '0')
  const targetStyle = activeTarget === 'all' ? '' : `.logo-art [data-fm-id="${activeTarget}"] { translate: ${values.x}px ${values.y}px !important; rotate: ${values.rotation}deg !important; scale: ${values.scale} !important; transform-box: fill-box !important; transform-origin: center !important; opacity: ${values.opacity} !important; filter: ${effectFilter(effect, progress)} !important; }`

  return (
    <main className="studio-shell" id="studio" data-theme={theme}>
      <header className="topbar">
        <a className="wordmark" href="#studio" aria-label="Forma Motion home">
          <span className="brand-mark"><Sparkles size={17} strokeWidth={2.4} /></span>
          <span>forma<span className="wordmark-light">motion</span></span>
        </a>
        <div className="project-title">
          <span className="project-name">Untitled motion</span>
          <span className="saved-state"><Check size={12} /> Local draft</span>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" type="button" onClick={toggleTheme} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="export-button" type="button" onClick={exportVideo} disabled={isExporting}>
            <ArrowDownToLine size={16} /><span>{isExporting ? 'Rendering...' : 'Export video'}</span>
          </button>
        </div>
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
            {targetStyle && <style>{targetStyle}</style>}
            <div
              className="logo-art"
              style={{
                transform: activeTarget === 'all' ? `translate(${values.x}px, ${values.y}px) rotate(${values.rotation}deg) scale(${values.scale})` : 'none',
                opacity: activeTarget === 'all' ? values.opacity : 1,
                filter: activeTarget === 'all' ? effectFilter(effect, progress) : 'none',
              }}
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
                <select id="duration" value={duration} onChange={(event) => changeDuration(Number(event.target.value))}>
                  {[2, 2.5, 3, 3.5, 4, 5, 6, 8].map((seconds) => <option key={seconds} value={seconds}>{seconds.toFixed(1)}s</option>)}
                </select>
                <ChevronDown className="select-chevron" size={13} />
              </div>
            </div>
            <div className="scrubber-wrap">
              <div className="ruler"><span>0:00</span><span>{(duration / 2).toFixed(1)}s</span><span>{duration.toFixed(1)}s</span></div>
              <div className="track-row">
                <span className="track-name"><Sparkles size={13} /> {activeTarget === 'all' ? 'Whole logo' : svgTargets.find((target) => target.id === activeTarget)?.label}</span>
                <div className="timeline-track">
                  <input className="scrubber" type="range" min="0" max="1" step="0.001" value={progress} aria-label="Animation timeline" onChange={(event) => { setIsPlaying(false); setProgress(Number(event.target.value)) }} />
                  <span className="track-end" />
                  <div className="keyframe-markers" aria-label="Keyframes">
                    {activeKeyframes.map((keyframe) => (
                      <button
                        className={`keyframe-marker ${selectedKeyframeId === keyframe.id ? 'selected' : ''}`}
                        key={keyframe.id}
                        type="button"
                        style={{ left: `${Math.max(0, Math.min(100, (keyframe.time / duration) * 100))}%` }}
                        title={`Keyframe at ${keyframe.time.toFixed(2)} seconds`}
                        aria-label={`Select keyframe at ${keyframe.time.toFixed(2)} seconds`}
                        onClick={() => { setProgress(Math.max(0, Math.min(1, keyframe.time / duration))); setSelectedKeyframeId(keyframe.id); setIsPlaying(false) }}
                      />
                    ))}
                  </div>
                </div>
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

          <div className="property-section layers-section">
            <div className="section-title"><h3>Animate element</h3><span className="motion-index">{svgTargets.length} LAYERS</span></div>
            <div className="layer-list" role="group" aria-label="Animation target">
              <button className={`layer-option ${activeTarget === 'all' ? 'selected' : ''}`} type="button" onClick={() => { setActiveTarget('all'); setSelectedKeyframeId(null) }} aria-pressed={activeTarget === 'all'}>
                <span className="layer-icon"><Layers size={14} /></span><span className="layer-label">Whole logo</span>
              </button>
              {svgTargets.map((target, index) => (
                <button className={`layer-option ${activeTarget === target.id ? 'selected' : ''}`} key={target.id} type="button" onClick={() => { setActiveTarget(target.id); setSelectedKeyframeId(null) }} aria-pressed={activeTarget === target.id}>
                  <span className="layer-index">{String(index + 1).padStart(2, '0')}</span><span className="layer-label" title={target.label}>{target.label}</span>
                </button>
              ))}
            </div>
            <p className="layer-hint">Pick a layer, then choose its entrance and effect.</p>
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

          <div className="property-section keyframe-section">
            <div className="section-title"><h3>Keyframe studio</h3><span className="motion-index">{activeKeyframes.length} KEYS</span></div>
            <button className="add-keyframe-button" type="button" onClick={addKeyframe}>
              <KeyRound size={14} /> Add keyframe <span>{(duration * progress).toFixed(2)}s</span>
            </button>
            {selectedKeyframe ? (
              <div className="keyframe-editor">
                <div className="keyframe-editor-heading">
                  <label className="keyframe-time-field">Time
                    <input type="number" min="0" max={duration} step="0.01" value={selectedKeyframe.time.toFixed(2)} onChange={(event) => updateKeyframeTime(Number(event.target.value))} />
                    <span>sec</span>
                  </label>
                  <button className="icon-button delete-keyframe" type="button" onClick={removeKeyframe} title="Delete keyframe" aria-label="Delete selected keyframe"><Trash2 size={14} /></button>
                </div>
                <div className="keyframe-values">
                  {([
                    ['x', 'X', -300, 300, 1],
                    ['y', 'Y', -300, 300, 1],
                    ['rotation', 'Rotate', -360, 360, 1],
                    ['scale', 'Scale', 0.1, 3, 0.01],
                    ['opacity', 'Opacity', 0, 1, 0.01],
                  ] as const).map(([field, label, min, max, step]) => (
                    <label className="keyframe-field" key={field}>
                      <span>{label}</span>
                      <input type="number" min={min} max={max} step={step} value={selectedKeyframe[field]} onChange={(event) => updateKeyframe(field, Number(event.target.value))} />
                    </label>
                  ))}
                </div>
                <label className="easing-control">Interpolation
                  <select value={selectedKeyframe.easing} onChange={(event) => setKeyframesByTarget((current) => ({
                    ...current,
                    [activeTarget]: (current[activeTarget] ?? []).map((keyframe) => keyframe.id === selectedKeyframe.id
                      ? { ...keyframe, easing: event.target.value as Keyframe['easing'] }
                      : keyframe),
                  }))}>
                    <option value="smooth">Smooth</option>
                    <option value="linear">Linear</option>
                  </select>
                </label>
              </div>
            ) : (
              <p className="keyframe-empty">Move the playhead, then add a key to set this element&apos;s pose.</p>
            )}
          </div>

          <div className="property-section effects-section">
            <div className="section-title"><h3>Visual effect</h3><span className="effect-badge">CAN COMBINE</span></div>
            <div className="effect-options" role="group" aria-label="Visual effect">
              {(['None', 'Neon', 'Flare', 'Pulse'] as const).map((style) => (
                <button className={`effect-option ${effect === style ? 'selected' : ''} effect-${style.toLowerCase()}`} key={style} type="button" onClick={() => setEffect(style)} aria-pressed={effect === style}>
                  <span className="effect-icon">
                    {style === 'Neon' ? <Zap size={15} /> : style === 'Flare' ? <Sun size={15} /> : style === 'Pulse' ? <Waves size={15} /> : <Sparkles size={15} />}
                  </span>
                  <span>{style}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="property-section duration-section">
            <div className="section-title"><h3>Timing</h3><span className="setting-value">{duration.toFixed(1)} sec</span></div>
            <input className="duration-slider" type="range" min="2" max="8" step="0.5" value={duration} aria-label="Animation duration" onChange={(event) => changeDuration(Number(event.target.value))} />
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
