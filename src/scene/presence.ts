import type { HomeAssistant, RoomConfig } from '#/types.ts'
import { Color } from 'three'

// What the filter over an occupied room's floor is when the room does not
// say: black, a quarter of the way over, so the floor reads a little darker.
export const PRESENCE_COLOR = '#000000'
export const PRESENCE_STRENGTH = 0.3

// The states that say someone is there: an occupancy or motion sensor that
// is on, a person or tracker at home, or a count of people above nothing.
const PRESENT = new Set(['on', 'home', 'detected', 'occupied', 'present'])

export function occupied(hass: HomeAssistant | null, room: RoomConfig) {
  const id = room.presence?.entity
  if (!id || !hass) return false
  const state = hass.states[id]?.state
  if (state === undefined) return false
  if (PRESENT.has(state)) return true
  const count = Number(state)
  return Number.isFinite(count) && count > 0
}

// The floor's color with the room's presence filter laid over it, `shown`
// of the way: 0 is the floor as it is, 1 the filter at its full strength.
export function presenceTint(color: string, room: RoomConfig, shown: number) {
  if (shown <= 0) return color
  const filter = room.presence?.color ?? PRESENCE_COLOR
  const strength = room.presence?.strength ?? PRESENCE_STRENGTH
  return `#${new Color(color).lerp(new Color(filter), strength * shown).getHexString()}`
}
