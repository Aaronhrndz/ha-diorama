import { useSyncExternalStore } from 'react'

// Settings for whoever works on the card, found by tapping the version at
// the foot of the card's settings six times. They belong to this browser,
// not to the card, so they are kept here rather than in its config, and
// every card on the page sees them at once.
export type DevSettings = {
  // The developer settings are showing under the version.
  open: boolean
  // The frames drawn each second, in the card's top right corner.
  fps: boolean
  // Fewer frames and no shadows, for a phone or tablet that struggles.
  performance: boolean
}

const KEY = 'diorama-dev'
const NONE: DevSettings = { open: false, fps: false, performance: false }

function load(): DevSettings {
  try {
    const stored = localStorage.getItem(KEY)
    return stored ? { ...NONE, ...(JSON.parse(stored) as Partial<DevSettings>) } : NONE
  } catch {
    return NONE
  }
}

let settings = load()
const listeners = new Set<() => void>()

export function setDevSettings(change: Partial<DevSettings>) {
  settings = { ...settings, ...change }
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Kept for this page only, when the browser keeps nothing.
  }
  listeners.forEach(listener => listener())
}

// Changed in another tab, the settings follow here too.
const onStorage = (e: StorageEvent) => {
  if (e.key !== KEY) return
  settings = load()
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) removeEventListener('storage', onStorage)
  }
}

// For code that runs every frame, outside React.
export const devSettings = () => settings

export const useDevSettings = () => useSyncExternalStore(subscribe, () => settings)
