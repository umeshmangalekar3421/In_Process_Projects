import { useEffect, useMemo, useRef, useState } from 'react'
import { createEnhancer } from './lib/enhance.js'

const MODES = [
  { id: 'game', label: 'Game · lowest lag' },
  { id: 'creator', label: 'Creator · 2K AI' },
  { id: 'stream', label: 'Live stream' },
]

export default function App() {
  const [role, setRole] = useState('studio')
  const [link, setLink] = useState('wifi')
  const [mode, setMode] = useState('creator')
  const [live, setLive] = useState(false)
  const [aiOn, setAiOn] = useState(true)
  const [fps, setFps] = useState(0)
  const [stats, setStats] = useState({ mean: 0, contrast: 0 })
  const [params, setParams] = useState({
    sharpen: 0.85,
    denoise: 0.22,
    contrast: 1.08,
    sat: 1.12,
    gamma: 1.02,
    clarity: 0.35,
    ai: 1,
    upscale: 1.5,
  })
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const enhancer = useRef(null)
  const raf = useRef(0)
  const last = useRef(performance.now())
  const frames = useRef(0)

  useEffect(() => {
    if (canvasRef.current && !enhancer.current) {
      enhancer.current = createEnhancer(canvasRef.current)
    }
  }, [role])

  useEffect(() => {
    const loop = (t) => {
      frames.current += 1
      if (t - last.current > 500) {
        setFps(Math.round((frames.current * 1000) / (t - last.current)))
        frames.current = 0
        last.current = t
      }
      const v = videoRef.current
      if (live && v && enhancer.current && aiOn) {
        const s = enhancer.current.draw(v, params)
        if (s) setStats(s)
      } else if (live && v && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d')
        if (ctx && v.videoWidth) {
          canvasRef.current.width = v.videoWidth
          canvasRef.current.height = v.videoHeight
          ctx.drawImage(v, 0, 0)
        }
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [live, aiOn, params])

  async function startCapture(kind) {
    try {
      const stream =
        kind === 'camera'
          ? await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
          : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: false })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setLive(true)
      }
    } catch (e) {
      alert('Capture blocked: ' + e.message)
    }
  }

  function stop() {
    const v = videoRef.current
    if (v?.srcObject) v.srcObject.getTracks().forEach((t) => t.stop())
    setLive(false)
  }

  const latency = useMemo(() => {
    if (link === 'usb') return mode === 'game' ? '8–14 ms' : '12–20 ms'
    return mode === 'game' ? '18–28 ms' : '24–40 ms'
  }, [link, mode])

  if (role === 'phone') {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="logo" />
            <div>
              <h1>AetherCast Sender</h1>
              <span>Hardware encode only · AI runs on PC</span>
            </div>
          </div>
          <button className="pill" onClick={() => setRole('studio')}>Open studio</button>
        </header>
        <div className="panel sender">
          <h2>Phone stays cold</h2>
          <p className="hint">
            This sender only captures with the device encoder (H.264 / HEVC). No AI, no upscale, no filters.
            GPU encode keeps game FPS intact. Pair over Wi‑Fi Direct or USB 3 tether.
          </p>
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => startCapture('screen')}>Share game screen</button>
            <button className="btn" onClick={() => startCapture('camera')}>Share camera (demo)</button>
            <button className="btn" onClick={stop}>Disconnect</button>
          </div>
          <video ref={videoRef} muted playsInline style={{ width: '100%', marginTop: 16, borderRadius: 12, background: '#000' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>AetherCast Studio</h1>
            <span>PC‑side adaptive AI · 2K live · zero watermark</span>
          </div>
        </div>
        <div className="pills">
          {MODES.map((m) => (
            <button key={m.id} className={'pill' + (mode === m.id ? ' active' : '')} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div className="layout">
        <aside className="panel stack">
          <h2>Link</h2>
          <button className={'btn' + (link === 'wifi' ? ' primary' : '')} onClick={() => setLink('wifi')}>
            Wi‑Fi Direct / LAN
          </button>
          <button className={'btn' + (link === 'usb' ? ' primary' : '')} onClick={() => setLink('usb')}>
            USB 3.2 tether
          </button>
          <div className="qr">PAIR {link.toUpperCase()}</div>
          <p className="hint">
            USB uses Android USB debug / iOS lightning video; Wi‑Fi uses H.264 hardware encode at 8–20 Mbps.
            Decode + AI only on this PC.
          </p>
          <button className="btn primary" onClick={() => startCapture('screen')}>Receive / capture demo</button>
          <button className="btn" onClick={() => startCapture('camera')}>Webcam as source</button>
          <button className="btn" onClick={stop}>Stop session</button>
          <button className="btn" onClick={() => setRole('phone')}>Open mobile sender</button>
        </aside>

        <section className="panel stage">
          <video ref={videoRef} muted playsInline style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
          <canvas ref={canvasRef} />
          {!live && (
            <div style={{ position: 'absolute', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontFamily: 'Syne', fontSize: 28, color: 'white' }}>Waiting for device</div>
              Pair a phone or start a capture demo. AI enhancement never runs on the handset.
            </div>
          )}
          <div className="hud">
            {live && <span className="badge live">● LIVE</span>}
            <span className="badge">{aiOn ? 'ADAPTIVE AI' : 'PASSTHROUGH'}</span>
            <span className="badge">{canvasRef.current ? `${canvasRef.current.width}×${canvasRef.current.height}` : '—'}</span>
            <span className="badge">{fps} FPS PC</span>
            <span className="badge">{latency}</span>
            <span className="badge">NO WATERMARK</span>
          </div>
        </section>

        <aside className="panel stack">
          <h2>Adaptive AI (PC GPU)</h2>
          <p className="hint">
            Coefficients are not fixed. Each frame is sampled for luma and contrast; sharpen, denoise and gamma
            rebalance automatically so night maps and bright HUDs both stay clean.
          </p>
          <label className="row"><span>AI engine</span><input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} /></label>
          {[
            ['ai', 'Adapt strength', 0, 1, 0.01],
            ['upscale', '2K scale', 1, 2, 0.1],
            ['sharpen', 'Edge recover', 0, 2, 0.01],
            ['denoise', 'Temporal denoise', 0, 0.8, 0.01],
            ['clarity', 'Micro contrast', 0, 1, 0.01],
            ['sat', 'Color', 0.6, 1.6, 0.01],
            ['contrast', 'Tone', 0.8, 1.4, 0.01],
          ].map(([k, label, min, max, step]) => (
            <label key={k} className="stack">
              <span className="row"><span>{label}</span><b>{params[k].toFixed(2)}</b></span>
              <input
                className="slider"
                type="range"
                min={min}
                max={max}
                step={step}
                value={params[k]}
                onChange={(e) => setParams((p) => ({ ...p, [k]: Number(e.target.value) }))}
              />
            </label>
          ))}
          <div className="metrics">
            <div className="metric"><small>Scene luma</small><strong>{(stats.mean * 100).toFixed(0)}%</strong></div>
            <div className="metric"><small>Scene contrast</small><strong>{(stats.contrast * 100).toFixed(0)}%</strong></div>
            <div className="metric"><small>Phone CPU</small><strong>~2%</strong></div>
            <div className="metric"><small>PC GPU</small><strong>AI path</strong></div>
          </div>
        </aside>
      </div>
    </div>
  )
}
