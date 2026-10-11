import { cn } from '#/lib/utils.ts'
import type { AutoCard } from '#/tiles/auto.ts'
import { Icon } from '#/tiles/Icon.tsx'
import { tileOptions, type TileOption } from '#/tiles/index.tsx'
import { GAP_PX, ROW_PX, span } from '#/tiles/sidePanel.ts'
import type { HomeAssistant, TileChoice } from '#/types.ts'
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useRef } from 'react'

// The fewest and the most rows a card across the whole panel can be made.
const MIN_ROWS = 1
const MAX_ROWS = 16

// What tells two setups of a card apart: everything in its config but the
// entity, what the panel adds to every tile, and the rows it was made taller
// or shorter by, which leave it the same card.
const PANEL_KEYS = new Set(['entity', 'room_filter', 'never_hide', 'piece_icon', 'invert'])
function setupKey(config: Record<string, unknown>) {
  const { rows: _, ...grid } = (config.grid_options ?? {}) as Record<string, unknown>
  const entries = Object.entries({ ...config, grid_options: Object.keys(grid).length > 0 ? grid : undefined }).filter(
    ([key, value]) => !PANEL_KEYS.has(key) && value !== undefined,
  )
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)))
}

// The rows a card was set to, apart from the ones it takes by itself.
const setRows = (config: Record<string, unknown> | undefined) => {
  const rows = (config?.grid_options as { rows?: unknown } | undefined)?.rows
  return typeof rows === 'number' ? rows : undefined
}

// A card's setup with its rows set, or left to the card when they are what
// it takes anyway.
function withRows(config: Record<string, unknown>, rows: number | undefined, own: number | 'auto') {
  const { rows: _, ...grid } = (config.grid_options ?? {}) as Record<string, unknown>
  const next = rows === undefined || rows === own ? grid : { ...grid, rows }
  const { grid_options: __, ...rest } = config
  return Object.keys(next).length > 0 ? { ...rest, grid_options: next } : rest
}

type Choices = { options: TileOption[]; auto: string; current: string }

// The ways an entity's tile can be shown, with the one the panel picks for
// its domain among them, and which of them it shows now.
function choices(hass: HomeAssistant, auto: AutoCard, chosen: TileChoice | undefined): Choices {
  const entityId = String(auto.entity)
  const options = tileOptions(hass, entityId)
  const autoKey = setupKey(auto)
  if (!options.some(option => setupKey(option.config) === autoKey))
    options.unshift({ name: auto.type.replace(/^custom:fp-/, ''), config: auto })
  return { options, auto: autoKey, current: chosen ? setupKey(chosen) : autoKey }
}

// The name of the card an entity's tile is now, for its row in the list.
export function tileName(hass: HomeAssistant, auto: AutoCard, chosen: TileChoice | undefined) {
  const { options, current } = choices(hass, auto, chosen)
  return options.find(option => setupKey(option.config) === current)?.name ?? (chosen ?? auto).type
}

// Every card of ours the entity can be, each shown as it would be in the
// panel, at the size it takes there, with its name and what it does under
// it. The one it is now has a tick in its corner. Picking the one the
// panel would pick anyway leaves the choice out of the YAML.
// A card across the whole panel has a minus and a plus beside its name,
// that make it a row shorter or taller, picking it as they do. A card that
// takes the height of what is in it starts from the rows it has now.
export function TilePicker({
  hass,
  auto,
  chosen,
  onChoose,
}: {
  hass: HomeAssistant
  auto: AutoCard
  chosen: TileChoice | undefined
  // Stays open when the rows change, so the card can be sized further.
  onChoose: (choice: TileChoice | undefined, stay?: boolean) => void
}) {
  const { options, auto: autoKey, current } = choices(hass, auto, chosen)
  return (
    <div
      role="radiogroup"
      aria-label="Card"
      className="grid grid-cols-12 items-start"
      style={{ gap: `18px ${GAP_PX}px` }}
    >
      {options.map(option => {
        const key = setupKey(option.config)
        const picked = key === current
        // Shown as the panel would show it, with the piece's icon kept, and
        // the rows it was set to when it is the one picked.
        const { type: _, size: __, ...kept } = auto
        const plain: AutoCard = { ...kept, ...option.config, type: String(option.config.type), entity: auto.entity }
        const own = span(plain, hass).rows
        const shown = (picked ? withRows(plain, setRows(chosen), own) : plain) as AutoCard
        const { columns, rows } = span(shown, hass)
        const pick = (config: Record<string, unknown>, stay?: boolean) => {
          const { entity: _, ...choice } = config
          if (setupKey(config) === autoKey && setRows(config) === undefined) return onChoose(undefined, stay)
          onChoose(choice as TileChoice, stay)
        }
        return (
          <Option
            key={key}
            option={option}
            picked={picked}
            isAuto={key === autoKey}
            columns={columns}
            rows={rows}
            shown={shown}
            hass={hass}
            onPick={() => pick(option.config)}
            onRows={columns === 12 ? next => pick(withRows(option.config, next, own), true) : undefined}
          />
        )
      })}
    </div>
  )
}

function Option({
  option,
  picked,
  isAuto,
  columns,
  rows,
  shown,
  hass,
  onPick,
  onRows,
}: {
  option: TileOption
  picked: boolean
  isAuto: boolean
  columns: number
  rows: number | 'auto'
  shown: AutoCard
  hass: HomeAssistant
  onPick: () => void
  onRows?: (rows: number) => void
}) {
  const preview = useRef<HTMLSpanElement>(null)
  // The rows the card stands in now, worked out from its height when it
  // takes the height of what is in it.
  const now = () => {
    if (rows !== 'auto') return rows
    const height = preview.current?.getBoundingClientRect().height ?? ROW_PX
    return Math.max(MIN_ROWS, Math.round((height + GAP_PX) / (ROW_PX + GAP_PX)))
  }
  const step = (by: number) => onRows?.(Math.min(MAX_ROWS, Math.max(MIN_ROWS, now() + by)))
  const stepper =
    'bg-fill-strong text-label-2 flex size-7 cursor-pointer items-center justify-center rounded-full transition-[color,transform] hover:text-(--primary-text-color) active:scale-95 disabled:cursor-default disabled:opacity-40'
  return (
    <div className="relative flex min-w-0 flex-col" style={{ gridColumn: `span ${columns}` }}>
      <button
        type="button"
        role="radio"
        aria-checked={picked}
        aria-label={option.label ? `${option.name}, ${option.label}` : option.name}
        onClick={onPick}
        className="group flex min-w-0 cursor-pointer flex-col gap-1.5 text-left outline-none"
      >
        <span
          ref={preview}
          className="relative block transition-[transform,opacity] group-hover:opacity-85 group-focus-visible:opacity-85 group-active:scale-[0.98]"
        >
          <TilePreview hass={hass} config={shown} height={rows === 'auto' ? undefined : rows} />
          {picked && (
            <span className="bg-tint-fill absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full text-white shadow-[0_0_0_3px_var(--fp-surface,var(--card-background-color))]">
              <Icon icon="ph:check-bold" className="size-3.5 [--mdc-icon-size:14px] [&>svg]:size-full" />
            </span>
          )}
        </span>
        <span className={cn('flex min-w-0 flex-col px-1', onRows && 'pr-[72px]')}>
          <span className={cn('flex items-center gap-1.5 text-xs font-semibold', picked && 'text-tint')}>
            {option.name}
            {isAuto && (
              <span className="bg-fill-strong text-label-2 rounded px-1 py-px text-[10px] font-medium">Auto</span>
            )}
          </span>
          {option.label && <span className="text-label-2 line-clamp-2 text-[11px] leading-snug">{option.label}</span>}
        </span>
      </button>
      {onRows && (
        <span className="absolute right-0 bottom-0 flex gap-1.5">
          <button
            type="button"
            aria-label={`${option.name} a row shorter`}
            onClick={() => step(-1)}
            disabled={rows !== 'auto' && rows <= MIN_ROWS}
            className={stepper}
          >
            <FontAwesomeIcon icon={faMinus} className="size-3" />
          </button>
          <button
            type="button"
            aria-label={`${option.name} a row taller`}
            onClick={() => step(1)}
            disabled={rows !== 'auto' && rows >= MAX_ROWS}
            className={stepper}
          >
            <FontAwesomeIcon icon={faPlus} className="size-3" />
          </button>
        </span>
      )}
    </div>
  )
}

type Card = HTMLElement & { setConfig: (config: unknown) => void; hass: HomeAssistant; preview: boolean }

// One of our cards, live with the entity's state but out of reach, so a
// press on it picks it rather than working it.
function TilePreview({
  hass,
  config,
  height,
}: {
  hass: HomeAssistant
  config: Record<string, unknown>
  height?: number
}) {
  const holder = useRef<HTMLSpanElement>(null)
  const card = useRef<Card | null>(null)
  const setup = JSON.stringify(config)

  useEffect(() => {
    const type = String(config.type).replace(/^custom:/, '')
    const element = document.createElement(type) as Card
    try {
      element.setConfig(config)
    } catch {
      return
    }
    element.preview = true
    element.hass = hass
    element.style.display = 'block'
    element.style.height = '100%'
    card.current = element
    holder.current!.replaceChildren(element)
    return () => {
      card.current = null
      element.remove()
    }
    // The card is made again only when its setup changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup])

  useEffect(() => {
    if (card.current) card.current.hass = hass
  }, [hass])

  return (
    <span
      ref={holder}
      inert
      className="pointer-events-none block"
      style={height ? { height: `calc(${height * ROW_PX}px + ${height - 1} * ${GAP_PX}px)` } : undefined}
    />
  )
}
