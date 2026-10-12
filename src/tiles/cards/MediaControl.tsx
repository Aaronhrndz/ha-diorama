import { cn } from '#/lib/utils.ts'
import { callService, entityName, formatState, haptic, type TileEnv } from '#/tiles/actions.ts'
import { Control } from '#/tiles/Control.tsx'
import { MEDIA, VolumeSlider } from '#/tiles/features/media.tsx'
import { numberOf, supports } from '#/tiles/features/parts.tsx'
import { useNow } from '#/tiles/history.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { Panel } from '#/tiles/Panel.tsx'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

const OFF = ['off', 'standby', 'unavailable', 'unknown']
// An app's package id, words joined by dots with no spaces.
const PACKAGE = /^[\w-]+(\.[\w-]+)+$/
// What a player puts in the title when it has none.
const PLACEHOLDER = /^not provided$/i
// How far a finger goes sideways before the press is a drag along the song.
const SLOP_PX = 8

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes % 60)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`
}

// What the progress leaves out: the boxes that hold the buttons and the
// volume, so it passes behind them without showing through.
const HOLES = '.dio-media-buttons, .dio-slider, .dio-media-small[aria-checked="true"]'

// A mask the size of the card, clear where each box is, with its corners.
const holes = (tile: HTMLElement) => {
  const card = tile.getBoundingClientRect()
  if (!card.width || !card.height) return undefined
  const rects = [...tile.querySelectorAll<HTMLElement>(HOLES)].map(hole => {
    const box = hole.getBoundingClientRect()
    // A box that grows while it is pressed is measured at its own size.
    const width = hole.offsetWidth
    const height = hole.offsetHeight
    const x = box.left + box.width / 2 - width / 2 - card.left
    const y = box.top + box.height / 2 - height / 2 - card.top
    const radius = Math.min(parseFloat(getComputedStyle(hole).borderTopLeftRadius) || 0, height / 2)
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/>`
  })
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${card.height}">` +
    `<mask id="m"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join('')}</g></mask>` +
    `<rect width="100%" height="100%" mask="url(#m)"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
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
// from the title its volume, with shuffle and repeat to its right. The
// card fills from the left as far into the song as it is, faintly, and a
// drag sideways anywhere on it moves along the song when the player can.
// A tap plays or pauses it, or opens the player's dialog while it is off.
// Made two rows tall or half as wide, it leaves out the volume, shuffle and
// repeat, and keeps the buttons and how far in it is. Half as wide it also
// leaves out the power button, which its dialog still has.
export default function MediaControl({ env, config }: { env: TileEnv; config: MediaControlConfig }) {
  const entity = env.hass.states[config.entity!]
  const attributes = entity?.attributes ?? {}
  const playing = entity?.state === 'playing'
  const off = !entity || OFF.includes(entity.state)
  const picture = typeof attributes.entity_picture === 'string' ? attributes.entity_picture : null
  const square = config.art === 'icon'
  const { rows, columns } = config.grid_options ?? {}
  const narrow = typeof columns === 'number' && columns <= 6
  const compact = narrow || (typeof rows === 'number' && rows <= 2)
  const cover = square && !off ? picture : null
  const said = typeof attributes.media_title === 'string' ? attributes.media_title : null
  // A player with nothing to tell, like a speaker playing from a phone over
  // the air, says so in the title, which then goes under the player's name.
  const blank = said !== null && PLACEHOLDER.test(said.trim())
  const title = blank ? null : said
  // An app is named only by a name of its own, never by a package id like
  // com.example.app, which is all some players know of an app they have no
  // name for.
  const app = typeof attributes.app_name === 'string' && !PACKAGE.test(attributes.app_name) ? attributes.app_name : null
  const artist = [attributes.media_artist, attributes.media_album_name, app].find(
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
  // The boxes move when the card changes size or shows other buttons, so
  // they are measured again after every render and on every resize.
  const [mask, setMask] = useState<string>()
  const measure = useRef(() => {})
  measure.current = () => {
    const tile = box.current?.querySelector<HTMLElement>('.dio-tile')
    if (tile) setMask(holes(tile))
  }
  useLayoutEffect(() => measure.current())
  useEffect(() => {
    if (!box.current) return
    const observer = new ResizeObserver(() => measure.current())
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [])
  // A drag that starts on the volume or a button is theirs.
  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !seekable) return
    if ((e.target as Element).closest('button, [role="slider"], .dio-feature, .dio-control')) return
    start.current = { x: e.clientX, y: e.clientY, from: share, dragging: false }
  }
  const time = timed && <span className="dio-media-time">{clock(share * duration)}</span>
  const shuffle = !off && has(MEDIA.shuffle) && (
    <Control
      icon="ph:shuffle"
      label="Shuffle"
      className="dio-media-small"
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
      className="dio-media-small"
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
    <div className="dio-feature">
      <VolumeSlider env={env} config={config} entity={entity} />
    </div>
  )
  return (
    <div
      ref={box}
      className="dio-media-seek"
      data-seekable={seekable || undefined}
      data-dragging={drag !== null || undefined}
      onPointerDownCapture={down}
    >
      <Panel
        env={env}
        config={{ ...config, name: off ? name : (title ?? name) }}
        entity={entity}
        state={
          off
            ? formatState(env.hass, entity)
            : blank
              ? said
              : (artist ?? (title ? name : formatState(env.hass, entity)))
        }
        accent="var(--_accent-media)"
        onTap={!off && has(playing ? MEDIA.pause : MEDIA.play) ? run('media_play_pause') : undefined}
        className={cn('dio-media-control', cover && 'dio-media-cover', compact && 'dio-media-compact')}
        picture={cover ?? undefined}
        style={
          {
            '--_art': picture && !square ? `url("${picture}")` : undefined,
            '--_progress': timed ? `${share * 100}%` : undefined,
            '--_holes': timed ? mask : undefined,
          } as CSSProperties
        }
        controls={
          entity && (
            <>
              {time}
              <div className="dio-media-buttons">
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
                {!narrow && has(off ? MEDIA.turnOn : MEDIA.turnOff) && (
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
        {!compact && (shuffle || repeat || volume) && (
          <div className="dio-media-row">
            {volume}
            {shuffle}
            {repeat}
          </div>
        )}
      </Panel>
    </div>
  )
}
