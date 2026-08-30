// tourEngine — recorridos guiados interactivos (spotlight sobre elementos
// reales + popover con contador/Siguiente/Anterior/Saltar), usando driver.js.
// Persiste el paso actual en localStorage para que el usuario pueda pausar
// un recorrido y continuarlo después sin perder el progreso.
import { driver, type Config, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

const PROGRESS_KEY = 'credytek_tour_progress' // { [tourId]: stepIndex }
const DONE_KEY = 'credytek_tours_done'         // string[] de tourIds completados

function readJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback } catch { return fallback }
}
function getProgressMap(): Record<string, number> { return readJSON(PROGRESS_KEY, {}) }
function setProgress(tourId: string, index: number) {
  const p = getProgressMap(); p[tourId] = index
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)) } catch {}
}
function clearProgress(tourId: string) {
  const p = getProgressMap(); delete p[tourId]
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)) } catch {}
}
export function getSavedStep(tourId: string): number { return getProgressMap()[tourId] || 0 }
export function isTourDone(tourId: string): boolean { return readJSON<string[]>(DONE_KEY, []).includes(tourId) }
function markDone(tourId: string) {
  const d = readJSON<string[]>(DONE_KEY, [])
  if (!d.includes(tourId)) { d.push(tourId); try { localStorage.setItem(DONE_KEY, JSON.stringify(d)) } catch {} }
}

// Espera (con timeout) a que un selector exista en el DOM — usado tras
// navegar a otra ruta, para que el spotlight no intente apuntar a un
// elemento que React todavía no terminó de montar.
function waitForSelector(selector: string, timeout = 3000): Promise<Element | null> {
  const found = document.querySelector(selector)
  if (found) return Promise.resolve(found)
  return new Promise(resolve => {
    const start = Date.now()
    const iv = setInterval(() => {
      const el = document.querySelector(selector)
      if (el || Date.now() - start > timeout) { clearInterval(iv); resolve(el) }
    }, 80)
  })
}

// Alias de DriveStep: usa el campo `data` (ya tipado como Record<string, any>
// en driver.js) para guardar la ruta a la que navegar antes de este paso.
export type TourStep = DriveStep
function stepRoute(step: DriveStep): string | undefined {
  return (step.data as { route?: string } | undefined)?.route
}

export interface TourLabels {
  next: string
  prev: string
  done: string
  skip: string
  progress: string // debe incluir {{current}} y {{total}}, formato de driver.js
}

export function runTour(tourId: string, steps: TourStep[], navigate: (path: string) => void, labels: TourLabels) {
  const goToStep = async (idx: number) => {
    const step = steps[idx]
    if (!step) return
    const route = stepRoute(step)
    if (route && route !== window.location.pathname) {
      navigate(route)
      if (typeof step.element === 'string') await waitForSelector(step.element)
      else await new Promise(r => setTimeout(r, 250))
    }
  }

  const config: Config = {
    steps: steps as DriveStep[],
    showProgress: true,
    progressText: labels.progress,
    nextBtnText: labels.next,
    prevBtnText: labels.prev,
    doneBtnText: labels.done,
    allowClose: true,
    allowKeyboardControl: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: 'credytek-tour-popover',
    onHighlighted: (_el, _step, opts) => {
      const i = opts.driver.getActiveIndex()
      if (typeof i === 'number') setProgress(tourId, i)
    },
    onNextClick: async (_el, _step, opts) => {
      const nextIdx = (opts.driver.getActiveIndex() ?? 0) + 1
      await goToStep(nextIdx)
      opts.driver.moveNext()
    },
    onPrevClick: async (_el, _step, opts) => {
      const prevIdx = (opts.driver.getActiveIndex() ?? 0) - 1
      await goToStep(prevIdx)
      opts.driver.movePrevious()
    },
    onCloseClick: (_el, _step, opts) => { opts.driver.destroy() }, // pausa: el progreso queda guardado
    onDoneClick: (_el, _step, opts) => { markDone(tourId); clearProgress(tourId); opts.driver.destroy() },
    onPopoverRender: (popover, opts) => {
      const skipBtn = document.createElement('button')
      skipBtn.type = 'button'
      skipBtn.innerText = labels.skip
      skipBtn.className = 'credytek-tour-skip-btn'
      skipBtn.onclick = () => opts.driver.destroy() // pausa, resumible más tarde
      popover.footerButtons.prepend(skipBtn)
    },
  }

  const dr = driver(config)

  ;(async () => {
    const startIdx = Math.min(getSavedStep(tourId), steps.length - 1)
    await goToStep(startIdx)
    dr.drive(startIdx)
  })()

  return dr
}
