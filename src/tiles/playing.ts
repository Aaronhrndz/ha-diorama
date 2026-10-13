import type { EntityState, HomeAssistant } from '#/types.ts'

// What a player puts in the title when it has none.
export const PLACEHOLDER = /^not provided$/i

// What a player does while something is open in it.
const SESSION = ['playing', 'paused', 'buffering']

// A player that only assumes what it does, like a TV box driven as its
// remote, cannot tell what plays in it. Another player of a device with the
// same name, like the one the box casts from, may tell it while something
// is open in it: whether it plays or is paused, and which buttons the app
// takes, as some apps never skip to the next or the previous.
export function twinOf(hass: HomeAssistant, entityId: string, entity: EntityState): EntityState | undefined {
  if (entity.attributes.assumed_state !== true) return undefined
  const registry = hass.entities ?? {}
  const deviceName = (id: string) => {
    const device = hass.devices?.[registry[id]?.device_id ?? '']
    return device?.name_by_user ?? device?.name ?? undefined
  }
  const own = registry[entityId]?.device_id
  const name = deviceName(entityId)
  if (!own || !name) return undefined
  const id = Object.keys(registry).find(
    id =>
      id !== entityId &&
      id.startsWith('media_player.') &&
      registry[id].device_id !== own &&
      deviceName(id) === name &&
      SESSION.includes(hass.states[id]?.state ?? ''),
  )
  return id ? hass.states[id] : undefined
}
