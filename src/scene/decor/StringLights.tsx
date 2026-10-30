import { BaseMaterial, ShadeMaterial, type LightState } from '#/scene/decor/lightMaterials.tsx'
import { Tube } from '#/scene/decor/parts.tsx'
import type { ReactNode } from 'react'

type Props = {
  style: string
  // How far apart the two ends are, along x, how high they hang and how far
  // the middle sags below them.
  length: number
  height: number
  sag: number
  c: (slot: string) => string
  m: (slot: string) => string
  state: LightState | null
}

type Vec3 = [number, number, number]

// Where a string `length` long between two ends at `height` hangs at `t`,
// 0 one end and 1 the other: a parabola sagging `sag` in the middle, close
// enough to a hanging cable over a few meters.
const along = (length: number, height: number, sag: number, t: number): Vec3 => [
  -length / 2 + length * t,
  height - sag * 4 * t * (1 - t),
  0,
]

// Lights strung between two points, for a garden, a terrace or a child's
// room. The festoon stands on two black posts at its ends, the fairy wire
// and the paper globes are hung from whatever is there, the walls or a
// pergola, and float at their height.
export default function StringLights({ style, length, height, sag, c, m, state }: Props) {
  const fairy = style === 'fairy'
  const globes = style === 'globes'
  const spacing = fairy ? 0.1 : globes ? 0.45 : 0.33
  const count = Math.max(2, Math.round(length / spacing))
  const curve = Array.from({ length: 17 }, (_, i) => along(length, height, sag, i / 16))
  const bulbs = Array.from({ length: count }, (_, i) => along(length, height, sag, (i + 0.5) / count))
  const cable: ReactNode = <BaseMaterial color={c('cable')} material={m('cable')} />
  const glow: ReactNode = <ShadeMaterial color={c('bulbs')} material={m('bulbs')} state={state} solid={!globes} />
  return (
    <group>
      <Tube points={curve} radius={fairy ? 0.0015 : 0.004} segments={64}>
        {cable}
      </Tube>
      {bulbs.map(([x, y, z], i) => {
        if (fairy) {
          return (
            <mesh key={i} position={[x, y - 0.004, z]}>
              <sphereGeometry args={[0.006, 8, 6]} />
              {glow}
            </mesh>
          )
        }
        if (globes) {
          // A paper globe on a short drop from the cord.
          return (
            <group key={i}>
              <mesh position={[x, y - 0.05, z]}>
                <cylinderGeometry args={[0.002, 0.002, 0.05, 6]} />
                {cable}
              </mesh>
              <mesh position={[x, y - 0.13, z]} userData={{ transmits: true }}>
                <sphereGeometry args={[0.08, 20, 14]} />
                {glow}
              </mesh>
            </group>
          )
        }
        // A festoon bulb: a black socket and a round clear bulb under it.
        return (
          <group key={i}>
            <mesh position={[x, y - 0.025, z]}>
              <cylinderGeometry args={[0.012, 0.014, 0.04, 12]} />
              {cable}
            </mesh>
            <mesh position={[x, y - 0.075, z]}>
              <sphereGeometry args={[0.032, 16, 12]} />
              {glow}
            </mesh>
          </group>
        )
      })}
      {style === 'festoon' &&
        [-1, 1].map(s => (
          <group key={s} position={[(s * length) / 2, 0, 0]}>
            {/* A slim post on a weighted round foot, the cable over its top. */}
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.12, 0.13, 0.04, 24]} />
              {cable}
            </mesh>
            <mesh position={[0, height / 2 + 0.02, 0]} castShadow>
              <cylinderGeometry args={[0.018, 0.022, height + 0.04, 12]} />
              {cable}
            </mesh>
          </group>
        ))}
    </group>
  )
}
