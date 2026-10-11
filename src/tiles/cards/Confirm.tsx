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

// A tile that only acts on a second tap, so a stray one never does. The
// first tap on a tile that is off lights half of it, which runs back to
// nothing over the time the second tap has. On a tile that is on, it cuts
// the lit part back to half, which grows back to all of it. The second tap
// lights it all, or none of it, and sends.
export function ConfirmTile({ env, config, entity, on, fading, state, prompt, onConfirm, ...look }: Props) {
  // 0 before a tap, 1 waiting for the second, 2 sent.
  const [step, setStep] = useState(0)
  const lit = useRef<HTMLDivElement>(null)
  useEffect(() => setStep(0), [on])
  useEffect(() => {
    if (step !== 2) return
    const timer = setTimeout(() => setStep(0), SENT_MS)
    return () => clearTimeout(timer)
  }, [step])
  // What it shows, the state it is heading for once sent.
  const shown = step === 2 ? !on : on
  // The lit part moves frame by frame, since a browser may not repaint a
  // clip that only CSS animates until something else moves.
  useEffect(() => {
    const box = lit.current
    if (!box) return
    const clip = (part: number) => (box.style.clipPath = `inset(0 ${100 - part}% 0 0)`)
    if (step !== 1) return void clip(shown ? 100 : 0)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const done = (now - start) / CONFIRM_MS
      if (done >= 1) return setStep(0)
      clip(on ? CONFIRM_FILL + (100 - CONFIRM_FILL) * done : CONFIRM_FILL * (1 - done))
      frame = requestAnimationFrame(tick)
    }
    clip(CONFIRM_FILL)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [step, on, shown])
  const said = step === 1 ? prompt : state
  const tap = () => {
    if (step === 2) return
    if (step === 0) return setStep(1)
    setStep(2)
    onConfirm()
  }
  return (
    <div className="fp-fill fp-confirm" data-step={step} data-fading={fading || undefined}>
      <Tile
        env={env}
        config={config}
        entity={entity}
        active={shown}
        fading={fading}
        state={said}
        onTap={tap}
        {...look}
      />
      <div ref={lit} className="fp-fill-lit" inert>
        <Tile env={env} config={config} entity={entity} active state={said} {...look} />
      </div>
    </div>
  )
}
