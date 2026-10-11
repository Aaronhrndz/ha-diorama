import { cn } from '#/lib/utils.ts'
import type { AutoCard } from '#/tiles/auto.ts'
import { tileOptions, type TileOption } from '#/tiles/index.tsx'
import { GAP_PX, ROW_PX, span } from '#/tiles/sidePanel.ts'
import type { HomeAssistant, TileChoice } from '#/types.ts'
import { useEffect, useRef } from 'react'

// What tells two setups of a card apart: everything in its config but the
// entity and what the panel adds to every tile.
const PANEL_KEYS = new Set(['entity', 'room_filter', 'piece_icon', 'invert'])
function setupKey(config: Record<string, unknown>) {
  const entries = Object.entries(config).filter(([key]) => !PANEL_KEYS.has(key))
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)))
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
// it. The one it is now is ringed. Picking the one the panel would pick
// anyway leaves the choice out of the YAML.
export function TilePicker({
  hass,
  auto,
  chosen,
  onChoose,
}: {
  hass: HomeAssistant
  auto: AutoCard
  chosen: TileChoice | undefined
  onChoose: (choice: TileChoice | undefined) => void
}) {
  const { options, auto: autoKey, current } = choices(hass, auto, chosen)
  return (
    <div
      role="radiogroup"
      aria-label="Card"
      className="grid grid-cols-12 items-start pt-1 pb-2"
      style={{ gap: `14px ${GAP_PX}px` }}
    >
      {options.map(option => {
        const key = setupKey(option.config)
        const picked = key === current
        // Shown as the panel would show it, with the piece's icon kept.
        const { type: _, size: __, ...kept } = auto
        const shown: AutoCard = { ...kept, ...option.config, type: String(option.config.type), entity: auto.entity }
        const { columns, rows } = span(shown, hass)
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={picked}
            aria-label={option.label ? `${option.name}, ${option.label}` : option.name}
            onClick={() => {
              if (key === autoKey) return onChoose(undefined)
              const { entity: _, ...choice } = option.config
              onChoose(choice as TileChoice)
            }}
            className="group flex min-w-0 cursor-pointer flex-col gap-1.5 text-left"
            style={{ gridColumn: `span ${columns}` }}
          >
            <span
              className={cn(
                'block rounded-[18px] ring-offset-2 ring-offset-(--card-background-color) transition-[box-shadow,transform] group-active:scale-[0.98]',
                picked ? 'ring-tint ring-[2.5px]' : 'group-hover:ring-separator group-hover:ring-2',
              )}
            >
              <TilePreview hass={hass} config={shown} height={rows === 'auto' ? undefined : rows} />
            </span>
            <span className="flex min-w-0 flex-col px-0.5">
              <span className={cn('flex items-center gap-1.5 text-xs font-semibold', picked && 'text-tint')}>
                {option.name}
                {key === autoKey && (
                  <span className="bg-fill-strong text-label-2 rounded px-1 py-px text-[10px] font-medium">Auto</span>
                )}
              </span>
              {option.label && (
                <span className="text-label-2 line-clamp-2 text-[11px] leading-snug">{option.label}</span>
              )}
            </span>
          </button>
        )
      })}
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
