import { Bar, Glass, Slab } from '#/scene/decor/parts.tsx'
import type { ReactNode } from 'react'

type Paint = (slot: string, both?: boolean) => ReactNode

type Props = {
  style: string
  // How long the run is, along x, and how high its handrail stands.
  w: number
  h: number
  paint: Paint
  // The glass style's pane, drawn see through rather than painted.
  glass: string
}

// A balustrade along the edge of a raised floor or beside a few steps:
// a run `w` long across x, centred on the origin, standing on the floor.

// How far apart the balusters stand, the most a child's head must not get
// through in most building codes.
const GAP = 0.11

// Where `n` things stand evenly between `from` and `to`, not at either end.
const between = (from: number, to: number, n: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / (n + 1))

export default function Railing({ style, w, h, paint, glass }: Props) {
  if (style === 'glass') return <GlassRailing w={w} h={h} paint={paint} glass={glass} />
  if (style === 'spindle') return <SpindleRailing w={w} h={h} paint={paint} />
  return <SteelRailing w={w} h={h} paint={paint} />
}

// Black steel: a square post at each end, a round handrail over them, a flat
// bar low down and slim round balusters between the two.
function SteelRailing({ w, h, paint }: Omit<Props, 'style' | 'glass'>) {
  const post = 0.04
  const end = w / 2 - post / 2
  const low = 0.08
  const top = h - 0.03
  const balusters = between(-end, end, Math.max(0, Math.round((w - post) / GAP) - 1))
  return (
    <group>
      {[-end, end].map(x => (
        <Slab key={x} size={[post, top, post]} radius={0.004} bevel={0.002} position={[x, 0, 0]}>
          {paint('rail')}
        </Slab>
      ))}
      <Bar length={w} radius={0.022} position={[0, top, 0]} rotation={[0, 0, Math.PI / 2]}>
        {paint('rail')}
      </Bar>
      <Slab size={[w - post * 2, 0.02, 0.02]} radius={0.003} bevel={0.002} position={[0, low, 0]}>
        {paint('rail')}
      </Slab>
      {balusters.map(x => (
        <mesh key={x} position={[x, (low + top) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.007, 0.007, top - low, 8]} />
          {paint('balusters')}
        </mesh>
      ))}
    </group>
  )
}

// Frameless glass: one clear pane held in a low aluminium shoe on the
// floor, with a slim oak handrail capping its top edge.
function GlassRailing({ w, h, paint, glass }: Omit<Props, 'style'>) {
  const shoe = 0.1
  const cap = 0.045
  const pane = h - shoe - cap + 0.02
  return (
    <group>
      <Slab size={[w, shoe, 0.06]} radius={0.006} bevel={0.003} position={[0, 0, 0]}>
        {paint('shoe')}
      </Slab>
      <mesh position={[0, shoe - 0.02 + pane / 2, 0]}>
        <boxGeometry args={[w - 0.01, pane, 0.012]} />
        <Glass color={glass} opacity={0.3} />
      </mesh>
      <Slab size={[w, cap, 0.05]} radius={0.012} bevel={0.006} position={[0, h - cap, 0]}>
        {paint('rail')}
      </Slab>
    </group>
  )
}

// Solid timber: a square newel at each end with a capped top, square
// spindles between a base rail and a handrail.
function SpindleRailing({ w, h, paint }: Omit<Props, 'style' | 'glass'>) {
  const newel = 0.09
  const end = w / 2 - newel / 2
  const base = 0.05
  const rail = 0.05
  const top = h - rail
  const spindles = between(-end, end, Math.max(0, Math.round((w - newel) / GAP) - 1))
  return (
    <group>
      {[-end, end].map(x => (
        <group key={x}>
          <Slab size={[newel, h + 0.05, newel]} radius={0.008} bevel={0.004} position={[x, 0, 0]}>
            {paint('posts')}
          </Slab>
          <Slab size={[newel + 0.02, 0.025, newel + 0.02]} radius={0.01} bevel={0.006} position={[x, h + 0.05, 0]}>
            {paint('rail')}
          </Slab>
        </group>
      ))}
      <Slab size={[w - newel * 2, base, 0.05]} radius={0.004} bevel={0.003} position={[0, 0, 0]}>
        {paint('posts')}
      </Slab>
      {spindles.map(x => (
        <Slab key={x} size={[0.032, top - base, 0.032]} radius={0.004} bevel={0.002} position={[x, base, 0]}>
          {paint('spindles')}
        </Slab>
      ))}
      <Slab size={[w - newel * 2, rail, 0.065]} radius={0.016} bevel={0.008} position={[0, top, 0]}>
        {paint('rail')}
      </Slab>
    </group>
  )
}
