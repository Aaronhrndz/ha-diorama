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
import { useEffect, useRef, useState, type CSSProperties } from 'react'

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
// How long the power key waits for the second press that turns it off.
const ARMED_MS = 3000

const OFF = ['off', 'standby', 'unavailable', 'unknown']

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

// A TV remote: back, home and power in the top right corner, minus, mute and
// plus just left of them, and arrows around OK on a round pad under them.
// Half as wide, back and home stay in the corner, and the pad and then the
// volume stand under them, in the middle. It finds
// the names of the keys from the integration of the entity, or of another
// on its device, so a remote or a TV picked from the list works as it is.
// A key can be given a command of its own, and the volume can go to
// another player, like the TV a box is plugged into. The arrows and the
// volume repeat while held. While it is off only power can be pressed, and
// while the player of the volume is off the volume cannot either. Power turns it on at once, but turns it off only on a
// second press within a few seconds, so it is never turned off by mistake.
// A tap on the card around the keys does nothing, and a long press opens
// its dialog.
export default function Remote({ env, config }: Props) {
  const { hass } = env
  const entity = hass.states[config.entity!]
  const keys = config.entity ? keysOf(hass, config.entity) : null
  const player = config.volume_entity ?? (keys ? undefined : config.entity && playerOf(hass, config.entity))
  const muted = player ? hass.states[player]?.attributes.is_volume_muted === true : false
  const off = !entity || OFF.includes(entity.state)
  // Power waits for a second press to turn it off until this runs out.
  const [waiting, setArmed] = useState(false)
  const armed = waiting && !off
  const disarm = useRef(0)
  useEffect(() => () => clearTimeout(disarm.current), [])
  // The service that turns it on or off, when it has one.
  const domain = config.entity?.split('.')[0]
  const powerOf = (on: boolean) =>
    domain === 'remote' || (domain === 'media_player' && supports(entity, on ? MEDIA.turnOn : MEDIA.turnOff))
      ? () => callService(hass, `${domain}.turn_${on ? 'on' : 'off'}`, { entity_id: config.entity })
      : null
  const turn = powerOf(off)
  const power = () => {
    if (!turn) return
    clearTimeout(disarm.current)
    if (off || armed) {
      haptic(off ? 'selection' : 'medium')
      setArmed(false)
      turn()
      return
    }
    haptic('selection')
    setArmed(true)
    disarm.current = window.setTimeout(() => setArmed(false), ARMED_MS)
  }

  // What a key does, or nothing when there is no way to send it.
  const reach = (key: Key): (() => void) | null => {
    const own = config.commands?.[key]
    if (own) {
      if (typeof own !== 'string') return () => callService(hass, own.action, own.data)
      const remote = keys?.entity ?? config.entity
      if (!remote?.startsWith('remote.')) return null
      return () => callService(hass, 'remote.send_command', { entity_id: remote, command: own })
    }
    const toPlayer = VOLUME.includes(key) && (config.volume_entity || !keys) ? player : undefined
    if (toPlayer) {
      // A player that is off takes no volume.
      if (OFF.includes(hass.states[toPlayer]?.state ?? 'unavailable')) return null
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
  // While it is off only power can be pressed, since any other key would
  // wake it, and with it the TV.
  const sendOf = (key: Key) => (off ? null : reach(key))

  const known = !!keys || !!config.commands || !!player
  const corner = (['back', 'home'] as const).flatMap(key => {
    const send = reach(key)
    return send ? [[key, send] as const] : []
  })
  return (
    <Panel
      env={env}
      config={{ ...config, icon: config.icon ?? 'ph:television' }}
      entity={entity}
      state={known ? formatState(hass, entity) : 'Unknown remote, set its commands'}
      className="dio-remote"
      onTap={null}
      controls={
        (corner.length > 0 || turn) && (
          <>
            {corner.map(([key, send]) => (
              <Control
                key={key}
                icon={LOOK[key].icon}
                label={LOOK[key].label}
                disabled={off}
                onPress={() => {
                  haptic('selection')
                  send()
                }}
              />
            ))}
            {turn && (
              <Control
                icon="ph:power-bold"
                label={off ? 'Turn on' : armed ? 'Press again to turn off' : 'Turn off'}
                className={cn(armed && 'dio-remote-armed')}
                style={{ '--_armed-ms': `${ARMED_MS}ms` } as CSSProperties}
                onPress={power}
              />
            )}
          </>
        )
      }
    >
      <div className="dio-pad" onPointerDown={e => e.stopPropagation()}>
        {(['up', 'right', 'down', 'left'] as const).map(key => (
          <RemoteKey key={key} name={key} send={sendOf(key)} repeats className={`dio-pad-${key}`} />
        ))}
        <RemoteKey name="ok" send={sendOf('ok')} className="dio-pad-ok" />
      </div>
      <div className="dio-controls dio-volume" onPointerDown={e => e.stopPropagation()}>
        <RemoteKey name="volume_down" send={sendOf('volume_down')} repeats className="dio-control" />
        <RemoteKey
          name="mute"
          send={sendOf('mute')}
          icon={muted ? 'ph:speaker-x' : 'ph:speaker-high'}
          className={cn('dio-control', muted && 'dio-remote-muted')}
        />
        <RemoteKey name="volume_up" send={sendOf('volume_up')} repeats className="dio-control" />
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
