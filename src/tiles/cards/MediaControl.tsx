import { cn } from '#/lib/utils.ts'
import { callService, entityName, formatState, haptic, type TileEnv } from '#/tiles/actions.ts'
import { Control } from '#/tiles/Control.tsx'
import { MEDIA, VolumeSlider } from '#/tiles/features/media.tsx'
import { numberOf, supports } from '#/tiles/features/parts.tsx'
import { useNow } from '#/tiles/history.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { Panel } from '#/tiles/Panel.tsx'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

const OFF = ['off', 'standby', 'unavailable', 'unknown']
// How far a finger goes sideways before the press is a drag along the song.
const SLOP_PX = 8

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes % 60)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`
}

export type MediaControlConfig = TileConfig & {
  // Where the cover art goes: washed large and blurred behind the whole
  // card, or square in place of the icon.
  art?: 'background' | 'icon'
}

// What is playing, with the cover art washed large and blurred behind the
// whole card, or square in place of the icon: the title and the artist in
// the bottom left corner where a tile has its name, the buttons to play it
// in the top right with how far into it it is on their left, and across
// from the title its volume, with shuffle and repeat on either side. The
// card fills from the left as far into the song as it is, faintly, and a
// drag sideways anywhere on it moves along the song when the player can.
// A tap plays or pauses it, or opens the player's dialog while it is off.
export default function MediaControl({ env, config }: { env: TileEnv; config: MediaControlConfig }) {
  const entity = env.hass.states[config.entity!]
  const attributes = entity?.attributes ?? {}
  const playing = entity?.state === 'playing'
  const off = !entity || OFF.includes(entity.state)
  const picture = typeof attributes.entity_picture === 'string' ? attributes.entity_picture : null
  const square = config.art === 'icon'
  const cover = square && !off ? picture : null
  const title = typeof attributes.media_title === 'string' ? attributes.media_title : null
  const artist = [attributes.media_artist, attributes.media_album_name, attributes.app_name].find(
    part => typeof part === 'string' && part,
  ) as string | undefined
  const duration = numberOf(entity, 'media_duration')
  const position = numberOf(entity, 'media_position')
  const updated = typeof attributes.media_position_updated_at === 'string' ? attributes.media_position_updated_at : null
  const now = useNow(1000)
  // The position moves on from when the player last said where it was.
  const at = position === null ? null : playing && updated ? position + (now - Date.parse(updated)) / 1000 : position
  const run = (service: string) => () => callService(env.hass, `media_player.${service}`, { entity_id: config.entity })
  const has = (bit: number) => supports(entity, bit)
  const name = entityName(config, entity)
  const timed = !off && duration !== null && duration > 0 && at !== null
  const seekable = timed && has(MEDIA.seek)
  // Where a drag along the song is, from 0 to 1, until it lets go.
  const [drag, setDrag] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; from: number; dragging: boolean } | null>(null)
  const share = drag ?? (timed ? Math.min(at / duration, 1) : 0)
  // The window listeners outlive a render, so they reach the latest ones
  // through here.
  const latest = useRef({ drag, duration, entityId: config.entity, hass: env.hass })
  useEffect(() => {
    latest.current = { drag, duration, entityId: config.entity, hass: env.hass }
  })
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current
      if (!s || !box.current) return
      const along = e.clientX - s.x
      if (!s.dragging) {
        if (Math.abs(along) < SLOP_PX || Math.abs(along) < Math.abs(e.clientY - s.y)) return
        s.dragging = true
      }
      setDrag(Math.min(1, Math.max(0, s.from + along / box.current.getBoundingClientRect().width)))
    }
    const up = () => {
      const s = start.current
      start.current = null
      if (!s?.dragging) return
      const { drag, duration, entityId, hass } = latest.current
      setDrag(null)
      if (drag === null || !duration) return
      haptic('selection')
      void callService(hass, 'media_player.media_seek', {
        entity_id: entityId,
        seek_position: Math.round(drag * duration),
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])
  // A drag that starts on the volume or a button is theirs.
  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !seekable) return
    if ((e.target as Element).closest('button, [role="slider"], .fp-feature, .fp-control')) return
    start.current = { x: e.clientX, y: e.clientY, from: share, dragging: false }
  }
  const time = timed && <span className="fp-media-time">{clock(share * duration)}</span>
  const shuffle = !off && has(MEDIA.shuffle) && (
    <Control
      icon="ph:shuffle"
      label="Shuffle"
      className="fp-media-small"
      role="radio"
      checked={attributes.shuffle === true}
      onPress={() =>
        callService(env.hass, 'media_player.shuffle_set', {
          entity_id: config.entity,
          shuffle: attributes.shuffle !== true,
        })
      }
    />
  )
  const repeat = !off && has(MEDIA.repeat) && (
    <Control
      icon={attributes.repeat === 'one' ? 'ph:repeat-once' : 'ph:repeat'}
      label="Repeat"
      className="fp-media-small"
      role="radio"
      checked={attributes.repeat === 'all' || attributes.repeat === 'one'}
      onPress={() =>
        callService(env.hass, 'media_player.repeat_set', {
          entity_id: config.entity,
          repeat: attributes.repeat === 'off' ? 'all' : attributes.repeat === 'all' ? 'one' : 'off',
        })
      }
    />
  )
  const volume = entity && !off && has(MEDIA.volumeSet) && (
    <div className="fp-feature">
      <VolumeSlider env={env} config={config} entity={entity} />
    </div>
  )
  return (
    <div
      ref={box}
      className="fp-media-seek"
      data-seekable={seekable || undefined}
      data-dragging={drag !== null || undefined}
      onPointerDownCapture={down}
    >
      <Panel
        env={env}
        config={{ ...config, name: off ? name : (title ?? name) }}
        entity={entity}
        state={off ? formatState(env.hass, entity) : (artist ?? (title ? name : formatState(env.hass, entity)))}
        accent="var(--_accent-media)"
        onTap={!off && has(playing ? MEDIA.pause : MEDIA.play) ? run('media_play_pause') : undefined}
        className={cn('fp-media-control', cover && 'fp-media-cover')}
        picture={cover ?? undefined}
        style={
          {
            '--_art': picture && !square ? `url("${picture}")` : undefined,
            '--_progress': timed ? `${share * 100}%` : undefined,
          } as CSSProperties
        }
        controls={
          entity && (
            <>
              {time}
              <div className="fp-media-buttons">
                {!off && has(MEDIA.previous) && (
                  <Control icon="ph:skip-back" label="Previous" onPress={run('media_previous_track')} />
                )}
                {!off && has(playing ? MEDIA.pause : MEDIA.play) && (
                  <Control
                    icon={playing ? 'ph:pause' : 'ph:play'}
                    label={playing ? 'Pause' : 'Play'}
                    onPress={run('media_play_pause')}
                  />
                )}
                {!off && has(MEDIA.next) && (
                  <Control icon="ph:skip-forward" label="Next" onPress={run('media_next_track')} />
                )}
                {has(off ? MEDIA.turnOn : MEDIA.turnOff) && (
                  <Control
                    icon="ph:power-bold"
                    label={off ? 'Turn on' : 'Turn off'}
                    onPress={run(off ? 'turn_on' : 'turn_off')}
                  />
                )}
              </div>
            </>
          )
        }
      >
        {(shuffle || repeat || volume) && (
          <div className="fp-media-row">
            {shuffle}
            {volume}
            {repeat}
          </div>
        )}
      </Panel>
    </div>
  )
}
