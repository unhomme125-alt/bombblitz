// bomb.js — bombe SVG animée au centre de l'écran : corps, mèche enflammée,
// et arc de timer qui se vide (stroke-dashoffset). Couleur interpolée
// vert → orange → rouge selon le temps restant.

import { playExplosion } from './sounds.js'

const R = 80
const STROKE = 8
const CIRC = 2 * Math.PI * R

let arcEl = null
let bombGroup = null
let rootEl = null

// Interpole entre deux couleurs hex (0 <= t <= 1).
function lerpColor(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)]
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)]
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

// fraction 1 = plein (vert), 0 = explosion (rouge).
function colorFor(fraction) {
  if (fraction > 0.5) return lerpColor('#ffaa00', '#44ff88', (fraction - 0.5) * 2)
  return lerpColor('#ff4444', '#ffaa00', fraction * 2)
}

// Construit la bombe dans le conteneur fourni.
export function renderBomb(container) {
  container.innerHTML = `
    <div class="bomb-wrap" id="bombWrap">
      <svg viewBox="0 0 220 220" class="bomb-svg" id="bombSvg">
        <!-- Arc de timer (piste + progression) -->
        <circle cx="110" cy="110" r="${R}" fill="none" stroke="#22223a" stroke-width="${STROKE}" />
        <circle cx="110" cy="110" r="${R}" fill="none" stroke="#44ff88"
                stroke-width="${STROKE}" stroke-linecap="round"
                transform="rotate(-90 110 110)"
                stroke-dasharray="${CIRC}" stroke-dashoffset="0" id="timerArc" />

        <!-- Corps de la bombe -->
        <g id="bombBody">
          <circle cx="110" cy="120" r="46" fill="#1a1a22" stroke="#000" stroke-width="2" />
          <circle cx="94" cy="104" r="14" fill="#33333f" opacity="0.7" />
          <!-- Embout / mèche -->
          <rect x="102" y="64" width="16" height="16" rx="3" fill="#2a2a35" />
          <path d="M110 64 Q126 46 118 30" fill="none" stroke="#8a6b3a" stroke-width="4" stroke-linecap="round" />
          <!-- Flamme animée -->
          <g id="flame" transform="translate(118 28)">
            <path class="flame-outer" d="M0 0 C-8 -10 -6 -22 0 -30 C6 -22 8 -10 0 0 Z" fill="#ffaa00" />
            <path class="flame-inner" d="M0 -4 C-4 -10 -3 -18 0 -24 C3 -18 4 -10 0 -4 Z" fill="#ffe066" />
          </g>
        </g>
      </svg>
      <div class="bomb-time" id="bombTime">—</div>
    </div>
  `
  rootEl = container.querySelector('#bombWrap')
  arcEl = container.querySelector('#timerArc')
  bombGroup = container.querySelector('#bombSvg')
}

// Met à jour l'arc et la couleur. fraction 0-1.
export function updateTimer(fraction, timeLeft) {
  if (!arcEl) return
  const f = Math.min(1, Math.max(0, fraction))
  arcEl.style.strokeDashoffset = String(CIRC * (1 - f))
  arcEl.style.stroke = colorFor(f)

  const timeEl = document.getElementById('bombTime')
  if (timeEl && typeof timeLeft === 'number') {
    timeEl.textContent = timeLeft.toFixed(1)
    timeEl.style.color = colorFor(f)
  }

  // Tremblement quand c'est critique (< 20%).
  if (rootEl) rootEl.classList.toggle('shake', f < 0.2)
}

// Animation d'explosion + son.
export function explode() {
  if (!rootEl) return
  playExplosion()
  rootEl.classList.remove('shake')
  rootEl.classList.add('exploding')

  // Particules d'explosion.
  const burst = document.createElement('div')
  burst.className = 'explosion-burst'
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span')
    const angle = (i / 14) * Math.PI * 2
    const dist = 60 + Math.random() * 50
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    p.style.background = i % 2 ? '#ffaa00' : '#ff4444'
    burst.appendChild(p)
  }
  rootEl.appendChild(burst)
  setTimeout(() => {
    rootEl.classList.remove('exploding')
    burst.remove()
  }, 700)
}

// Réinitialise visuellement la bombe pour un nouveau tour.
export function resetBomb() {
  if (!rootEl) return
  rootEl.classList.remove('shake', 'exploding', 'penalty')
  updateTimer(1)
}

// Effet de pénalité coopérative : tremblement + flash rouge (500 ms). L'arc lui
// saute vers sa nouvelle valeur via l'appel updateTimer côté game.js.
export function penaltyEffect() {
  if (!rootEl) return
  rootEl.classList.remove('penalty')
  void rootEl.offsetWidth // relance l'animation
  rootEl.classList.add('penalty')
  setTimeout(() => rootEl && rootEl.classList.remove('penalty'), 500)
}

// En coopératif, l'arc doit « sauter » plus vite lors d'une pénalité : on
// bascule temporairement la transition sur 200 ms.
export function setArcFastTransition(on) {
  const arc = document.getElementById('timerArc')
  if (arc) arc.style.transition = on
    ? 'stroke-dashoffset 0.2s ease, stroke 0.2s linear'
    : 'stroke-dashoffset 0.1s linear, stroke 0.2s linear'
}
