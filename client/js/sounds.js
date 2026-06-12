// sounds.js — sons générés programmatiquement via la Web Audio API.
// Aucun fichier MP3 requis (fallback silencieux si l'audio est indisponible).

let ctx = null
let volume = parseFloat(localStorage.getItem('bb:volume') ?? '0.6')

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
    } catch {
      ctx = null
    }
  }
  // Les navigateurs suspendent le contexte tant qu'il n'y a pas d'interaction.
  if (ctx && ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v))
  localStorage.setItem('bb:volume', String(volume))
}

export function getVolume() {
  return volume
}

// Débloque l'audio au premier clic/touche (politique d'autoplay).
export function unlockAudio() {
  ac()
}

function tone({ freq, type = 'sine', dur = 0.1, gain = 0.2, slideTo = null, delay = 0 }) {
  const a = ac()
  if (!a || volume <= 0) return
  const t0 = a.currentTime + delay
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(gain * volume, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// Tic de la bombe — court bip aigu. urgency (0-1) monte la fréquence.
export function playTick(urgency = 0) {
  tone({ freq: 660 + urgency * 500, type: 'square', dur: 0.05, gain: 0.12 })
}

// Bonne réponse — deux bips ascendants.
export function playCorrect() {
  tone({ freq: 660, type: 'sine', dur: 0.1, gain: 0.18 })
  tone({ freq: 990, type: 'sine', dur: 0.14, gain: 0.18, delay: 0.1 })
}

// Mauvaise réponse / timeout — bip descendant grave.
export function playFail() {
  tone({ freq: 300, type: 'sawtooth', dur: 0.3, gain: 0.18, slideTo: 90 })
}

// Explosion — bruit blanc avec décroissance.
export function playExplosion() {
  const a = ac()
  if (!a || volume <= 0) return
  const dur = 0.35
  const buffer = a.createBuffer(1, a.sampleRate * dur, a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    // Décroissance exponentielle du bruit.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2)
  }
  const src = a.createBufferSource()
  const g = a.createGain()
  const filter = a.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1200
  g.gain.value = 0.5 * volume
  src.buffer = buffer
  src.connect(filter).connect(g).connect(a.destination)
  src.start()
}
