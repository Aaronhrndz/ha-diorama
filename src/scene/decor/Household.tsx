import { colorValue, decorationVariant, materialValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import { useEased } from '#/scene/decor/ease.ts'
import { Halo, Led, Material, SEG, Slab } from '#/scene/decor/parts.tsx'
import type { ItemState } from '#/scene/decor/state.ts'
import type { DecorationConfig } from '#/types.ts'
import { useMemo, type ReactNode } from 'react'
import { ExtrudeGeometry, Shape } from 'three'

type Props = { kind: DecorationKind; item: DecorationConfig; state: ItemState | null }

type Look = {
  p: (id: string) => number
  c: (slot: string) => string
  M: (slot: string) => ReactNode
  style: string
  state: ItemState | null
  on: boolean
}

type Vec3 = [number, number, number]

// The working corners of a home: a bathroom fan, a chest freezer and a
// place for the dog. Floor pieces stand on the floor at their middle, the
// fan hangs from the ceiling at its origin, and every front faces +z.
export default function HouseholdModel({ kind, item, state }: Props) {
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const c = (slot: string) => colorValue(kind, item.colors, slot, item.variant)
  const m = (slot: string) => materialValue(kind, slot, item.variant)
  const look: Look = {
    p,
    c,
    M: (slot: string) => <Material color={c(slot)} material={m(slot)} />,
    style: decorationVariant(kind, item.variant)?.id ?? '',
    state,
    on: state?.on ?? false,
  }
  switch (kind.id) {
    case 'bath_fan':
      return <BathFan {...look} />
    case 'chest_freezer':
      return <ChestFreezer {...look} />
    case 'dog_kennel':
      return <Kennel {...look} />
    default:
      return null
  }
}

// A square bar from its base at `at`, `size` across.
function Box({ size, at, children }: { size: Vec3; at: Vec3; children: ReactNode }) {
  const r = Math.min(size[0], size[1], size[2]) * 0.18
  return (
    <Slab size={size} radius={r} bevel={r * 0.5} position={at}>
      {children}
    </Slab>
  )
}

// Where `n` things stand evenly between `a` and `b`, at neither end.
const between = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / (n + 1))

// A bathroom fan in the ceiling: a square grille of slots, the same with a
// round light in its middle, or a round plate with a ring of light. The
// lights come on while the fan runs, and a disc on top shows it from above,
// where there is no ceiling to hide it.
function BathFan({ p, M, style, on }: Look) {
  const s = p('size')
  const lit = useEased(on ? 1 : 0, 6)
  const warm = '#fff3dc'
  const light = <meshStandardMaterial color="#f4eee3" emissive={warm} emissiveIntensity={1.2 * lit} roughness={0.5} />
  if (style === 'round') {
    return (
      <group>
        <mesh position={[0, -0.012, 0]}>
          <cylinderGeometry args={[s / 2, s / 2, 0.024, SEG * 2]} />
          {M('grille')}
        </mesh>
        <mesh position={[0, -0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[s * 0.42, 0.008, 8, SEG * 2]} />
          {light}
        </mesh>
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[s * 0.36, s * 0.46, SEG * 2]} />
          {light}
        </mesh>
        <Halo on={on} position={[0, -0.12, 0]} color={warm} intensity={0.08} distance={1} />
      </group>
    )
  }
  const lamp = style === 'light'
  const slots = between(-s / 2 + 0.03, s / 2 - 0.03, Math.max(3, Math.round(s / 0.025)))
  return (
    <group>
      <Slab size={[s, 0.02, s]} radius={0.01} bevel={0.004} position={[0, -0.02, 0]}>
        {M('grille')}
      </Slab>
      {slots
        .filter(x => !lamp || Math.abs(x) > s * 0.2)
        .map(x => (
          <mesh key={x} position={[x, -0.0205, 0]}>
            <boxGeometry args={[0.008, 0.001, s * 0.78]} />
            <meshStandardMaterial color="#2b2e31" roughness={0.9} />
          </mesh>
        ))}
      {lamp && (
        <>
          <mesh position={[0, -0.024, 0]}>
            <cylinderGeometry args={[s * 0.17, s * 0.17, 0.008, SEG]} />
            {light}
          </mesh>
          <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[s * 0.17, SEG]} />
            {light}
          </mesh>
          <Halo on={on} position={[0, -0.12, 0]} color={warm} intensity={0.08} distance={1} />
        </>
      )}
      {!lamp && <Led on={on} position={[s / 2 - 0.02, 0.004, s / 2 - 0.02]} color="#8fd6a0" radius={0.006} />}
    </group>
  )
}

// A chest freezer: a white box with a lid and a handle along the front of
// the lid, a dark kick at the floor and a green light that is on while it
// runs. The compact one is brushed steel with a black handle.
function ChestFreezer({ p, M, on }: Look) {
  const w = p('width')
  const d = p('depth')
  const h = p('height')
  const lid = 0.06
  return (
    <group>
      <Slab size={[w - 0.03, 0.05, d - 0.03]} radius={0.01} bevel={0.004} position={[0, 0, 0]}>
        <Material color="#2b2e31" material="matte" />
      </Slab>
      <Slab size={[w, h - lid - 0.04, d]} radius={0.03} bevel={0.01} position={[0, 0.04, 0]}>
        {M('body')}
      </Slab>
      <Slab size={[w + 0.008, lid, d + 0.008]} radius={0.03} bevel={0.012} position={[0, h - lid, 0]}>
        {M('lid')}
      </Slab>
      <Slab size={[w * 0.42, 0.022, 0.026]} radius={0.008} bevel={0.004} position={[0, h - lid - 0.008, d / 2 + 0.006]}>
        {M('handle')}
      </Slab>
      <Led on={on} position={[w / 2 - 0.06, h - lid - 0.05, d / 2 + 0.003]} color="#8fd6a0" radius={0.006} />
    </group>
  )
}

// A triangular gable, `w` wide at its foot and `rise` tall, `t` thick
// along z, standing on its foot at y 0.
function Gable({ w, rise, t, children }: { w: number; rise: number; t: number; children: ReactNode }) {
  const geometry = useMemo(() => {
    const shape = new Shape()
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(0, rise)
    shape.closePath()
    const geo = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
    geo.translate(0, 0, -t / 2)
    return geo
  }, [w, rise, t])
  return (
    <mesh geometry={geometry} castShadow>
      {children}
    </mesh>
  )
}

// A place for the dog: a wooden house with a pitched roof and an arched
// door, a folding wire crate on a tray, or a crate made as a piece of
// furniture, with a solid top and slatted sides and door.
function Kennel({ p, M, style }: Look) {
  const w = p('width')
  const d = p('depth')
  const h = p('height')
  if (style === 'crate') {
    const t = 0.012
    const wire = 0.003
    const pitch = 0.055
    const xs = between(-w / 2, w / 2, Math.round(w / pitch))
    const zs = between(-d / 2, d / 2, Math.round(d / pitch))
    return (
      <group>
        <Slab size={[w, 0.03, d]} radius={0.01} bevel={0.004} position={[0, 0, 0]}>
          {M('roof')}
        </Slab>
        {[-1, 1].flatMap(sx =>
          [-1, 1].map(sz => (
            <Box key={`${sx}${sz}`} size={[t, h, t]} at={[(sx * (w - t)) / 2, 0, (sz * (d - t)) / 2]}>
              {M('body')}
            </Box>
          )),
        )}
        {[0.03, h - t].map(y => (
          <group key={y}>
            {[-1, 1].map(sz => (
              <Box key={`l${sz}`} size={[w, t, t]} at={[0, y, (sz * (d - t)) / 2]}>
                {M('body')}
              </Box>
            ))}
            {[-1, 1].map(sx => (
              <Box key={`e${sx}`} size={[t, t, d]} at={[(sx * (w - t)) / 2, y, 0]}>
                {M('body')}
              </Box>
            ))}
          </group>
        ))}
        {/* Upright wires on every side, and wires across the top. */}
        {[-1, 1].map(sz =>
          xs.map(x => (
            <mesh key={`${sz}${x}`} position={[x, h / 2 + 0.015, (sz * (d - t)) / 2]}>
              <cylinderGeometry args={[wire, wire, h - 0.03, 5]} />
              {M('body')}
            </mesh>
          )),
        )}
        {[-1, 1].map(sx =>
          zs.map(z => (
            <mesh key={`${sx}${z}`} position={[(sx * (w - t)) / 2, h / 2 + 0.015, z]}>
              <cylinderGeometry args={[wire, wire, h - 0.03, 5]} />
              {M('body')}
            </mesh>
          )),
        )}
        {xs.map(x => (
          <mesh key={x} position={[x, h - t / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[wire, wire, d, 5]} />
            {M('body')}
          </mesh>
        ))}
      </group>
    )
  }
  if (style === 'table') {
    // A crate that doubles as a side table.
    const post = 0.045
    const slat = 0.03
    const top = 0.035
    const tall = h - top - 0.02
    const px = w / 2 - post / 2
    const pz = d / 2 - post / 2
    const xs = between(-px, px, Math.round((w - post * 2) / 0.06))
    const zs = between(-pz, pz, Math.round((d - post * 2) / 0.06))
    return (
      <group>
        {[-1, 1].flatMap(sx =>
          [-1, 1].map(sz => (
            <Box key={`${sx}${sz}`} size={[post, h - top, post]} at={[sx * px, 0, sz * pz]}>
              {M('body')}
            </Box>
          )),
        )}
        <Box size={[w - post * 2, 0.02, d - post * 2]} at={[0, 0.02, 0]}>
          {M('body')}
        </Box>
        {[0.02, h - top - 0.05].map(y => (
          <group key={y}>
            {[-1, 1].map(sz => (
              <Box key={`l${sz}`} size={[w - post * 2, 0.05, 0.022]} at={[0, y, sz * pz]}>
                {M('body')}
              </Box>
            ))}
            {[-1, 1].map(sx => (
              <Box key={`e${sx}`} size={[0.022, 0.05, d - post * 2]} at={[sx * px, y, 0]}>
                {M('body')}
              </Box>
            ))}
          </group>
        ))}
        {[-1, 1].map(sz =>
          xs.map(x => (
            <Box key={`${sz}${x}`} size={[slat, tall - 0.05, 0.016]} at={[x, 0.07, sz * pz]}>
              {M('body')}
            </Box>
          )),
        )}
        {[-1, 1].map(sx =>
          zs.map(z => (
            <Box key={`${sx}${z}`} size={[0.016, tall - 0.05, slat]} at={[sx * px, 0.07, z]}>
              {M('body')}
            </Box>
          )),
        )}
        <Slab size={[w + 0.02, top, d + 0.02]} radius={0.012} bevel={0.006} position={[0, h - top, 0]}>
          {M('roof')}
        </Slab>
      </group>
    )
  }
  // The house: a floor, three walls and a front with an arched door, under
  // a pitched roof that overhangs a little all round.
  const wall = h * 0.62
  const rise = h - wall
  const t = 0.022
  const door = w * 0.46
  const doorH = wall * 0.78
  const side = (w - door) / 2
  return (
    <group>
      <Box size={[w, 0.03, d]} at={[0, 0, 0]}>
        {M('body')}
      </Box>
      <Box size={[w, wall, t]} at={[0, 0, -d / 2 + t / 2]}>
        {M('body')}
      </Box>
      {[-1, 1].map(sx => (
        <Box key={sx} size={[t, wall, d]} at={[(sx * (w - t)) / 2, 0, 0]}>
          {M('body')}
        </Box>
      ))}
      {[-1, 1].map(sx => (
        <Box key={`f${sx}`} size={[side, wall, t]} at={[sx * (door / 2 + side / 2), 0, d / 2 - t / 2]}>
          {M('body')}
        </Box>
      ))}
      <Box size={[door, wall - doorH, t]} at={[0, doorH, d / 2 - t / 2]}>
        {M('body')}
      </Box>
      {/* The round top of the door, and a dark inside behind it. */}
      <mesh position={[0, doorH, d / 2 - t / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[door / 2, door / 2, t, SEG, 1, false, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#1c1d1f" roughness={1} />
      </mesh>
      <mesh position={[0, doorH / 2 + 0.015, d / 2 - t - 0.001]}>
        <planeGeometry args={[door, doorH - 0.03]} />
        <meshStandardMaterial color="#1c1d1f" roughness={1} />
      </mesh>
      {[-1, 1].map(sz => (
        <group key={sz} position={[0, wall, (sz * (d - t)) / 2]}>
          <Gable w={w} rise={rise} t={t}>
            {M('body')}
          </Gable>
        </group>
      ))}
      {/* Two roof boards meeting along the ridge, front to back. */}
      {[-1, 1].map(sx => {
        const run = w / 2 + 0.06
        const slope = Math.atan2(rise, w / 2)
        const length = run / Math.cos(slope)
        return (
          <mesh
            key={sx}
            position={[(sx * (w / 2 + 0.06)) / 2, wall + rise / 2 + 0.02, 0]}
            rotation={[0, 0, -sx * slope]}
            castShadow
          >
            <boxGeometry args={[length, 0.025, d + 0.12]} />
            {M('roof')}
          </mesh>
        )
      })}
    </group>
  )
}
