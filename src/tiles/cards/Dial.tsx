import { callService, formatState, haptic, type TileEnv } from '#/tiles/actions.ts'
import { Control } from '#/tiles/Control.tsx'
import { HvacModes, MENUS, ModeMenu } from '#/tiles/features/climate.tsx'
import { formatDegrees, listOf, numberOf, optionWord } from '#/tiles/features/parts.tsx'
import { insideTile } from '#/tiles/gestures.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { climateColor } from '#/tiles/modes.ts'
import { Panel } from '#/tiles/Panel.tsx'
import { kelvinToRgb } from '#/signals.ts'
import type { EntityState, HomeAssistant } from '#/types.ts'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

// The ring sweeps three quarters of a circle, open at the bottom, starting
// from the bottom left.
const SWEEP = 270
const START = 135
const RADIUS = 84
const LENGTH = (2 * Math.PI * RADIUS * SWEEP) / 360
// How long the minus and plus wait for another press before they send.
const SEND_MS = 700
// How long a value that was sent shows if Home Assistant never takes it.
const HOLD_MS = 5000

// What the ring of one entity sets: its values, one or the two ends of a
// range, their bounds, and how to send new ones.
type Model = {
  values: number[]
  min: number
  max: number
  step: number
  color: string
  // Above the value, like Heat to.
  label: string
  // Under it, like what the room is at now.
  now?: string
  // What the room is at now, where the paler stretch starts.
  current?: number
  format: (value: number) => string
  send: (values: number[]) => void
  // Off, the ring is dim and drags nothing.
  off?: boolean
}

function model(hass: HomeAssistant, entity: EntityState): Model | null {
  const domain = entity.entity_id.split('.')[0]
  const target = { entity_id: entity.entity_id }
  if (domain === 'light') {
    const brightness = numberOf(entity, 'brightness')
    const on = entity.state === 'on'
    const rgb = entity.attributes.rgb_color
    const kelvin = numberOf(entity, 'color_temp_kelvin')
    const color = Array.isArray(rgb)
      ? `rgb(${rgb.join(',')})`
      : kelvin
        ? `rgb(${kelvinToRgb(kelvin)
            .map(c => Math.round(c * 255))
            .join(',')})`
        : 'var(--_accent-light)'
    return {
      values: [on && brightness !== null ? Math.max(1, Math.round((brightness / 255) * 100)) : 0],
      min: 0,
      max: 100,
      step: 1,
      color,
      label: 'Brightness',
      format: value => (value > 0 ? `${Math.round(value)}%` : 'Off'),
      send: ([value]) =>
        callService(
          hass,
          value > 0 ? 'light.turn_on' : 'light.turn_off',
          value > 0 ? { ...target, brightness_pct: value } : target,
        ),
    }
  }
  if (domain === 'humidifier') {
    const humidity = numberOf(entity, 'humidity')
    if (humidity === null) return null
    const current = numberOf(entity, 'current_humidity')
    return {
      values: [humidity],
      min: numberOf(entity, 'min_humidity') ?? 0,
      max: numberOf(entity, 'max_humidity') ?? 100,
      step: 1,
      color: 'var(--_accent-cool)',
      label:
        entity.state === 'on'
          ? optionWord(
              hass,
              entity,
              String(entity.attributes.action ?? 'on'),
              entity.attributes.action ? 'action' : undefined,
            )
          : 'Off',
      now: current !== null ? `Now ${Math.round(current)}%` : undefined,
      current: current ?? undefined,
      format: value => `${Math.round(value)}%`,
      send: ([value]) => callService(hass, 'humidifier.set_humidity', { ...target, humidity: value }),
      off: entity.state !== 'on',
    }
  }
  const temperature = numberOf(entity, 'temperature')
  const low = numberOf(entity, 'target_temp_low')
  const high = numberOf(entity, 'target_temp_high')
  const range = temperature === null && low !== null && high !== null
  if (temperature === null && !range) return null
  const current = numberOf(entity, 'current_temperature')
  const action = typeof entity.attributes.hvac_action === 'string' ? entity.attributes.hvac_action : null
  const mode = entity.state
  return {
    values: range ? [low, high] : [temperature!],
    min: numberOf(entity, 'min_temp') ?? 7,
    max: numberOf(entity, 'max_temp') ?? 35,
    step: numberOf(entity, 'target_temp_step') ?? (domain === 'water_heater' ? 1 : 0.5),
    color:
      domain === 'water_heater'
        ? 'var(--_accent-climate)'
        : (climateColor(mode, action) ?? (mode === 'off' ? 'currentColor' : 'var(--_accent-climate)')),
    label: action
      ? optionWord(hass, entity, action, 'hvac_action')
      : mode === 'off'
        ? 'Off'
        : formatState(hass, entity),
    now: current !== null ? `Now ${formatDegrees(hass, current)}` : undefined,
    current: current ?? undefined,
    format: value => formatDegrees(hass, value),
    send: values =>
      callService(
        hass,
        `${domain}.set_temperature`,
        range
          ? { ...target, target_temp_low: values[0], target_temp_high: values[1] }
          : { ...target, temperature: values[0] },
      ),
    off: mode === 'off',
  }
}

// A value's place along the ring, from 0 at its start to 1 at its end.
const shareOf = (m: Model, value: number) => Math.min(Math.max((value - m.min) / (m.max - m.min || 1), 0), 1)
const point = (share: number) => {
  const angle = ((START + share * SWEEP) * Math.PI) / 180
  return { x: 100 + RADIUS * Math.cos(angle), y: 100 + RADIUS * Math.sin(angle) }
}

// The arc along the ring from one place to another, either way round.
function arc(from: number, to: number) {
  const a = point(from)
  const b = point(to)
  const large = Math.abs(to - from) * SWEEP > 180 ? 1 : 0
  return `M${a.x} ${a.y}A${RADIUS} ${RADIUS} 0 ${large} ${to > from ? 1 : 0} ${b.x} ${b.y}`
}

// How far apart the arrows along that stretch are, and how far from its
// start and from the knob they stay, along the ring.
const ARROW_GAP = 13
const ARROW_CLEAR = 10

// Arrows along the stretch from one place to another, each pointing the
// way it goes.
function arrows(from: number, to: number) {
  const length = Math.abs(to - from) * LENGTH - 2 * ARROW_CLEAR
  const count = Math.max(1, Math.floor(length / ARROW_GAP) + 1)
  const way = to > from ? 1 : -1
  return Array.from({ length: count }, (_, i) => {
    const along = count === 1 ? Math.abs(to - from) / 2 : (ARROW_CLEAR + (i * length) / (count - 1)) / LENGTH
    const share = from + way * along
    const angle = START + share * SWEEP + way * 90
    return { ...point(share), angle }
  })
}

// Where the room is now and the end it is heading for, while it is on and
// not there yet: below a range it heads for its low end, above it for its
// high end, and inside it for nowhere.
function heading(m: Model, values: number[]) {
  if (m.off || m.current === undefined) return null
  const target =
    values.length === 2 ? (m.current < values[0] ? values[0] : m.current > values[1] ? values[1] : null) : values[0]
  if (target === null || Math.abs(target - m.current) < m.step / 2) return null
  return { from: shareOf(m, m.current), to: shareOf(m, target) }
}

// The values sent, shown until Home Assistant reports them back.
function useHeldValues(reported: number[]) {
  const [held, setHeld] = useState<number[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const key = reported.join(',')
  useEffect(() => {
    if (held && held.join(',') === key) setHeld(null)
  }, [held, key])
  const hold = (values: number[]) => {
    setHeld(values)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setHeld(null), HOLD_MS)
  }
  return [held ?? reported, hold] as const
}

// A thermostat, a water heater, a humidifier or a light on a big ring: drag the ring's knob, or press minus and plus, to set the
// temperature, the humidity or the brightness it holds. The ring fills in
// the color of what it is doing, like orange to heat. While the room is
// on its way to the knob, the stretch from where it is now to the knob is
// paler, with arrows along it that point at the
// knob and light up one after another toward it. The ring sits in the
// bottom right corner across from the name with minus and plus stacked on
// its left, and the modes in the top right.
export default function Dial({ env, config }: { env: TileEnv; config: TileConfig }) {
  const entity = env.hass.states[config.entity!]
  const m = entity ? model(env.hass, entity) : null
  const [values, hold] = useHeldValues(m?.values ?? [])
  const [active, setActive] = useState(0)
  const [dragging, setDragging] = useState(false)
  const send = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(send.current), [])
  const domain = config.entity!.split('.')[0]

  // The modes or the menus in the top right corner. A light and a
  // humidifier turn on and off with a tap, like their tiles.
  const controls = !entity
    ? null
    : domain === 'climate'
      ? listOf(entity, 'hvac_modes').length > 0 && <HvacModes env={env} config={config} entity={entity} />
      : domain === 'water_heater'
        ? listOf(entity, 'operation_list').length > 0 && (
            <ModeMenu env={env} config={config} entity={entity} menu={MENUS['operation-modes']} />
          )
        : domain === 'humidifier' &&
          listOf(entity, 'available_modes').length > 0 && (
            <ModeMenu env={env} config={config} entity={entity} menu={MENUS.modes} />
          )
  const toggles = domain === 'light' || domain === 'humidifier'
  const on = !!entity && !['off', 'unavailable', 'unknown'].includes(entity.state)
  const panel = {
    env,
    config,
    entity,
    state: formatState(env.hass, entity),
    controls,
    toggles,
    active: on,
    accent: m?.color,
    glow: on && m && m.color !== 'currentColor' ? m.color : undefined,
    glowFrom: domain === 'light' ? ('corner' as const) : ('top' as const),
    onTap: toggles
      ? () =>
          callService(env.hass, `${domain}.${on ? 'turn_off' : 'turn_on'}`, {
            entity_id: config.entity,
          })
      : undefined,
    className: 'fp-big-dial',
  }

  if (!entity || !m) return <Panel {...panel} />

  const snap = (value: number) =>
    Math.min(m.max, Math.max(m.min, Math.round((value - m.min) / m.step) * m.step + m.min))
  // Each end of a range stays on its own side of the other.
  const place = (index: number, value: number) => {
    const next = [...values]
    next[index] = snap(value)
    if (next.length === 2) {
      if (index === 0) next[0] = Math.min(next[0], next[1])
      else next[1] = Math.max(next[1], next[0])
    }
    return next
  }
  const commit = (next: number[], wait: number) => {
    hold(next)
    clearTimeout(send.current)
    send.current = setTimeout(() => m.send(next), wait)
  }

  const valueAt = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * 200 - 100
    const y = ((e.clientY - box.top) / box.height) * 200 - 100
    let along = ((Math.atan2(y, x) * 180) / Math.PI - START + 720) % 360
    // Past either end, in the gap at the bottom, it holds at the nearer end.
    if (along > SWEEP) along = along > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP
    return m.min + (along / SWEEP) * (m.max - m.min)
  }
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (m.off && domain !== 'light') return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const value = valueAt(e)
    const index = values.length === 2 ? (Math.abs(value - values[0]) <= Math.abs(value - values[1]) ? 0 : 1) : 0
    setActive(index)
    setDragging(true)
    haptic('selection')
    hold(place(index, value))
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    const next = place(active, valueAt(e))
    if (next.join(',') !== values.join(',')) {
      if (next[active] === m.min || next[active] === m.max) haptic('selection')
      hold(next)
    }
  }
  const onPointerUp = () => {
    if (!dragging) return
    setDragging(false)
    commit(values, 0)
  }
  const nudge = (by: number) => () => commit(place(active, values[active] + by * m.step), SEND_MS)

  // As wide as the longest value it can show, so the number stays still
  // while it goes from 21° to 21.5°. A digit is about a ch wide, and a
  // point or a sign about half of one.
  const width = (text: string) => [...text].reduce((sum, char) => sum + (/\d/.test(char) ? 1 : 0.55), 0)
  const widest = Math.max(...[m.min, m.max, m.min + m.step, m.max - m.step].map(value => width(m.format(snap(value)))))
  const toward = heading(m, values)
  const first = shareOf(m, values.length === 2 ? values[0] : m.min)
  // A single value fills only as far as the room is, or the value when the
  // room is past it, and the rest of the way is the stretch it is heading
  // along.
  const last = values.length === 1 && toward ? Math.min(toward.from, toward.to) : shareOf(m, values[values.length - 1])
  return (
    <Panel {...panel}>
      <div
        className="fp-dial"
        data-off={m.off || undefined}
        data-dragging={dragging || undefined}
        data-range={values.length === 2 || undefined}
        style={{ '--_dial': m.color, '--_digits': `${widest}ch` } as CSSProperties}
      >
        <div className="fp-dial-buttons">
          <Control icon="ph:plus-bold" label="Raise" onPress={nudge(1)} />
          <Control icon="ph:minus-bold" label="Lower" onPress={nudge(-1)} />
        </div>
        <div className="fp-dial-face">
          <svg
            {...insideTile}
            viewBox="0 0 200 200"
            className="fp-dial-ring"
            role="slider"
            tabIndex={0}
            aria-label={m.label}
            aria-valuemin={m.min}
            aria-valuemax={m.max}
            aria-valuenow={values[active]}
            aria-valuetext={m.format(values[active])}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={e => {
              const by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
              if (!by) return
              e.preventDefault()
              e.stopPropagation()
              nudge(by)()
            }}
          >
            <g transform={`rotate(${START} 100 100)`}>
              <circle className="fp-dial-track" cx="100" cy="100" r={RADIUS} strokeDasharray={`${LENGTH} 999`} />
            </g>
            {toward && <path className="fp-dial-toward" d={arc(toward.from, toward.to)} />}
            <g transform={`rotate(${START} 100 100)`}>
              <circle
                className="fp-dial-fill"
                cx="100"
                cy="100"
                r={RADIUS}
                strokeDasharray={`${Math.max(LENGTH * (last - first), 0.01)} 999`}
                strokeDashoffset={-LENGTH * first}
              />
            </g>
            {toward &&
              arrows(toward.from, toward.to).map((arrow, i) => (
                <path
                  key={i}
                  className="fp-dial-arrow"
                  d="M-2.5 -4L2 0L-2.5 4"
                  transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
                  style={{ '--_i': i } as CSSProperties}
                />
              ))}
            {values.map((value, i) => {
              const at = point(shareOf(m, value))
              return (
                <circle
                  key={i}
                  className="fp-dial-knob"
                  data-active={i === active || undefined}
                  cx={at.x}
                  cy={at.y}
                  r="11"
                />
              )
            })}
          </svg>
          <div className="fp-dial-center">
            <div className="fp-dial-label">{m.label}</div>
            <div className="fp-dial-value">
              {values.length === 2 ? (
                values.map((value, i) => (
                  <button
                    {...insideTile}
                    key={i}
                    type="button"
                    className="fp-dial-end"
                    aria-pressed={i === active}
                    onClick={e => {
                      e.stopPropagation()
                      setActive(i)
                    }}
                  >
                    {m.format(value)}
                  </button>
                ))
              ) : (
                <span>{m.format(values[0])}</span>
              )}
            </div>
            {m.now && <div className="fp-dial-now">{m.now}</div>}
          </div>
        </div>
      </div>
    </Panel>
  )
}
