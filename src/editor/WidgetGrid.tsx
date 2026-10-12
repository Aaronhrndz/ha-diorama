import { entityName } from '#/devices/catalog.ts'
import { choiceFor, choices, setRows, setupKey, TilePreview, withRows } from '#/editor/TilePicker.tsx'
import { cn } from '#/lib/utils.ts'
import { chosen, type AutoCard } from '#/tiles/auto.ts'
import { GAP_PX, ROW_PX, span } from '#/tiles/sidePanel.ts'
import type { HomeAssistant, TileChoice, TileChoices } from '#/types.ts'
import { faEye, faPen, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { motion, useDragControls } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'

// The most rows a card across the whole panel can be made, as in the picker.
const MAX_ROWS = 12

export type Widget = {
  id: string
  // The tile the panel makes for the entity, before any card is chosen.
  auto: AutoCard
  // Takes the entity out of the list, for one added by hand.
  onRemove?: () => void
  // Leaves a device on the plan out of the panel.
  onHide?: () => void
}

type Props = {
  hass: HomeAssistant
  widgets: Widget[]
  tiles: TileChoices | undefined
  // The new order of the widgets, as entity ids.
  onReorder: (ids: string[]) => void
  // The card an entity's tile is now, none for the one the panel picks.
  onSize: (id: string, choice: TileChoice | undefined) => void
  // Opens the page to pick another card for the entity.
  onEdit: (id: string) => void
}

// A setup of the card the tile is now, at its own size in the panel.
type Fit = { columns: number; config: Record<string, unknown>; own: number | 'auto' }

// The widgets of a room or of the home, live, as the side panel lays them
// out. Each is dragged into place, the others making room for it, and the
// arrow keys move the one in focus. The pen in its top left corner opens
// the page to pick its card. The cross in the other takes away an entity
// added by hand, and the eye hides a device on the plan from the panel or
// shows it again. The grip in its bottom right corner makes it wider or
// narrower, between the setups of its card that differ only in width or
// stretched across the whole width, and taller or shorter while it takes
// the whole width.
export function WidgetGrid({ hass, widgets, tiles, onReorder, onSize, onEdit }: Props) {
  const ids = widgets.map(widget => widget.id)
  const byId = new Map(widgets.map(widget => [widget.id, widget]))
  // The order while a widget is dragged, and the card a widget is being
  // resized to, each kept until the order or the cards that come back
  // differ from the ones they were made over.
  const idsKey = ids.join()
  const tilesKey = JSON.stringify(tiles ?? {})
  const [dragged, setOrder] = useState<{ over: string; ids: string[] } | null>(null)
  const [resized, setSizing] = useState<{ over: string; id: string; choice: TileChoice | undefined } | null>(null)
  const order = dragged?.over === idsKey ? dragged.ids : null
  const sizing = resized?.over === tilesKey ? resized : null
  const [held, setHeld] = useState<string | null>(null)
  const cells = useRef(new Map<string, HTMLDivElement>())
  const grid = useRef<HTMLDivElement>(null)
  // The widget the dragged one last swapped places with, not swapped with
  // again until the pointer leaves it, so two of different sizes do not
  // keep trading places under it.
  const swapped = useRef<string | null>(null)
  const shown = order ?? ids
  // The order during a drag, for its handlers, which keep the ones from
  // when it started.
  const now = useRef<string[]>([])

  const drag = (id: string, x: number, y: number) => {
    const shown = now.current
    // Where each widget is laid out, not where it is on its way there, so
    // one still sliding out of the way is not swapped back.
    const origin = grid.current!.getBoundingClientRect()
    const target = shown.find(other => {
      const box = cells.current.get(other)
      if (other === id || !box) return false
      const left = origin.left + box.offsetLeft
      const top = origin.top + box.offsetTop
      return x >= left && x <= left + box.offsetWidth && y >= top && y <= top + box.offsetHeight
    })
    if (target === swapped.current) return
    swapped.current = target ?? null
    if (!target) return
    const next = shown.filter(other => other !== id)
    next.splice(shown.indexOf(target), 0, id)
    now.current = next
    setOrder({ over: idsKey, ids: next })
  }

  const drop = () => {
    const shown = now.current
    swapped.current = null
    setHeld(null)
    if (shown.some((id, i) => id !== ids[i])) onReorder(shown)
    else setOrder(null)
  }

  const nudge = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.target !== event.currentTarget) return
    const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]
    const from = shown.indexOf(id)
    if (!by || from + by < 0 || from + by >= shown.length) return
    event.preventDefault()
    const next = [...shown]
    next.splice(from, 1)
    next.splice(from + by, 0, id)
    onReorder(next)
  }

  return (
    <div ref={grid} className="relative grid grid-cols-12" style={{ gap: GAP_PX }}>
      {shown.map((id, index) => {
        const widget = byId.get(id)!
        const choice = sizing?.id === id ? sizing.choice : tiles?.[id]
        const name = entityName(hass, id)
        return (
          <Cell
            key={id}
            hass={hass}
            widget={widget}
            choice={choice}
            saved={tiles?.[id]}
            name={name}
            label={`${name}, ${index + 1} of ${shown.length}`}
            held={held === id}
            grid={grid}
            cell={element => {
              if (element) cells.current.set(id, element)
              else cells.current.delete(id)
            }}
            onGrab={() => {
              now.current = shown
              setHeld(id)
            }}
            onDrag={(x, y) => drag(id, x, y)}
            onDrop={drop}
            onKey={event => nudge(event, id)}
            onSizing={next => setSizing({ over: tilesKey, id, choice: next })}
            onSized={next => {
              if (setupKey(next ?? widget.auto) === setupKey(tiles?.[id] ?? widget.auto) && setRows(next) === setRows(tiles?.[id]))
                setSizing(null)
              else onSize(id, next)
            }}
            onEdit={() => onEdit(id)}
          />
        )
      })}
    </div>
  )
}

function Cell({
  hass,
  widget,
  choice,
  saved,
  name,
  label,
  held,
  grid,
  cell,
  onGrab,
  onDrag,
  onDrop,
  onKey,
  onSizing,
  onSized,
  onEdit,
}: {
  hass: HomeAssistant
  widget: Widget
  // The card shown, which differs from the saved one while it is resized.
  choice: TileChoice | undefined
  saved: TileChoice | undefined
  name: string
  label: string
  held: boolean
  grid: RefObject<HTMLDivElement | null>
  cell: (element: HTMLDivElement | null) => void
  onGrab: () => void
  onDrag: (x: number, y: number) => void
  onDrop: () => void
  onKey: (event: KeyboardEvent<HTMLDivElement>) => void
  onSizing: (choice: TileChoice | undefined) => void
  onSized: (choice: TileChoice | undefined) => void
  onEdit: () => void
}) {
  const { auto } = widget
  const config = chosen(auto, { [widget.id]: choice } as TileChoices)
  const { columns, rows } = span(config, hass)

  // The setups of the card it is now that differ only in width, one for
  // each width, the one it is now kept for its own width.
  const { options, auto: autoKey } = choices(hass, auto, saved)
  const current = unstretched(saved ?? auto)
  const savedKey = setupKey(current)
  const { type: _, size: __, ...kept } = auto
  const fitOf = (config: Record<string, unknown>): Fit => {
    const plain = { ...kept, ...config, type: String(config.type), entity: auto.entity }
    const { columns, rows } = span(plain, hass)
    return { columns, config, own: rows }
  }
  const fits = new Map<number, Fit>()
  for (const option of options) {
    if (option.config.type !== current.type) continue
    const fit = fitOf(option.config)
    if (!fits.has(fit.columns) || setupKey(option.config) === savedKey) fits.set(fit.columns, fit)
  }
  // A card with no setup across the whole width can be stretched across it.
  const narrow = [...fits.values()].find(fit => setupKey(fit.config) === savedKey)
  if (narrow && !fits.has(12)) {
    const grid = (narrow.config.grid_options ?? {}) as Record<string, unknown>
    fits.set(12, fitOf({ ...narrow.config, grid_options: { ...grid, columns: 12 } }))
  }

  // The rows the card takes by itself, measured from a copy of it at its
  // own height when it takes the height of what is in it.
  const wide = fits.get(12)
  const measure = useRef<HTMLSpanElement>(null)
  const [natural, setNatural] = useState<number | null>(null)
  const measuring = wide?.own === 'auto'
  useEffect(() => {
    const target = measure.current
    if (!measuring || !target) return
    const observer = new ResizeObserver(() => {
      const height = target.getBoundingClientRect().height
      if (height > 0) setNatural(Math.max(1, Math.round((height + GAP_PX) / (ROW_PX + GAP_PX))))
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [measuring])
  const base = wide ? (wide.own === 'auto' ? natural : wide.own) : null
  const resizable = fits.size > 1 || base !== null

  // Where the resize started, and the card it would be let go now.
  const resize = useRef<{ left: number; top: number; choice: TileChoice | undefined } | null>(null)
  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const box = event.currentTarget.parentElement!.getBoundingClientRect()
    resize.current = { left: box.left, top: box.top, choice }
  }
  const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
    const current = resize.current
    const width = grid.current?.getBoundingClientRect().width
    if (!current || !width) return
    const column = (width - 11 * GAP_PX) / 12
    const wanted = (event.clientX - current.left + GAP_PX) / (column + GAP_PX)
    const fit = [...fits.values()].reduce((best, next) =>
      Math.abs(next.columns - wanted) < Math.abs(best.columns - wanted) ? next : best,
    )
    let rows: number | undefined
    if (fit.columns === 12 && base !== null) {
      const tall = Math.round((event.clientY - current.top + GAP_PX) / (ROW_PX + GAP_PX))
      rows = Math.min(MAX_ROWS, Math.max(base, tall))
    }
    const next = choiceFor(autoKey, withRows(fit.config, rows, base ?? undefined))
    if (JSON.stringify(next) === JSON.stringify(current.choice)) return
    current.choice = next
    onSizing(next)
  }
  const endResize = () => {
    const current = resize.current
    if (!current) return
    resize.current = null
    onSized(current.choice)
  }

  const corner =
    'absolute z-10 flex size-[26px] cursor-pointer items-center justify-center rounded-full bg-(--dio-surface,var(--card-background-color)) text-label-2 shadow-[0_1px_4px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.12)] transition-[color,transform] hover:text-(--primary-text-color) active:scale-90'
  const still = { onPointerDown: (event: PointerEvent) => event.stopPropagation() }
  // Dragged only from the card itself, never from a button in its corners.
  const controls = useDragControls()

  return (
    <motion.div
      ref={cell}
      layout="position"
      drag
      dragControls={controls}
      dragListener={false}
      onPointerDown={event => {
        if (event.button !== 0 || (event.target as Element).closest('button')) return
        controls.start(event)
      }}
      dragSnapToOrigin
      dragMomentum={false}
      onDragStart={onGrab}
      onDrag={event => {
        const { clientX, clientY } = 'touches' in event ? event.touches[0] : event
        onDrag(clientX, clientY)
      }}
      onDragEnd={onDrop}
      tabIndex={0}
      role="group"
      aria-label={label}
      aria-roledescription="Widget, moved with the arrow keys"
      onKeyDown={onKey}
      className={cn(
        'focus-visible:ring-tint relative min-w-0 cursor-grab rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        held && 'z-20 cursor-grabbing',
      )}
      style={{ gridColumn: `span ${columns}` }}
      animate={{ scale: held ? 1.03 : 1, boxShadow: held ? '0 14px 34px -10px rgba(0,0,0,0.5)' : '0 0 0 rgba(0,0,0,0)' }}
    >
      <TilePreview hass={hass} config={config} height={rows === 'auto' ? undefined : rows} />
      {measuring && (
        <span ref={measure} aria-hidden className="invisible absolute inset-x-0 top-0 -z-10">
          <TilePreview hass={hass} config={{ ...kept, ...wide.config, entity: auto.entity }} />
        </span>
      )}
      <button
        type="button"
        data-choose={widget.id}
        aria-label={`Change the widget for ${name}`}
        title="Change the widget"
        onClick={onEdit}
        {...still}
        className={cn(corner, '-top-2 -left-1')}
      >
        <FontAwesomeIcon icon={faPen} className="size-3" />
      </button>
      {widget.onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          title="Remove"
          onClick={widget.onRemove}
          {...still}
          className={cn(corner, 'hover:text-danger -top-2 -right-1')}
        >
          <FontAwesomeIcon icon={faXmark} className="size-3.5" />
        </button>
      ) : (
        widget.onHide && (
          <button
            type="button"
            aria-label={`Hide ${name} from the side panel`}
            title="Hide from the side panel"
            onClick={widget.onHide}
            {...still}
            className={cn(corner, '-top-2 -right-1')}
          >
            <FontAwesomeIcon icon={faEye} className="size-3" />
          </button>
        )
      )}
      {resizable && (
        <button
          type="button"
          aria-label={`Resize ${name}`}
          title="Drag to resize"
          tabIndex={-1}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className={cn(corner, '-right-1 -bottom-1 cursor-nwse-resize touch-none hover:cursor-nwse-resize')}
        >
          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 4v6H4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </motion.div>
  )
}

// A card's setup without the width it was stretched to.
function unstretched(config: Record<string, unknown>): Record<string, unknown> {
  const { columns: _, ...grid } = (config.grid_options ?? {}) as Record<string, unknown>
  const { grid_options: __, ...rest } = config
  return Object.keys(grid).length > 0 ? { ...rest, grid_options: grid } : rest
}
