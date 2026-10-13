import { cn } from '#/lib/utils.ts'
import { callService, formatState, haptic, type TileEnv } from '#/tiles/actions.ts'
import { Control } from '#/tiles/Control.tsx'
import { MEDIA } from '#/tiles/features/media.tsx'
import { supports } from '#/tiles/features/parts.tsx'
import { insideTile } from '#/tiles/gestures.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { Icon } from '#/tiles/Icon.tsx'
import { Panel } from '#/tiles/Panel.tsx'
import type { HomeAssistant } from '#/types.ts'
import { useEffect, useRef } from 'react'

export type Key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'home' | 'mute' | 'volume_up' | 'volume_down'

// A command of its own for a key: the name of one the remote sends, or any
// action, like a script.
type Command = string | { action: string; data?: Record<string, unknown> }

export type RemoteConfig = TileConfig & {
  // The player whose volume the volume keys and mute change, like the TV
  // when the remote is a box plugged into it.
  volume_entity?: string
  commands?: Partial<Record<Key, Command>>
}

// The names each integration gives the keys, as its remote sends them. A
// webOS TV has no remote, so its keys go to its player as buttons.
const PLATFORMS: Record<string, Record<Key, string>> = {
  androidtv_remote: {
    up: 'DPAD_UP',
    down: 'DPAD_DOWN',
    left: 'DPAD_LEFT',
    right: 'DPAD_RIGHT',
    ok: 'DPAD_CENTER',
    back: 'BACK',
    home: 'HOME',
    mute: 'MUTE',
    volume_up: 'VOLUME_UP',
    volume_down: 'VOLUME_DOWN',
  },
  androidtv: {
    up: 'UP',
    down: 'DOWN',
    left: 'LEFT',
    right: 'RIGHT',
    ok: 'CENTER',
    back: 'BACK',
    home: 'HOME',
    mute: 'MUTE',
    volume_up: 'VOLUME_UP',
    volume_down: 'VOLUME_DOWN',
  },
  roku: {
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    ok: 'select',
    back: 'back',
    home: 'home',
    mute: 'volume_mute',
    volume_up: 'volume_up',
    volume_down: 'volume_down',
  },
  samsungtv: {
    up: 'KEY_UP',
    down: 'KEY_DOWN',
    left: 'KEY_LEFT',
    right: 'KEY_RIGHT',
    ok: 'KEY_ENTER',
    back: 'KEY_RETURN',
    home: 'KEY_HOME',
    mute: 'KEY_MUTE',
    volume_up: 'KEY_VOLUP',
    volume_down: 'KEY_VOLDOWN',
  },
  philips_js: {
    up: 'CursorUp',
    down: 'CursorDown',
    left: 'CursorLeft',
    right: 'CursorRight',
    ok: 'Confirm',
    back: 'Back',
    home: 'Home',
    mute: 'Mute',
    volume_up: 'VolumeUp',
    volume_down: 'VolumeDown',
  },
  braviatv: {
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    ok: 'Confirm',
    back: 'Return',
    home: 'Home',
    mute: 'Mute',
    volume_up: 'VolumeUp',
    volume_down: 'VolumeDown',
  },
  webostv: {
    up: 'UP',
    down: 'DOWN',
    left: 'LEFT',
    right: 'RIGHT',
    ok: 'ENTER',
    back: 'BACK',
    home: 'HOME',
    mute: 'MUTE',
    volume_up: 'VOLUMEUP',
    volume_down: 'VOLUMEDOWN',
  },
}

const VOLUME: Key[] = ['mute', 'volume_up', 'volume_down']

// How long a key is held before it repeats, and how often it does then.
const REPEAT_AFTER_MS = 400
const REPEAT_EVERY_MS = 120

type Target = { entity: string; platform: string }

// The entity that takes the keys: the one picked when its integration is
// known, or else another of the same device, like the remote of a TV picked
// by its player.
export function keysOf(hass: HomeAssistant, entityId: string): Target | null {
  const registry = hass.entities ?? {}
  const device = registry[entityId]?.device_id
  const ids = [
    entityId,
    ...(device ? Object.keys(registry).filter(id => id !== entityId && registry[id].device_id === device) : []),
  ]
  for (const id of ids) {
    const platform = registry[id]?.platform
    if (!platform || !PLATFORMS[platform] || !hass.states[id]) continue
    const domain = id.split('.')[0]
    if (platform === 'webostv' ? domain === 'media_player' : domain === 'remote') return { entity: id, platform }
  }
  return null
}

// A player of the same device that can change its volume, for a remote
// whose integration has no volume keys of its own.
function playerOf(hass: HomeAssistant, entityId: string) {
  const registry = hass.entities ?? {}
  const device = registry[entityId]?.device_id
  const ids = [entityId, ...(device ? Object.keys(registry).filter(id => registry[id].device_id === device) : [])]
  return ids.find(id => id.startsWith('media_player.') && supports(hass.states[id], MEDIA.volumeStep | MEDIA.volumeSet))
}

type Props = { env: TileEnv; config: RemoteConfig }

// A TV remote: arrows around OK on a round pad, back and home in the top
// right corner, and the volume on a tall pill beside the pad, with mute
// between plus and minus. It finds
// the names of the keys from the integration of the entity, or of another
// on its device, so a remote or a TV picked from the list works as it is.
// A key can be given a command of its own, and the volume can go to
// another player, like the TV a box is plugged into. The arrows and the
// volume repeat while held.
export default function Remote({ env, config }: Props) {
  const { hass } = env
  const entity = hass.states[config.entity!]
  const keys = config.entity ? keysOf(hass, config.entity) : null
  const player = config.volume_entity ?? (keys ? undefined : config.entity && playerOf(hass, config.entity))
  const muted = player ? hass.states[player]?.attributes.is_volume_muted === true : false

  // What a key does, or nothing when there is no way to send it.
  const sendOf = (key: Key): (() => void) | null => {
    const own = config.commands?.[key]
    if (own) {
      if (typeof own !== 'string') return () => callService(hass, own.action, own.data)
      const remote = keys?.entity ?? config.entity
      if (!remote?.startsWith('remote.')) return null
      return () => callService(hass, 'remote.send_command', { entity_id: remote, command: own })
    }
    const toPlayer = VOLUME.includes(key) && (config.volume_entity || !keys) ? player : undefined
    if (toPlayer) {
      if (key === 'mute')
        return () => callService(hass, 'media_player.volume_mute', { entity_id: toPlayer, is_volume_muted: !muted })
      return () => callService(hass, `media_player.${key}`, { entity_id: toPlayer })
    }
    if (!keys) return null
    const command = PLATFORMS[keys.platform][key]
    if (keys.platform === 'webostv')
      return () => callService(hass, 'webostv.button', { entity_id: keys.entity, button: command })
    return () => callService(hass, 'remote.send_command', { entity_id: keys.entity, command })
  }

  const known = !!keys || !!config.commands || !!player
  const corner = (['back', 'home'] as const).flatMap(key => {
    const send = sendOf(key)
    return send ? [[key, send] as const] : []
  })
  return (
    <Panel
      env={env}
      config={{ ...config, icon: config.icon ?? 'ph:television' }}
      entity={entity}
      state={known ? formatState(hass, entity) : 'Unknown remote, set its commands'}
      className="dio-remote"
      controls={
        corner.length > 0 &&
        corner.map(([key, send]) => (
          <Control
            key={key}
            icon={LOOK[key].icon}
            label={LOOK[key].label}
            onPress={() => {
              haptic('selection')
              send()
            }}
          />
        ))
      }
    >
      <div className="dio-remote-keys" onPointerDown={e => e.stopPropagation()}>
        <div className="dio-pad">
          {(['up', 'right', 'down', 'left'] as const).map(key => (
            <RemoteKey key={key} name={key} send={sendOf(key)} repeats className={`dio-pad-${key}`} />
          ))}
          <RemoteKey name="ok" send={sendOf('ok')} className="dio-pad-ok" />
        </div>
        <div className="dio-volume">
          <RemoteKey name="volume_up" send={sendOf('volume_up')} repeats />
          <RemoteKey
            name="mute"
            send={sendOf('mute')}
            icon={muted ? 'ph:speaker-x' : 'ph:speaker-high'}
            className={cn('dio-volume-mute', muted && 'dio-remote-muted')}
          />
          <RemoteKey name="volume_down" send={sendOf('volume_down')} repeats />
        </div>
      </div>
    </Panel>
  )
}

const LOOK: Record<Key, { icon: string; label: string }> = {
  up: { icon: 'ph:caret-up', label: 'Up' },
  down: { icon: 'ph:caret-down', label: 'Down' },
  left: { icon: 'ph:caret-left', label: 'Left' },
  right: { icon: 'ph:caret-right', label: 'Right' },
  ok: { icon: '', label: 'OK' },
  back: { icon: 'ph:arrow-u-up-left', label: 'Back' },
  home: { icon: 'ph:house', label: 'Home' },
  mute: { icon: 'ph:speaker-x', label: 'Mute' },
  volume_up: { icon: 'ph:plus', label: 'Volume up' },
  volume_down: { icon: 'ph:minus', label: 'Volume down' },
}

type KeyProps = { name: Key; send: (() => void) | null; repeats?: boolean; icon?: string; className?: string }

// One key, sent on press rather than on release so it feels as quick as a
// real remote's, and again and again while held when it repeats.
function RemoteKey({ name, send, repeats, icon: own, className }: KeyProps) {
  const timer = useRef(0)
  const stop = () => {
    clearTimeout(timer.current)
    clearInterval(timer.current)
    timer.current = 0
  }
  useEffect(() => stop, [])
  const fire = () => {
    haptic('selection')
    send?.()
  }
  const { label } = LOOK[name]
  const icon = own ?? LOOK[name].icon
  return (
    <button
      {...insideTile}
      type="button"
      aria-label={label}
      title={label}
      disabled={!send}
      className={cn('dio-remote-key', className)}
      onPointerDown={e => {
        e.stopPropagation()
        if (e.button !== 0 || !send) return
        fire()
        if (!repeats) return
        stop()
        timer.current = window.setTimeout(() => {
          timer.current = window.setInterval(fire, REPEAT_EVERY_MS)
        }, REPEAT_AFTER_MS)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={e => e.preventDefault()}
      // A press by the keyboard, which has no pointer down before it.
      onClick={e => {
        e.stopPropagation()
        if (e.detail === 0) fire()
      }}
    >
      {icon ? <Icon icon={icon} /> : <span>{label}</span>}
    </button>
  )
}
