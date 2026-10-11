import { formatState, type TileEnv } from '#/tiles/actions.ts'
import { insideTile } from '#/tiles/gestures.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { Panel } from '#/tiles/Panel.tsx'
import { useEffect, useRef, useState } from 'react'

export type MapConfig = TileConfig & {
  // How many hours of a person's path the map draws behind them.
  hours_to_show?: number
  // Where the map goes: beside the name, the default, across the top over
  // a bar with the name and the state, over the whole card with them on
  // it, or over the whole card alone.
  layout?: 'beside' | 'top' | 'caption' | 'full'
}

type Card = HTMLElement & { hass?: unknown; setConfig?: (config: Record<string, unknown>) => void }

// Where a person, a tracker or a zone is: the name and the place in the
// bottom left corner like every tile, and Home Assistant's own map filling
// the right of it. Laid out otherwise, there is no icon, and the map fills
// all of the card over a bar along its bottom with the name and the place,
// or the whole card, with them on it or with nothing. The map takes its
// own drags and pinches.
export default function MapCard({ env, config }: { env: TileEnv; config: MapConfig }) {
  const entity = env.hass.states[config.entity!]
  const box = useRef<HTMLDivElement>(null)
  const [card, setCard] = useState<Card | null>(null)
  const hours = config.hours_to_show ?? 0

  useEffect(() => {
    let live = true
    window
      .loadCardHelpers?.()
      .then(helpers => {
        if (!live) return
        const made = helpers.createCardElement({
          type: 'map',
          entities: [config.entity],
          hours_to_show: hours,
          theme_mode: 'auto',
        }) as Card
        setCard(made)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [config.entity, hours])

  useEffect(() => {
    if (!card || !box.current) return
    box.current.replaceChildren(card)
  }, [card])

  useEffect(() => {
    if (card) card.hass = env.hass
  }, [card, env.hass])

  return (
    <Panel
      env={env}
      config={config}
      entity={entity}
      state={formatState(env.hass, entity)}
      className={`fp-map fp-map-${config.layout ?? 'beside'}`}
    >
      <div {...insideTile} ref={box} className="fp-map-box" />
    </Panel>
  )
}
