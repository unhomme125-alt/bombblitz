// worldmap.js — mini-carte du monde pour le mode Pays. Charge worldmap.json
// (chemins SVG indexés par code ISO2) et allume en vert chaque pays trouvé.

let mapData = null
let rootSvg = null
const lit = new Set()

// Construit la carte SVG dans le conteneur fourni (asynchrone : charge le JSON
// une seule fois).
export async function renderMap(container) {
  if (!mapData) {
    try {
      const res = await fetch('/assets/worldmap.json')
      mapData = await res.json()
    } catch {
      return // pas de carte disponible
    }
  }
  lit.clear()
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', mapData.viewBox)
  svg.setAttribute('class', 'world-map-svg')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  // Un seul gros fragment pour limiter les reflows.
  const frag = document.createDocumentFragment()
  for (const loc of mapData.locations) {
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', loc.d)
    p.setAttribute('data-iso', loc.id)
    p.setAttribute('class', 'wm-country')
    frag.appendChild(p)
  }
  svg.appendChild(frag)
  container.innerHTML = ''
  container.appendChild(svg)
  rootSvg = svg
}

// Allume un pays (vert) à partir de son code ISO2.
export function lightUp(iso2) {
  if (!rootSvg || !iso2) return
  const el = rootSvg.querySelector(`[data-iso="${iso2}"]`)
  if (el) {
    el.classList.add('found')
    lit.add(iso2)
  }
}

// Réinitialise la carte (nouvelle manche).
export function resetMap() {
  if (!rootSvg) return
  rootSvg.querySelectorAll('.wm-country.found').forEach((e) => e.classList.remove('found'))
  lit.clear()
}
