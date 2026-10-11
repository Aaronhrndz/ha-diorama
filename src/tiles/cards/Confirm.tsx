import type { TileEnv } from '#/tiles/actions.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { Tile } from '#/tiles/Tile.tsx'
import type { EntityState } from '#/types.ts'
import { useEffect, useRef, useState, type ComponentProps } from 'react'

// How long the first tap waits for the second.
export const CONFIRM_MS = 4000
// How much of the tile the first tap lights, or leaves lit on a tile that
// is on, before it runs back.
export const CONFIRM_FILL = 50
// How long a second tap waits for Home Assistant to say it took, before the
// tile goes back to how it was.
const SENT_MS = 10_000

type Props = {
  env: TileEnv
  config: TileConfig
  entity: EntityState | undefined
  // Lit, as the tile is at rest.
  on: boolean
  fading?: boolean
  state: string
  // Under the name while it waits for the second tap.
  prompt: string
  // Sent on the second tap.
  onConfirm: () => void
} & Pick<ComponentProps<typeof Tile>, 'accent' | 'glow' | 'role' | 'unknownIsUnavailable'>

// How long the lit part takes to ease from where it was to where the first
// tap puts it.
const EASE_MS = 300

// A tile that only acts on a second tap, so a stray one never does. The
// first tap on a tile that is off lights half of it, which runs back to
// nothing over the time the second tap has. On a tile that is on, it cuts
// the lit part back to half, showing the tile off past it, and that grows
// back to all of it. The second tap lights it all, or none of it, and
// sends.
export function ConfirmTile({ env, config, entity, on, fading, state, prompt, onConfirm, ...look }: Props) {
  // Whether the first tap is waiting for the second.
  const [waiting, setWaiting] = useState(false)
  // What the second tap sent it to, until Home Assistant says it is.
  const [goal, setGoal] = useState<boolean | null>(null)
  const lit = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setWaiting(false)
    setGoal(null)
  }, [on])
  useEffect(() => {
    if (goal === null) return
    const timer = setTimeout(() => setGoal(null), SENT_MS)
    return () => clearTimeout(timer)
  }, [goal])
  const shown = goal ?? on
  // The lit part moves frame by frame, since a browser may not repaint a
  // clip that only CSS animates until something else moves. It eases from
  // where it was into the run back, so the first tap does not jump.
  useEffect(() => {
    const box = lit.current
    if (!box) return
    const clip = (part: number) => (box.style.clipPath = `inset(0 ${100 - part}% 0 0)`)
    if (!waiting) return void clip(shown ? 100 : 0)
    const from = on ? 100 : 0
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const elapsed = now - start
      const done = elapsed / CONFIRM_MS
      if (done >= 1) return setWaiting(false)
      const run = on ? CONFIRM_FILL + (100 - CONFIRM_FILL) * done : CONFIRM_FILL * (1 - done)
      const ease = 1 - (1 - Math.min(1, elapsed / EASE_MS)) ** 3
      clip(from + (run - from) * ease)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [waiting, on, shown])
  const said = waiting ? prompt : state
  const tap = () => {
    if (goal !== null) return
    if (!waiting) return setWaiting(true)
    setWaiting(false)
    setGoal(!on)
    onConfirm()
  }
  return (
    <div
      className="dio-fill dio-confirm"
      data-step={waiting ? 1 : goal !== null ? 2 : 0}
      data-fading={fading || undefined}
    >
      <Tile
        env={env}
        config={config}
        entity={entity}
        active={shown && !waiting}
        fading={fading}
        state={said}
        onTap={tap}
        {...look}
      />
      <div ref={lit} className="dio-fill-lit" inert>
        <Tile env={env} config={config} entity={entity} active state={said} {...look} />
      </div>
    </div>
  )
}
