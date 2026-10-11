import { callService, entityName, formatState, type TileEnv } from '#/tiles/actions.ts'
import { Control } from '#/tiles/Control.tsx'
import { MEDIA, VolumeSlider } from '#/tiles/features/media.tsx'
import { numberOf, supports } from '#/tiles/features/parts.tsx'
import { useNow } from '#/tiles/history.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { Panel } from '#/tiles/Panel.tsx'
import type { CSSProperties } from 'react'

const OFF = ['off', 'standby', 'unavailable', 'unknown']

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes % 60)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`
}

// What is playing, with the cover art washed large and blurred behind the
// whole card: the title and the artist in the bottom left corner where a
// tile has its name, the buttons to play it in the top right, and across
// from the title how far into it it is and its volume, with shuffle and
// repeat on either side. A tap opens the player's dialog.
export default function MediaControl({ env, config }: { env: TileEnv; config: TileConfig }) {
  const entity = env.hass.states[config.entity!]
  const attributes = entity?.attributes ?? {}
  const playing = entity?.state === 'playing'
  const off = !entity || OFF.includes(entity.state)
  const picture = typeof attributes.entity_picture === 'string' ? attributes.entity_picture : null
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
  const progress = timed && (
    <div className="fp-progress">
      <div
        className="fp-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(Math.min(at, duration))}
      >
        <span style={{ width: `${Math.min(at / duration, 1) * 100}%` }} />
      </div>
      <div className="fp-progress-times">
        <span>{clock(Math.min(at, duration))}</span>
        <span>-{clock(duration - Math.min(at, duration))}</span>
      </div>
    </div>
  )
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
    <Panel
      env={env}
      config={{ ...config, name: off ? name : (title ?? name) }}
      entity={entity}
      state={off ? formatState(env.hass, entity) : (artist ?? (title ? name : formatState(env.hass, entity)))}
      accent="var(--_accent-media)"
      className="fp-media-control"
      style={picture ? ({ '--_art': `url("${picture}")` } as CSSProperties) : undefined}
      controls={
        entity && (
          <>
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
          </>
        )
      }
    >
      {(progress || shuffle || repeat || volume) && (
        <div className="fp-media-side" data-art={picture ? true : undefined}>
          {progress}
          {(shuffle || repeat || volume) && (
            <div className="fp-media-row">
              {shuffle}
              {volume}
              {repeat}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
