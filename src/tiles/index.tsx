import { registerIcons, tileForm, titleForm, type Extra } from '#/tiles/editor.ts'
import { stubEntity, TileHost, type GridOptions, type TileConfig } from '#/tiles/host.tsx'
import Button from '#/tiles/cards/Button.tsx'
import Camera, { type CameraConfig } from '#/tiles/cards/Camera.tsx'
import Climate from '#/tiles/cards/Climate.tsx'
import Cover, { type CoverConfig } from '#/tiles/cards/Cover.tsx'
import Entity from '#/tiles/cards/Entity.tsx'
import Lock from '#/tiles/cards/Lock.tsx'
import Media from '#/tiles/cards/Media.tsx'
import Select, { type SelectConfig } from '#/tiles/cards/Select.tsx'
import Title, { type TitleConfig } from '#/tiles/cards/Title.tsx'
import Toggle from '#/tiles/cards/Toggle.tsx'
import Vacuum, { type VacuumConfig } from '#/tiles/cards/Vacuum.tsx'
import AlarmPanel from '#/tiles/cards/AlarmPanel.tsx'
import Calendar, { type CalendarConfig } from '#/tiles/cards/Calendar.tsx'
import Dial from '#/tiles/cards/Dial.tsx'
import Gauge, { type GaugeConfig } from '#/tiles/cards/Gauge.tsx'
import Graph, { isNumeric, type GraphConfig } from '#/tiles/cards/Graph.tsx'
import MapCard, { type MapConfig } from '#/tiles/cards/Map.tsx'
import MediaControl, { type MediaControlConfig } from '#/tiles/cards/MediaControl.tsx'
import Todo from '#/tiles/cards/Todo.tsx'
import Weather, { type WeatherConfig } from '#/tiles/cards/Weather.tsx'
import { featuresFor, isWide } from '#/tiles/features/index.tsx'
import { supports } from '#/tiles/features/parts.tsx'
import type { HomeAssistant } from '#/types.ts'
import type { ReactNode } from 'react'

// The Diorama tiles, shipped in the same file as the diorama card.

const TOGGLE_DOMAINS = [
  'light',
  'switch',
  'input_boolean',
  'fan',
  'humidifier',
  'siren',
  'remote',
  'automation',
  'valve',
]
const BUTTON_DOMAINS = ['button', 'input_button', 'script', 'scene']
const COVER_DOMAINS = ['cover']
const VACUUM_DOMAINS = ['vacuum']
const SELECT_DOMAINS = ['select', 'input_select']
const CAMERA_DOMAINS = ['camera', 'image']
const CLIMATE_DOMAINS = ['climate', 'water_heater']
const MEDIA_DOMAINS = ['media_player']
const LOCK_DOMAINS = ['lock']
const WEATHER_DOMAINS = ['weather']
const GRAPH_DOMAINS = ['sensor', 'binary_sensor', 'input_number', 'number', 'counter', 'person', 'device_tracker']
const GAUGE_DOMAINS = ['sensor', 'input_number', 'number', 'counter']
const DIAL_DOMAINS = ['climate', 'water_heater', 'humidifier', 'light']
const MAP_DOMAINS = ['person', 'device_tracker', 'zone']

// What the dial is called for each domain in the card picker.
// Pause, seek, volume set, previous, next, volume step, stop and play.
const PLAYS = 1 | 2 | 4 | 16 | 32 | 1024 | 4096 | 16384

const DIAL_NAMES: Record<string, string> = {
  climate: 'Drag the ring for the temperature',
  water_heater: 'Drag the ring for the temperature',
  humidifier: 'Drag the ring for the humidity',
  light: 'Drag the ring for the brightness',
}

type EntityView<C extends TileConfig> = (props: {
  env: { hass: HomeAssistant; host: HTMLElement; entityId?: string }
  config: C
}) => ReactNode

// One class per card, which only names its domains and its view. A wide
// card starts wide in the card picker, to show its controls.
function entityCard<C extends TileConfig>(
  domains: string[] | 'any',
  View: EntityView<C>,
  extras: Extra[] = [],
  wide = false,
  panel = false,
) {
  return class extends TileHost<C> {
    protected readonly domains = domains

    static getConfigForm() {
      return tileForm(domains, extras, panel)
    }

    static getStubConfig(hass?: HomeAssistant) {
      const named = domains === 'any' ? ['sensor'] : domains
      return { entity: stubEntity(hass, named) ?? `${named[0]}.example`, ...(wide && { size: 'wide' }) }
    }

    protected view() {
      if (!this._hass) return null
      const env = { hass: this._hass, host: this, entityId: this._config!.entity }
      return <View env={env} config={this._config!} />
    }
  }
}

class TitleCard extends TileHost<TitleConfig & TileConfig> {
  protected readonly domains = null

  static getStubConfig() {
    return { title: 'Living Room' }
  }

  static getConfigForm() {
    return titleForm()
  }

  getCardSize() {
    return 1
  }

  getGridOptions(): GridOptions {
    return { columns: 'full', rows: 1 }
  }

  protected view() {
    return <Title hass={this._hass} config={this._config!} area={this.area()} />
  }
}

class CameraCard extends entityCard<CameraConfig>(CAMERA_DOMAINS, Camera, ['camera']) {
  getCardSize() {
    return 4
  }

  getGridOptions(): GridOptions {
    return { columns: 12, rows: 'auto' }
  }
}

class WeatherCard extends entityCard<WeatherConfig>(WEATHER_DOMAINS, Weather, ['forecast']) {
  getCardSize() {
    return this._config?.size === 'large' ? 6 : 3
  }

  getGridOptions(): GridOptions {
    const size = this._config?.size
    return { columns: size === 'small' ? 6 : 'full', rows: size === 'large' ? 6 : 3 }
  }
}

// A card bigger than a tile, like the calendar, as wide and as tall as the
// grid says, whatever size its config names.
function panelCard<C extends TileConfig>(
  domains: string[],
  View: EntityView<C>,
  grid: GridOptions,
  size: number,
  extras: Extra[] = [],
) {
  return class extends entityCard<C>(domains, View, extras, false, true) {
    getCardSize() {
      return size
    }

    getGridOptions(): GridOptions {
      return grid
    }
  }
}

type Card = {
  type: string
  element: CustomElementConstructor
  name: string
  description: string
  // The entity domains it shows, any for every one, none for no entity.
  domains: string[] | 'any' | null
  // Wide, it shows its controls, and small it does not.
  wide?: boolean
  // A card of its own for a few domains, like the alarm panel, offered
  // beside the tile of the domain rather than in its place.
  extra?: boolean
  // What the card picker says after the card's name for the tile with no
  // control, which a control's suggestion starts with too, as in Diorama
  // Toggle - Tap to turn on or off, drag for brightness. Home Assistant shows
  // no description there, so it says all the tile does.
  does?: string | ((domain: string) => string)
  // What the tile does when set to act only on a second tap, for a tile
  // that can.
  twice?: string | ((domain: string) => string)
  // What a wide tile adds, after the tap, for a tile with controls.
  controls?: string
  // The features the card picker leaves out, since they only repeat what
  // the tile with no control already does.
  repeats?: string[]
  // The suggestions in place of the ones made from does, controls and the
  // features.
  suggest?: (hass: HomeAssistant, entityId: string) => Suggestion[] | null
}

type Suggestion = { label?: string; config: Record<string, unknown> }

const CARDS: Card[] = [
  {
    type: 'dio-title',
    element: TitleCard,
    domains: null,
    name: 'Diorama Room Title',
    description: 'Section heading that follows the room filter',
  },
  {
    type: 'dio-toggle',
    element: entityCard(TOGGLE_DOMAINS, Toggle, ['confirm']),
    domains: TOGGLE_DOMAINS,
    name: 'Diorama Toggle',
    does: domain => (domain === 'valve' ? 'Tap to open or close' : 'Tap to turn on or off'),
    twice: domain => (domain === 'valve' ? 'Tap twice to open or close' : 'Tap twice to turn on or off'),
    description: 'Light, switch, fan, valve or anything else on or off',
  },
  {
    type: 'dio-button',
    element: entityCard(BUTTON_DOMAINS, Button, ['confirm']),
    domains: BUTTON_DOMAINS,
    name: 'Diorama Button',
    repeats: ['button'],
    does: 'Tap to run it',
    twice: 'Tap twice to run it',
    description: 'Button, script or scene widget',
  },
  {
    type: 'dio-cover',
    element: entityCard<CoverConfig>(COVER_DOMAINS, Cover, ['invert'], true),
    wide: true,
    domains: COVER_DOMAINS,
    name: 'Diorama Cover',
    repeats: ['open-close'],
    does: 'Tap to open or close',
    controls: 'up, stop and down buttons',
    description: 'Blind or screen widget with up, stop and down',
  },
  {
    type: 'dio-vacuum',
    element: entityCard<VacuumConfig>(VACUUM_DOMAINS, Vacuum, ['battery_entity'], true),
    wide: true,
    domains: VACUUM_DOMAINS,
    name: 'Diorama Vacuum',
    repeats: ['commands'],
    does: 'Tap to start or pause',
    controls: 'start, stop and dock buttons',
    description: 'Robot vacuum widget',
  },
  {
    type: 'dio-select',
    element: entityCard<SelectConfig>(SELECT_DOMAINS, Select, ['tap_behavior']),
    domains: SELECT_DOMAINS,
    name: 'Diorama Option List',
    repeats: ['select-options'],
    does: 'Tap for a menu of its options',
    description: 'Option widget with a menu',
  },
  {
    type: 'dio-climate',
    element: entityCard(CLIMATE_DOMAINS, Climate, [], true),
    wide: true,
    domains: CLIMATE_DOMAINS,
    name: 'Diorama Thermostat',
    does: 'Tap for details',
    controls: 'temperature and mode buttons',
    description: 'Thermostat or water heater widget with its temperature and modes',
  },
  {
    type: 'dio-media',
    element: entityCard(MEDIA_DOMAINS, Media, [], true),
    wide: true,
    domains: MEDIA_DOMAINS,
    name: 'Diorama Media Player',
    repeats: ['playback'],
    does: 'Tap to play or pause',
    controls: 'its playback buttons',
    description: 'Speaker or TV widget with play, pause and tracks',
  },
  {
    type: 'dio-lock',
    element: entityCard(LOCK_DOMAINS, Lock),
    name: 'Diorama Lock',
    does: 'Tap to lock or unlock',
    description: 'Lock widget',
    domains: LOCK_DOMAINS,
  },
  {
    type: 'dio-entity',
    element: entityCard('any', Entity),
    domains: 'any',
    name: 'Diorama Any Entity',
    does: 'Its state, tap for details',
    description: 'Any entity, like a sensor, with its state',
  },
  {
    type: 'dio-weather',
    element: WeatherCard,
    domains: WEATHER_DOMAINS,
    name: 'Diorama Weather',
    description: 'The weather now and the next hours',
    suggest: (hass, entityId) => {
      const features = Number(hass.states[entityId]?.attributes.supported_features ?? 0)
      const config = { type: 'custom:dio-weather', entity: entityId }
      const small = { label: 'The weather now, half as wide', config: { ...config, size: 'small' } }
      // A large tile lists the days, under the hours when there are any.
      const sized =
        features & 1
          ? [
              small,
              {
                label:
                  features & 2
                    ? 'The weather now, the next hours and the next days'
                    : 'The weather now and the next days',
                config: { ...config, size: 'large' },
              },
            ]
          : [small]
      // Both forecasts offered, one suggestion each, the hours first.
      if (!(features & 1) || !(features & 2))
        return [{ label: 'The weather now and what comes next', config }, ...sized]
      return [
        { label: 'The weather now and the next hours', config: { ...config, forecast_type: 'hourly' } },
        { label: 'The weather now and the next days', config: { ...config, forecast_type: 'daily' } },
        ...sized,
      ]
    },
  },
  {
    type: 'dio-camera',
    element: CameraCard,
    name: 'Diorama Camera',
    does: 'Its picture, tap to see it bigger',
    description: 'Camera or image picture widget',
    domains: CAMERA_DOMAINS,
  },
  {
    type: 'dio-alarm-panel',
    element: panelCard(['alarm_control_panel'], AlarmPanel, { columns: 'full', rows: 'auto' }, 7),
    extra: true,
    domains: ['alarm_control_panel'],
    name: 'Diorama Alarm Keypad',
    does: 'A button for each mode and a keypad for the code',
    description: 'The alarm with a button for each mode and a keypad for its code',
  },
  {
    type: 'dio-dial',
    element: panelCard(DIAL_DOMAINS, Dial, { columns: 12, rows: 'auto' }, 6),
    extra: true,
    domains: DIAL_DOMAINS,
    name: 'Diorama Big Dial',
    description: 'A thermostat, water heater, humidifier or light on a big ring you drag',
    suggest: (hass, entityId) => {
      const entity = hass.states[entityId]
      const domain = entityId.split('.')[0]
      if (domain === 'light' && !featuresFor(entity).some(feature => feature.id === 'brightness')) return null
      return [{ label: DIAL_NAMES[domain], config: { type: 'custom:dio-dial', entity: entityId } }]
    },
  },
  {
    type: 'dio-media-control',
    element: panelCard<MediaControlConfig>(MEDIA_DOMAINS, MediaControl, { columns: 'full', rows: 'auto' }, 4, ['art']),
    extra: true,
    domains: MEDIA_DOMAINS,
    name: 'Diorama Now Playing',
    description: 'What is playing, with its art, how far in it is, its buttons and volume',
    // Only for a player that plays, pauses, skips or changes its volume,
    // since one that only browses or searches would show next to nothing.
    suggest: (hass, entityId) =>
      !supports(hass.states[entityId], PLAYS)
        ? []
        : [
            {
              label: 'Its art blurred behind it, progress, buttons and volume',
              config: { type: 'custom:dio-media-control', entity: entityId },
            },
            {
              label: 'Its art in place of the icon, progress, buttons and volume',
              config: { type: 'custom:dio-media-control', entity: entityId, art: 'icon' },
            },
          ],
  },
  {
    type: 'dio-calendar',
    element: panelCard<CalendarConfig>(['calendar'], Calendar, { columns: 'full', rows: 7 }, 7, ['calendar']),
    extra: true,
    domains: ['calendar'],
    name: 'Diorama Calendar',
    description: 'The coming events of one calendar or more, day by day',
    suggest: (_, entityId) => [
      { label: 'The coming events, day by day', config: { type: 'custom:dio-calendar', entity: entityId } },
      { label: "Only today's events", config: { type: 'custom:dio-calendar', entity: entityId, days: 1 } },
    ],
  },
  {
    type: 'dio-todo',
    element: panelCard(['todo'], Todo, { columns: 'full', rows: 'auto' }, 5),
    extra: true,
    domains: ['todo'],
    name: 'Diorama To-do List',
    does: 'Add items and tick them off',
    description: 'A list to add to and tick off',
  },
  {
    type: 'dio-graph',
    element: panelCard<GraphConfig>(GRAPH_DOMAINS, Graph, { columns: 12, rows: 4 }, 4, ['graph']),
    extra: true,
    domains: GRAPH_DOMAINS,
    name: 'Diorama History Graph',
    description: 'The history of a reading, or the times something was on',
    suggest: (hass, entityId) => {
      const entity = hass.states[entityId]
      const config = { type: 'custom:dio-graph', entity: entityId }
      const numeric = isNumeric(entity)
      const daily = numeric && typeof entity?.attributes.state_class === 'string'
      return [
        // A strip of on and off needs less height than a line.
        {
          label: 'Its history over the last day',
          config: numeric ? config : { ...config, grid_options: { columns: 12, rows: 3 } },
        },
        ...(daily ? [{ label: 'A bar for each day of the last week', config: { ...config, chart: 'bar' } }] : []),
      ]
    },
  },
  {
    type: 'dio-gauge',
    element: panelCard<GaugeConfig>(GAUGE_DOMAINS, Gauge, { columns: 6, rows: 3 }, 3, ['gauge']),
    extra: true,
    domains: GAUGE_DOMAINS,
    name: 'Diorama Ring Gauge',
    description: 'A reading on a ring',
    suggest: (hass, entityId) =>
      isNumeric(hass.states[entityId])
        ? [{ label: 'Its reading on a ring', config: { type: 'custom:dio-gauge', entity: entityId } }]
        : null,
  },
  {
    type: 'dio-map',
    element: panelCard<MapConfig>(MAP_DOMAINS, MapCard, { columns: 12, rows: 4 }, 4, ['map']),
    extra: true,
    domains: MAP_DOMAINS,
    name: 'Diorama Map',
    description: 'Where a person, a tracker or a zone is',
    suggest: (_, entityId) =>
      [
        ['full', 'The map over the whole card, its name and place on it'],
        ['top', 'The map across the top, its name and place under it'],
      ].map(([layout, label]) => ({
        label,
        config: {
          type: 'custom:dio-map',
          entity: entityId,
          ...(layout === 'full' ? {} : { layout }),
        },
      })),
  },
]

export function registerTiles() {
  registerIcons()
  window.customCards = window.customCards ?? []
  for (const card of CARDS) {
    if (!customElements.get(card.type)) customElements.define(card.type, card.element)
    // The name the tile had before the card was renamed, so a dashboard
    // written then still finds it. It is left out of the card picker.
    const old = card.type.replace(/^dio-/, 'fp-')
    if (!customElements.get(old)) customElements.define(old, class extends card.element {})
    if (!window.customCards.some(c => c.type === card.type))
      window.customCards.push({
        type: card.type,
        name: card.name,
        description: card.description,
        preview: true,
        getEntitySuggestion: (hass, entityId) => suggestions(card, hass, entityId),
      })
  }
}

// The suggestions of a card for an entity picked in Home Assistant's card
// picker: the tile, then wide with its controls for a tile with them, then
// the tile with each control it can show beside its icon, as Home
// Assistant offers its own tile with each of its features. Each is labelled with all the tile does, since the picker shows no
// description.
function suggestions(card: Card, hass: HomeAssistant, entityId: string): Suggestion[] | null {
  if (!shows(card, entityId)) return null
  const type = `custom:${card.type}`
  if (card.suggest) return card.suggest(hass, entityId)
  const config = { type, entity: entityId }
  const domain = entityId.split('.')[0]
  const tap = typeof card.does === 'function' ? card.does(domain) : card.does
  const twice = typeof card.twice === 'function' ? card.twice(domain) : card.twice
  // A tile with controls comes small, with them only when they fit, and
  // wide with them.
  // One that can act only on a second tap comes that way too.
  const base = [
    { label: tap, config },
    ...(twice ? [{ label: twice, config: { ...config, confirm: true } }] : []),
    ...(card.wide ? [{ label: `${tap}, with ${card.controls}`, config: { ...config, size: 'wide' } }] : []),
  ]
  if (card.extra) return base
  const features = featuresFor(hass.states[entityId])
    .filter(feature => !card.repeats?.includes(feature.id))
    .map(feature => {
      const featured = { ...config, feature: feature.id }
      return {
        label:
          feature.suggestion ??
          `${tap}, ${
            (typeof feature.does === 'function' ? feature.does(hass.states[entityId]) : feature.does) ??
            `with ${lowerFirst(feature.label)}`
          }`,
        config: isWide(featured, hass.states[entityId]) ? { ...featured, size: 'wide' } : featured,
      }
    })
  return [...base, ...features]
}

const lowerFirst = (text: string) => text[0].toLowerCase() + text.slice(1)

// Domains whose state alone says nothing, like a calendar's on or off, so
// Diorama Entity is never offered for them.
const SAYS_NOTHING = ['calendar']

// Whether a card is the one to offer for an entity picked in Home
// Assistant's card picker. Diorama Entity is offered only for an entity
// no other tile is made for, like a sensor.
function shows(card: Card, entityId: string) {
  const domain = entityId.split('.')[0]
  if (card.domains === 'any' && SAYS_NOTHING.includes(domain)) return false
  if (card.domains === 'any')
    return !CARDS.some(other => !other.extra && Array.isArray(other.domains) && other.domains.includes(domain))
  return !!card.domains?.includes(domain)
}

export type TileOption = { name: string; label?: string; config: Record<string, unknown> }

// Every card of ours an entity can be shown as in the side panel, with
// each way each one can be set up, the card made for its domain first.
// Diorama Entity is offered for any entity, as its state.
export function tileOptions(hass: HomeAssistant, entityId: string): TileOption[] {
  const domain = entityId.split('.')[0]
  const fits = (card: Card) =>
    card.domains === 'any' ? !SAYS_NOTHING.includes(domain) : !!card.domains?.includes(domain)
  const made = (card: Card) => !card.extra && Array.isArray(card.domains) && card.domains.includes(domain)
  const ranked = [...CARDS.filter(made), ...CARDS.filter(card => fits(card) && !made(card))]
  return ranked.flatMap(card => {
    const name = card.name.replace(/^Diorama (Any )?/, '')
    const own =
      card.domains === 'any' && !shows(card, entityId)
        ? [{ label: typeof card.does === 'function' ? card.does(domain) : card.does, config: { type: `custom:${card.type}`, entity: entityId } }]
        : (suggestions(card, hass, entityId) ?? [])
    return own.map(suggestion => ({ name, label: suggestion.label, config: suggestion.config }))
  })
}
