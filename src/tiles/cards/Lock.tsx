import { callService, formatState, type TileEnv } from '#/tiles/actions.ts'
import { supports } from '#/tiles/features/parts.tsx'
import type { TileConfig } from '#/tiles/host.tsx'
import { Tile } from '#/tiles/Tile.tsx'
import { useEffect, useRef, useState } from 'react'

type Props = { env: TileEnv; config: TileConfig }

// How long the first tap on a tile that opens the door waits for the second.
const CONFIRM_MS = 4000
// How much of the tile the first tap lights, before it runs back.
const CONFIRM_FILL = 50
// The lock's supported_features bit for opening the door.
const OPEN = 1
const GREEN = 'var(--_accent-unlocked)'
const RED = 'var(--_accent-locked)'

// A lock. A tap locks it, or unlocks it while it is locked. It is lit
// while it is not locked, since that is the state worth seeing from afar,
// with a green icon and a green wash from the left. Locked it stays glass,
// with a red icon and a red wash from the left. With the open door
// feature a tap opens the door instead, and only on a second tap, so a
// stray one never does.
export default function Lock({ env, config }: Props) {
  const entity = env.hass.states[config.entity!]
  const locked = entity?.state === 'locked' || entity?.state === 'locking'
  const unavailable = !entity || entity.state === 'unavailable' || entity.state === 'unknown'
  if (config.feature === 'open-door' && !unavailable && supports(entity, OPEN))
    return <OpenDoorTile env={env} config={config} />
  return (
    <Tile
      env={env}
      config={config}
      entity={entity}
      active={!!entity && !locked}
      toggles
      accent={GREEN}
      glow={GREEN}
      glowFrom="left"
      tint={locked ? RED : undefined}
      state={formatState(env.hass, entity)}
      onTap={() => callService(env.hass, locked ? 'lock.unlock' : 'lock.lock', { entity_id: config.entity })}
    />
  )
}

// The whole tile opens the door, in two taps. The first one lights half of
// it, plain, which runs back to nothing over the time the second tap has,
// and the second one lights it all, fades the green in and opens the door.
// It stays lit while the door is open, and red while it is locked.
function OpenDoorTile({ env, config }: Props) {
  const entity = env.hass.states[config.entity!]
  const open = entity?.state === 'open' || entity?.state === 'opening'
  const locked = entity?.state === 'locked' || entity?.state === 'locking'
  // 0 before a tap, 1 waiting for the second, 2 sent.
  const [step, setStep] = useState(0)
  const lit = useRef<HTMLDivElement>(null)
  useEffect(() => setStep(0), [entity?.state])
  // The lit half runs back frame by frame, since a browser may not repaint
  // a clip that only CSS animates until something else moves.
  useEffect(() => {
    const box = lit.current
    if (!box) return
    const clip = (shown: number) => (box.style.clipPath = `inset(0 ${100 - shown}% 0 0)`)
    if (open || step === 2) return void clip(100)
    if (step === 0) return void clip(0)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const left = 1 - (now - start) / CONFIRM_MS
      if (left <= 0) return setStep(0)
      clip(CONFIRM_FILL * left)
      frame = requestAnimationFrame(tick)
    }
    clip(CONFIRM_FILL)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [step, open])
  const { feature: _, ...plain } = config
  // Green only once the second tap opens it.
  const done = open || step === 2
  const accent = done ? GREEN : undefined
  const state = step === 1 ? 'Tap again to open' : formatState(env.hass, entity)
  const tap = () => {
    if (open || step === 2) return
    if (step === 0) return setStep(1)
    setStep(2)
    void callService(env.hass, 'lock.open', { entity_id: entity!.entity_id })
  }
  return (
    <div className="fp-fill fp-confirm" data-step={step} data-done={done || undefined}>
      <Tile
        env={env}
        config={plain}
        entity={entity}
        active={open}
        accent={accent}
        glow={GREEN}
        glowFrom="left"
        tint={locked ? RED : undefined}
        state={state}
        onTap={tap}
      />
      <div ref={lit} className="fp-fill-lit" inert>
        <Tile
          env={env}
          config={plain}
          entity={entity}
          active
          accent={accent}
          glow={GREEN}
          glowFrom="left"
          state={state}
        />
      </div>
    </div>
  )
}
