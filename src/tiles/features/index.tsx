import * as climate from '#/tiles/features/climate.tsx'
import * as cover from '#/tiles/features/cover.tsx'
import * as light from '#/tiles/features/light.tsx'
import * as media from '#/tiles/features/media.tsx'
import * as other from '#/tiles/features/other.tsx'
import { domainOf, listOf, numberOf, supports, type FeatureProps } from '#/tiles/features/parts.tsx'
import type { EntityState } from '#/types.ts'
import type { ComponentType } from 'react'

// The features a tile can show beside its icon, by the names Home
// Assistant gives its own tile features. Each says which domains it is
// for and whether an entity has what it needs, so the card picker offers
// only the ones that work.

export type FeatureDef = {
  id: string
  // How the editor names the choice, and the card picker the suggestion
  // after the tile's tap, as in Floorplan Toggle - Tap to turn on or off,
  // with color bar.
  label: string
  // What the card picker says after the tap in place of with and the label,
  // for a control that is the whole tile.
  does?: string | ((entity: EntityState) => string)
  // What the card picker says in place of the tap too, for a control that
  // changes what a tap does.
  suggestion?: string
  domains: string[]
  supports?: (entity: EntityState) => boolean
  // What it draws across from the icon, so the tile stays two rows tall.
  // A feature without one is the whole tile instead, drawn by the tile
  // itself.
  View?: ComponentType<FeatureProps>
  // Too big to sit beside the icon, so it goes along the bottom and makes
  // the tile a row taller.
  row?: boolean
  // Too many buttons to fit beside the icon of a small tile, so a tile
  // with it is always wide, or only for an entity it says.
  wide?: boolean | ((entity: EntityState) => boolean)
  // What the tile says under its name while it is on, in place of what it
  // would say without the feature, like a light's white in kelvin.
  state?: (entity: EntityState) => string | undefined
}

const has = (attribute: string) => (entity: EntityState) => listOf(entity, attribute).length > 0
const bit = (value: number) => (entity: EntityState) => supports(entity, value)
const numeric = (entity: EntityState) => Number.isFinite(Number(entity.state)) && entity.state !== ''
const menu = (id: keyof typeof climate.MENUS) => (props: FeatureProps) => (
  <climate.ModeMenu {...props} menu={climate.MENUS[id]} />
)

const COVERS = ['cover', 'valve']

export const FEATURES: FeatureDef[] = [
  {
    id: 'brightness',
    label: 'Brightness slider',
    does: 'drag for brightness',
    domains: ['light'],
    supports: light.dims,
  },
  {
    id: 'color-temp',
    label: 'White temperature bar',
    domains: ['light'],
    supports: light.warms,
    View: light.ColorTemp,
    state: light.tempState,
  },
  {
    id: 'color',
    label: 'Color bar',
    domains: ['light'],
    supports: light.colors,
    View: light.Hue,
    state: light.hueState,
  },
  {
    id: 'color-favorites',
    label: 'Favorite color buttons',
    domains: ['light'],
    supports: e => light.warms(e) || light.colors(e),
    View: light.ColorFavorites,
  },
  { id: 'effect', label: 'Effect menu', domains: ['light'], supports: has('effect_list'), View: light.Effect },
  {
    id: 'open-close',
    label: 'Open, stop and close buttons',
    domains: COVERS,
    supports: e => supports(e, cover.OPEN) || supports(e, cover.CLOSE),
    View: cover.OpenClose,
  },
  {
    id: 'position',
    label: 'Position slider',
    does: 'drag to set how far open',
    domains: COVERS,
    supports: bit(cover.SET_POSITION),
  },
  {
    id: 'position-favorite',
    label: 'Favorite position buttons',
    domains: COVERS,
    supports: bit(cover.SET_POSITION),
    View: cover.Favorites,
    wide: true,
  },
  {
    id: 'tilt',
    label: 'Slat open and close buttons',
    domains: ['cover'],
    supports: e => supports(e, cover.OPEN_TILT) || supports(e, cover.CLOSE_TILT),
    View: cover.Tilt,
  },
  {
    id: 'tilt-position',
    label: 'Slat tilt slider',
    does: 'drag to tilt the slats',
    domains: ['cover'],
    supports: bit(cover.SET_TILT),
  },
  {
    id: 'tilt-favorite',
    label: 'Favorite tilt buttons',
    domains: ['cover'],
    supports: bit(cover.SET_TILT),
    View: props => <cover.Favorites {...props} tilt />,
    wide: true,
  },
  { id: 'speed', label: 'Speed slider', does: 'drag for speed', domains: ['fan'], supports: bit(cover.FAN.speed) },
  {
    id: 'speed-buttons',
    label: 'Speed buttons',
    domains: ['fan'],
    // Off and up to four speeds, like Home Assistant's own.
    supports: e => supports(e, cover.FAN.speed) && cover.speedCount(e) > 0 && cover.speedCount(e) <= 4,
    View: cover.FanSpeeds,
    wide: e => cover.speedCount(e) > 2,
  },
  {
    id: 'speed-menu',
    label: 'Speed menu',
    domains: ['fan'],
    supports: e => supports(e, cover.FAN.speed) && cover.speedCount(e) > 0 && cover.speedCount(e) <= 10,
    View: cover.FanSpeedMenu,
  },
  {
    id: 'preset-modes',
    label: 'Preset menu',
    domains: ['fan'],
    supports: e => supports(e, cover.FAN.preset) && has('preset_modes')(e),
    View: cover.FanPreset,
  },
  {
    id: 'direction',
    label: 'Forward and reverse buttons',
    domains: ['fan'],
    supports: bit(cover.FAN.direction),
    View: cover.FanDirection,
  },
  {
    id: 'oscillate',
    label: 'Oscillate button',
    domains: ['fan'],
    supports: bit(cover.FAN.oscillate),
    View: cover.FanOscillate,
  },
  {
    id: 'hvac-modes',
    label: 'Mode buttons',
    domains: ['climate'],
    supports: has('hvac_modes'),
    View: climate.HvacModes,
    wide: true,
  },
  {
    id: 'target-temperature',
    label: 'Temperature minus and plus buttons',
    domains: ['climate', 'water_heater'],
    supports: e => numberOf(e, 'temperature') !== null || numberOf(e, 'target_temp_low') !== null,
    View: climate.TargetTemperature,
    // A range is two temperatures with minus and plus around them.
    wide: e => numberOf(e, 'temperature') === null && numberOf(e, 'target_temp_low') !== null,
  },
  {
    id: 'preset-modes',
    label: 'Preset menu',
    domains: ['climate'],
    supports: has('preset_modes'),
    View: menu('preset-modes'),
  },
  { id: 'fan-modes', label: 'Fan menu', domains: ['climate'], supports: has('fan_modes'), View: menu('fan-modes') },
  {
    id: 'swing-modes',
    label: 'Swing menu',
    domains: ['climate'],
    supports: has('swing_modes'),
    View: menu('swing-modes'),
  },
  {
    id: 'swing-horizontal-modes',
    label: 'Side to side swing menu',
    domains: ['climate'],
    supports: has('swing_horizontal_modes'),
    View: menu('swing-horizontal-modes'),
  },
  {
    id: 'humidity-slider',
    label: 'Humidity slider',
    does: 'drag for the humidity to hold',
    domains: ['humidifier'],
    supports: e => numberOf(e, 'humidity') !== null,
  },
  {
    id: 'target-humidity',
    label: 'Humidity minus and plus buttons',
    domains: ['climate', 'humidifier'],
    supports: e => numberOf(e, 'humidity') !== null && (domainOf(e) === 'humidifier' || supports(e, 4)),
    View: climate.TargetHumidity,
  },
  {
    id: 'operation-modes',
    label: 'Operation mode menu',
    domains: ['water_heater'],
    supports: has('operation_list'),
    View: menu('operation-modes'),
  },
  { id: 'modes', label: 'Mode menu', domains: ['humidifier'], supports: has('available_modes'), View: menu('modes') },
  {
    id: 'playback',
    label: 'Play, pause and skip buttons',
    domains: ['media_player'],
    supports: e =>
      [media.MEDIA.pause, media.MEDIA.play, media.MEDIA.previous, media.MEDIA.next].some(b => supports(e, b)),
    View: media.Playback,
  },
  {
    id: 'volume-slider',
    label: 'Volume slider',
    does: 'drag for volume',
    domains: ['media_player'],
    supports: bit(media.MEDIA.volumeSet),
  },
  {
    id: 'volume-buttons',
    label: 'Volume down and up buttons',
    domains: ['media_player'],
    supports: e => supports(e, media.MEDIA.volumeStep) || supports(e, media.MEDIA.volumeSet),
    View: media.VolumeButtons,
  },
  {
    id: 'source',
    label: 'Source menu',
    domains: ['media_player'],
    supports: e => supports(e, media.MEDIA.source) && has('source_list')(e),
    View: media.Source,
  },
  {
    id: 'sound-mode',
    label: 'Sound mode menu',
    domains: ['media_player'],
    supports: e => supports(e, media.MEDIA.soundMode) && has('sound_mode_list')(e),
    View: media.SoundMode,
  },
  {
    id: 'open-door',
    label: 'Two taps to open the door',
    suggestion: 'Tap twice to open the door',
    domains: ['lock'],
    supports: bit(1),
  },
  {
    id: 'commands',
    label: 'Start, pause and dock buttons',
    domains: ['vacuum'],
    View: other.VacuumCommands,
    wide: true,
  },
  {
    id: 'fan-speed',
    label: 'Suction menu',
    domains: ['vacuum'],
    supports: e => supports(e, other.VACUUM_FAN_SPEED) && has('fan_speed_list')(e),
    View: other.VacuumFanSpeed,
  },
  { id: 'commands', label: 'Mow, pause and dock buttons', domains: ['lawn_mower'], View: other.MowerCommands },
  {
    id: 'alarm-modes',
    label: 'Arm and disarm buttons',
    domains: ['alarm_control_panel'],
    View: other.AlarmModes,
    wide: true,
  },
  { id: 'actions', label: 'Minus, reset and plus buttons', domains: ['counter'], View: other.CounterActions },
  { id: 'actions', label: 'Start, pause and cancel buttons', domains: ['timer'], View: other.TimerActions },
  {
    id: 'select-options',
    label: 'Option menu',
    domains: ['select', 'input_select'],
    supports: has('options'),
    View: other.SelectOptions,
  },
  {
    id: 'numeric-input',
    label: 'Value slider or minus and plus',
    does: e => (other.asksForBox(e) ? 'with minus and plus buttons' : 'drag for its value'),
    domains: ['number', 'input_number'],
    supports: numeric,
    View: other.NumericInput,
  },
  { id: 'date-set', label: 'Date picker', domains: ['date', 'datetime', 'input_datetime'], View: other.DateSet },
  { id: 'update-actions', label: 'Install and skip buttons', domains: ['update'], View: other.UpdateActions },
  {
    id: 'button',
    label: 'Press button',
    domains: ['button', 'input_button', 'script', 'scene'],
    View: other.PressButton,
  },
  {
    id: 'trend-graph',
    label: 'Graph of the last day',
    domains: ['sensor'],
    supports: e => numeric(e) && typeof e.attributes.unit_of_measurement === 'string',
    View: other.TrendGraph,
  },
  {
    id: 'bar-gauge',
    label: 'Percentage fill',
    does: 'filled as far as its percentage',
    domains: ['sensor'],
    supports: e => numeric(e) && e.attributes.unit_of_measurement === '%',
  },
]

// The features an entity can have, in the order the card picker offers them.
export function featuresFor(entity: EntityState | undefined) {
  if (!entity) return []
  const domain = domainOf(entity)
  return FEATURES.filter(f => f.domains.includes(domain) && (f.supports?.(entity) ?? true))
}

// Whether a tile's feature goes along its bottom, making it a row taller.
export const addsRow = (feature: string | undefined) =>
  !!feature && !!FEATURES.find(f => f.id === feature && f.View && f.row)

// What a tile with the feature says under its name, when the feature
// has something to say.
export const featureState = (feature: string | undefined, entity: EntityState) =>
  FEATURES.find(f => f.id === feature && f.domains.includes(domainOf(entity)))?.state?.(entity)

// Whether a tile is wide, because its config says so or because its
// feature only fits a wide one, for its entity when it is known.
export const isWide = (config: { size?: string; entity?: string; feature?: string }, entity?: EntityState) =>
  config.size === 'wide' ||
  (!!config.feature &&
    FEATURES.some(
      f =>
        f.id === config.feature &&
        f.domains.includes(config.entity?.split('.')[0] ?? '') &&
        (typeof f.wide === 'function' ? !!entity && f.wide(entity) : !!f.wide),
    ))

// How many rows a tile takes: three for a feature along its bottom, or for
// a wide thermostat with its temperature in the top right corner and its
// modes along the bottom, and two for the rest.
export const tileRows = (config: { size?: string; entity?: string; feature?: string }, entity?: EntityState) =>
  addsRow(config.feature) ||
  (config.size === 'wide' &&
    !config.feature &&
    !!config.entity?.startsWith('climate.') &&
    (!entity || listOf(entity, 'hvac_modes').length > 0))
    ? 3
    : 2

// Whether the feature is drawn across from the icon.
export const besideIcon = (feature: string | undefined) =>
  !!feature && !!FEATURES.find(f => f.id === feature && f.View && !f.row)

// The features of a domain, for the editor, whatever the entity has.
// What the editor calls a control that means something else for each
// domain, when it lists them for a tile of more than one.
const SHARED: Record<string, string> = { actions: 'Counter or timer buttons', commands: 'Vacuum or mower buttons' }

export function featuresOf(domains: string[] | 'any') {
  const seen = new Map<string, string>()
  for (const f of FEATURES)
    if (domains === 'any' || f.domains.some(d => domains.includes(d)))
      seen.set(f.id, seen.has(f.id) && seen.get(f.id) !== f.label ? (SHARED[f.id] ?? seen.get(f.id)!) : f.label)
  return [...seen].map(([value, label]) => ({ value, label }))
}

// The feature a tile's config names, drawn for its entity.
export function Feature(props: FeatureProps) {
  const domain = domainOf(props.entity)
  const def = FEATURES.find(f => f.id === props.config.feature && f.domains.includes(domain))
  if (!def?.View) return null
  const View = def.View
  return (
    <div className="fp-feature">
      <View {...props} />
    </div>
  )
}
