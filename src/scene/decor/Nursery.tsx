import { colorValue, decorationVariant, materialValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import { useEased } from '#/scene/decor/ease.ts'
import { Halo, Hollow, Leg, Material, SEG, Slab, Soft, Tube } from '#/scene/decor/parts.tsx'
import type { ItemState } from '#/scene/decor/state.ts'
import type { DecorationConfig } from '#/types.ts'
import type { ReactNode } from 'react'

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

// A child's room and the chairs and gadgets round it: a crib, a bassinet,
// a loft bed, a kids sofa, a rocking chair and a sound machine. Every piece
// stands on the floor at its middle, its width along x and its front
// toward +z.
export default function NurseryModel({ kind, item, state }: Props) {
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
    case 'crib':
      return <Crib {...look} />
    case 'bassinet':
      return <Bassinet {...look} />
    case 'loft_bed':
      return <LoftBed {...look} />
    case 'kids_sofa':
      return <KidsSofa {...look} />
    case 'rocking_chair':
      return <RockingChair {...look} />
    case 'sound_machine':
      return <SoundMachine {...look} />
    default:
      return null
  }
}

// A square bar of timber or steel from its base at `at`, `size` across.
function Box({ size, at, children }: { size: Vec3; at: Vec3; children: ReactNode }) {
  const r = Math.min(size[0], size[2], size[1]) * 0.18
  return (
    <Slab size={size} radius={r} bevel={r * 0.5} position={at}>
      {children}
    </Slab>
  )
}

// A straight bar from one point to another, `t` thick.
function Strut({ from, to, t, children }: { from: Vec3; to: Vec3; t: number; children: ReactNode }) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const length = Math.hypot(dx, dy, dz)
  return (
    <mesh
      position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}
      rotation={[Math.atan2(dz, dy), 0, -Math.atan2(dx, Math.hypot(dy, dz))]}
      castShadow
    >
      <boxGeometry args={[t, length, t]} />
      {children}
    </mesh>
  )
}

// Where `n` things stand evenly between `a` and `b`, at neither end.
const between = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / (n + 1))

// A crib round a 60 by 120 cm mattress. The slatted one has upright slats
// on every side, the panel one solid ends between round topped posts, and
// the Montessori one is a low bed under the frame of a little house.
function Crib({ p, M, style }: Look) {
  const w = p('width')
  const d = p('depth')
  const h = p('height')
  const house = style === 'house'
  const post = house ? 0.05 : 0.045
  const px = w / 2 - post / 2
  const pz = d / 2 - post / 2
  const base = house ? 0.1 : 0.3
  const rail = 0.04
  const mattress = (
    <Soft
      size={[w - post * 2 - 0.01, 0.1, d - post * 2 - 0.01]}
      round={[0.03, 0.03, 0.03]}
      position={[0, base + 0.06, 0]}
    >
      {M('mattress')}
    </Soft>
  )
  if (house) {
    // Four posts up to the eaves, a gable at each end and a ridge along the
    // top, round a low frame with the mattress on it.
    const eaves = h * 0.6
    return (
      <group>
        {[-1, 1].map(sz => (
          <Box key={`l${sz}`} size={[w, 0.08, 0.03]} at={[0, 0.02, sz * (d / 2 - 0.015)]}>
            {M('frame')}
          </Box>
        ))}
        {[-1, 1].map(sx => (
          <Box key={`e${sx}`} size={[0.03, 0.08, d]} at={[sx * (w / 2 - 0.015), 0.02, 0]}>
            {M('frame')}
          </Box>
        ))}
        {mattress}
        {[-1, 1].flatMap(sx =>
          [-1, 1].map(sz => (
            <Box key={`${sx}${sz}`} size={[post, eaves, post]} at={[sx * px, 0, sz * pz]}>
              {M('frame')}
            </Box>
          )),
        )}
        {[-1, 1].map(sx => (
          <group key={sx}>
            {[-1, 1].map(sz => (
              <Strut key={sz} from={[sx * px, eaves, sz * pz]} to={[sx * px, h - post / 2, 0]} t={post}>
                {M('frame')}
              </Strut>
            ))}
          </group>
        ))}
        <Box size={[w, post, post]} at={[0, h - post, 0]}>
          {M('frame')}
        </Box>
        {/* A low rail along the back to keep the bedding in. */}
        <Box size={[w - post * 2, 0.04, 0.03]} at={[0, base + 0.2, -pz]}>
          {M('frame')}
        </Box>
      </group>
    )
  }
  const panel = style === 'panel'
  const span = h - rail - base
  const longSlats = between(-px, px, Math.max(1, Math.round((w - post * 2) / 0.075)))
  const endSlats = between(-pz, pz, Math.max(1, Math.round((d - post * 2) / 0.075)))
  return (
    <group>
      {[-1, 1].flatMap(sx =>
        [-1, 1].map(sz => (
          <group key={`${sx}${sz}`}>
            <Box size={[post, h, post]} at={[sx * px, 0, sz * pz]}>
              {M('frame')}
            </Box>
            {panel && (
              <mesh position={[sx * px, h + 0.02, sz * pz]}>
                <sphereGeometry args={[post * 0.62, 16, 12]} />
                {M('frame')}
              </mesh>
            )}
          </group>
        )),
      )}
      {[base - rail, h - rail].map(y => (
        <group key={y}>
          {[-1, 1].map(sz => (
            <Box key={`l${sz}`} size={[w - post * 2, rail, 0.028]} at={[0, y, sz * pz]}>
              {M('frame')}
            </Box>
          ))}
          {[-1, 1].map(sx => (
            <Box key={`e${sx}`} size={[0.028, rail, d - post * 2]} at={[sx * px, y, 0]}>
              {M('frame')}
            </Box>
          ))}
        </group>
      ))}
      {[-1, 1].map(sz =>
        longSlats.map(x => (
          <Box key={`${sz}${x}`} size={[0.022, span, 0.022]} at={[x, base, sz * pz]}>
            {M('frame')}
          </Box>
        )),
      )}
      {[-1, 1].map(sx =>
        panel ? (
          <Box key={sx} size={[0.02, span, d - post * 2]} at={[sx * px, base, 0]}>
            {M('frame')}
          </Box>
        ) : (
          endSlats.map(z => (
            <Box key={`${sx}${z}`} size={[0.022, span, 0.022]} at={[sx * px, base, z]}>
              {M('frame')}
            </Box>
          ))
        ),
      )}
      {/* The mattress board, and the mattress on it. */}
      <Box size={[w - post * 2, 0.02, d - post * 2]} at={[0, base - 0.02, 0]}>
        {M('frame')}
      </Box>
      {mattress}
    </group>
  )
}

// A bassinet: an oval woven basket on a crossed stand, a soft sided
// sleeper on four legs with its side to the bed let down, or a wooden
// cradle on two rockers.
function Bassinet({ p, M, style }: Look) {
  const w = p('width')
  const d = p('depth')
  const h = p('height')
  if (style === 'woven') {
    const wall = 0.26
    const top = Math.max(h - wall, 0.1)
    return (
      <group>
        {[-1, 1].map(sx => (
          <group key={sx} position={[sx * (w / 2 - 0.1), 0, 0]}>
            <Strut from={[0, 0, -d / 2 + 0.03]} to={[0, top, d / 2 - 0.08]} t={0.025}>
              {M('stand')}
            </Strut>
            <Strut from={[0, 0, d / 2 - 0.03]} to={[0, top, -d / 2 + 0.08]} t={0.025}>
              {M('stand')}
            </Strut>
          </group>
        ))}
        {[-1, 1].map(sz => (
          <Box key={sz} size={[w - 0.2, 0.025, 0.025]} at={[0, top - 0.025, sz * (d / 2 - 0.08)]}>
            {M('stand')}
          </Box>
        ))}
        {/* The basket: an open box of weave with well rounded corners,
            and the mattress down inside it. */}
        <Hollow size={[w, wall, d]} wall={0.022} radius={Math.min(w, d) * 0.22} floor={0.02} position={[0, top, 0]}>
          {M('basket')}
        </Hollow>
        <Soft size={[w - 0.06, 0.05, d - 0.06]} round={[0.04, 0.02, 0.04]} position={[0, top + 0.045, 0]}>
          {M('mattress')}
        </Soft>
      </group>
    )
  }
  if (style === 'cradle') {
    // A wooden box over two rockers, held on a post at each corner.
    const bottom = 0.14
    const box = Math.max(h - bottom, 0.15)
    const rock = (sx: number): Vec3[] =>
      Array.from({ length: 9 }, (_, i) => {
        const z = -d / 2 - 0.1 + ((d + 0.2) * i) / 8
        return [sx * (w / 2 - 0.08), 0.02 + 0.35 * z * z, z]
      })
    return (
      <group>
        {[-1, 1].map(sx => (
          <group key={sx}>
            <Tube points={rock(sx)} radius={0.016}>
              {M('stand')}
            </Tube>
            {[-1, 1].map(sz => (
              <Box key={sz} size={[0.03, bottom, 0.03]} at={[sx * (w / 2 - 0.08), 0.02, sz * (d / 2 - 0.1)]}>
                {M('stand')}
              </Box>
            ))}
          </group>
        ))}
        <Box size={[w, 0.02, d]} at={[0, bottom, 0]}>
          {M('basket')}
        </Box>
        {[-1, 1].map(sz => (
          <Box key={`l${sz}`} size={[w, box, 0.02]} at={[0, bottom, sz * (d / 2 - 0.01)]}>
            {M('basket')}
          </Box>
        ))}
        {[-1, 1].map(sx => (
          <Box key={`e${sx}`} size={[0.02, box + (sx < 0 ? 0.08 : 0), d - 0.04]} at={[sx * (w / 2 - 0.01), bottom, 0]}>
            {M('basket')}
          </Box>
        ))}
        <Soft size={[w - 0.06, 0.06, d - 0.06]} round={[0.02, 0.02, 0.02]} position={[0, bottom + 0.05, 0]}>
          {M('mattress')}
        </Soft>
      </group>
    )
  }
  // A bedside sleeper: a fabric box on four legs, its front side low so it
  // can stand against the bed.
  const wall = 0.3
  const legs = Math.max(h - wall, 0.1)
  return (
    <group>
      {[-1, 1].flatMap(sx =>
        [-1, 1].map(sz => (
          <Leg
            key={`${sx}${sz}`}
            height={legs}
            top={0.014}
            bottom={0.014}
            position={[sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03)]}
          >
            {M('stand')}
          </Leg>
        )),
      )}
      <Box size={[w, 0.03, d]} at={[0, legs, 0]}>
        {M('stand')}
      </Box>
      <Soft size={[w, wall, 0.03]} round={[0.015, 0.015, 0.012]} position={[0, legs + wall / 2, -d / 2 + 0.015]}>
        {M('basket')}
      </Soft>
      <Soft size={[w, 0.1, 0.03]} round={[0.015, 0.015, 0.012]} position={[0, legs + 0.05, d / 2 - 0.015]}>
        {M('basket')}
      </Soft>
      {[-1, 1].map(sx => (
        <Soft
          key={sx}
          size={[0.03, wall, d]}
          round={[0.012, 0.015, 0.015]}
          position={[sx * (w / 2 - 0.015), legs + wall / 2, 0]}
        >
          {M('basket')}
        </Soft>
      ))}
      <Soft size={[w - 0.07, 0.06, d - 0.07]} round={[0.02, 0.02, 0.02]} position={[0, legs + 0.06, 0]}>
        {M('mattress')}
      </Soft>
    </group>
  )
}

// A loft bed: the mattress up on a frame with a guard round it and a
// ladder, and room underneath. The steel one has a desk under it and its
// ladder at the end, the pine one slatted guards and its ladder at the
// front.
function LoftBed({ p, M, style }: Look) {
  const w = p('width')
  const d = p('depth')
  const h = p('height')
  const pine = style === 'pine'
  const post = pine ? 0.07 : 0.045
  const px = w / 2 - post / 2
  const pz = d / 2 - post / 2
  const deck = h - 0.42
  const rail = pine ? 0.06 : 0.035
  const ladder = 0.42
  // Pine has its ladder in the front guard, near the right end; steel at
  // the right end itself.
  const gap: [number, number] = pine ? [px - post / 2 - ladder, px - post / 2] : [-px, px]
  const steps = Math.max(3, Math.round(deck / 0.28))
  const rungs = Array.from({ length: steps }, (_, i) => ((i + 1) * deck) / steps)
  return (
    <group>
      {[-1, 1].flatMap(sx =>
        [-1, 1].map(sz => (
          <Box key={`${sx}${sz}`} size={[post, h, post]} at={[sx * px, 0, sz * pz]}>
            {M('frame')}
          </Box>
        )),
      )}
      {/* The frame round the deck, and the slats and mattress on it. */}
      {[-1, 1].map(sz => (
        <Box key={`l${sz}`} size={[w - post * 2, 0.1, rail]} at={[0, deck - 0.1, sz * pz]}>
          {M('frame')}
        </Box>
      ))}
      {[-1, 1].map(sx => (
        <Box key={`e${sx}`} size={[rail, 0.1, d - post * 2]} at={[sx * px, deck - 0.1, 0]}>
          {M('frame')}
        </Box>
      ))}
      <Box size={[w - post * 2, 0.02, d - post * 2]} at={[0, deck - 0.02, 0]}>
        {M('frame')}
      </Box>
      <Soft
        size={[w - post * 2 - 0.02, 0.15, d - post * 2 - 0.02]}
        round={[0.04, 0.04, 0.04]}
        position={[0, deck + 0.075, 0]}
      >
        {M('mattress')}
      </Soft>
      {/* The guard: a top rail at the back and both ends, and along the
          front up to the ladder's opening. */}
      <Box size={[w - post * 2, rail, rail]} at={[0, h - rail, -pz]}>
        {M('frame')}
      </Box>
      {[-1, 1].map(sx => (
        <Box key={sx} size={[rail, rail, d - post * 2]} at={[sx * px, h - rail, 0]}>
          {M('frame')}
        </Box>
      ))}
      {pine ? (
        <>
          <Box size={[gap[0] + px - post / 2, rail, rail]} at={[(-px + post / 2 + gap[0]) / 2, h - rail, pz]}>
            {M('frame')}
          </Box>
          {/* Upright slats under the guard rails. */}
          {between(-px, px, Math.round((w - post * 2) / 0.12)).map(x => (
            <group key={x}>
              <Box size={[0.05, h - rail - deck, 0.02]} at={[x, deck, -pz]}>
                {M('frame')}
              </Box>
              {x < gap[0] - 0.03 && (
                <Box size={[0.05, h - rail - deck, 0.02]} at={[x, deck, pz]}>
                  {M('frame')}
                </Box>
              )}
            </group>
          ))}
          {/* The ladder down the front, in the opening. */}
          {[gap[0], gap[1]].map(x => (
            <Box key={x} size={[0.045, h - 0.05, 0.045]} at={[x, 0, pz + 0.05]}>
              {M('frame')}
            </Box>
          ))}
          {rungs.map(y => (
            <Box key={y} size={[ladder, 0.035, 0.035]} at={[(gap[0] + gap[1]) / 2, y - 0.035, pz + 0.05]}>
              {M('frame')}
            </Box>
          ))}
        </>
      ) : (
        <>
          <Box size={[w - post * 2, rail, rail]} at={[0, h - rail, pz]}>
            {M('frame')}
          </Box>
          <Box size={[w - post * 2, rail, rail]} at={[0, (deck + h) / 2, pz]}>
            {M('frame')}
          </Box>
          {/* A ladder up the right end. */}
          {[-1, 1].map(sz => (
            <Box key={sz} size={[0.035, h - 0.05, 0.035]} at={[px + 0.06, 0, sz * 0.18]}>
              {M('frame')}
            </Box>
          ))}
          {rungs.map(y => (
            <Box key={y} size={[0.03, 0.03, 0.36]} at={[px + 0.06, y - 0.03, 0]}>
              {M('frame')}
            </Box>
          ))}
          {/* A desk under the bed: its top runs from the left end of the
              frame, held there on a rail between the two left posts, to a
              side panel standing on the floor, and lies along the back. */}
          {(() => {
            const x0 = -px + post / 2
            const x1 = x0 + w * 0.58
            const z0 = -pz + post / 2
            const deep = d * 0.6
            return (
              <>
                <Box size={[x1 - x0, 0.03, deep]} at={[(x0 + x1) / 2, 0.72, z0 + deep / 2]}>
                  {M('desk')}
                </Box>
                <Box size={[0.03, 0.72, deep]} at={[x1 - 0.015, 0, z0 + deep / 2]}>
                  {M('frame')}
                </Box>
                <Box size={[0.03, 0.04, d - post * 2]} at={[x0 + 0.015, 0.68, 0]}>
                  {M('frame')}
                </Box>
                <Box size={[x1 - x0, 0.04, 0.02]} at={[(x0 + x1) / 2, 0.68, z0 + 0.01]}>
                  {M('frame')}
                </Box>
              </>
            )
          })()}
        </>
      )}
    </group>
  )
}

// A kids sofa: foam play blocks after the Nugget, a little upholstered
// sofa on short legs, or a beanbag.
function KidsSofa({ p, M, style }: Look) {
  const w = p('width')
  const d = p('depth')
  const h = p('height')
  if (style === 'bean') {
    return (
      <group>
        <Soft
          size={[w, h * 0.7, d]}
          round={[w * 0.45, h * 0.32, d * 0.45]}
          puff={[0.02, 0.03, 0.02]}
          wrinkle={0.006}
          position={[0, h * 0.35, 0]}
        >
          {M('base')}
        </Soft>
        <Soft
          size={[w * 0.9, h * 0.62, d * 0.4]}
          round={[w * 0.4, h * 0.28, d * 0.18]}
          wrinkle={0.006}
          position={[0, h * 0.62, -d * 0.28]}
        >
          {M('cushions')}
        </Soft>
      </group>
    )
  }
  if (style === 'mini') {
    const legs = 0.07
    const k = h / 0.5
    const seat = 0.17 * k
    return (
      <group>
        {[-1, 1].flatMap(sx =>
          [-1, 1].map(sz => (
            <Leg
              key={`${sx}${sz}`}
              height={legs}
              top={0.016}
              bottom={0.012}
              position={[sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)]}
            >
              <Material color="#c9a676" material="wood" />
            </Leg>
          )),
        )}
        <Soft size={[w, seat, d]} round={[0.04, 0.04, 0.04]} position={[0, legs + seat / 2, 0]}>
          {M('base')}
        </Soft>
        <Soft
          size={[w - 0.22, 0.09 * k, d - 0.18]}
          round={[0.04, 0.03, 0.04]}
          wrinkle={0.003}
          position={[0, legs + seat + 0.04 * k, 0.04]}
        >
          {M('cushions')}
        </Soft>
        <Soft
          size={[w, h - legs - seat + 0.06, 0.14]}
          round={[0.05, 0.05, 0.05]}
          position={[0, legs + seat + (h - legs - seat) / 2, -d / 2 + 0.07]}
        >
          {M('base')}
        </Soft>
        {[-1, 1].map(sx => (
          <Soft
            key={sx}
            size={[0.11, 0.2 * k, d]}
            round={[0.05, 0.05, 0.05]}
            position={[sx * (w / 2 - 0.055), legs + seat + 0.06 * k, 0]}
          >
            {M('base')}
          </Soft>
        ))}
      </group>
    )
  }
  // Play blocks: a foam base, a seat cushion on it and two triangle pillows
  // leant against the back.
  const base = h * 0.5
  const seat = h * 0.5
  return (
    <group>
      <Soft size={[w, base, d]} round={[0.05, 0.04, 0.05]} position={[0, base / 2, 0]}>
        {M('base')}
      </Soft>
      <Soft size={[w, seat, d * 0.62]} round={[0.05, 0.04, 0.05]} position={[0, base + seat / 2, d * 0.19]}>
        {M('cushions')}
      </Soft>
      {[-1, 1].map(sx => (
        <Soft
          key={sx}
          size={[w / 2 - 0.01, 0.42, 0.2]}
          round={[0.05, 0.06, 0.05]}
          position={[sx * (w / 4), base + 0.19, -d / 2 + 0.16]}
          rotation={[-0.32, 0, 0]}
        >
          {M('base')}
        </Soft>
      ))}
    </group>
  )
}

// A rocking chair: a wooden Windsor rocker, an upholstered nursery glider
// on curved rockers, or a wingback recliner on a plinth.
function RockingChair({ p, M, style }: Look) {
  const w = p('width')
  const d = p('depth')
  const h = p('height')
  const rocker = (sx: number, x: number): Vec3[] =>
    Array.from({ length: 11 }, (_, i) => {
      const z = -d / 2 + (d * i) / 10
      return [sx * x, 0.02 + 0.5 * z * z, z]
    })
  if (style === 'recliner') {
    const seat = 0.42
    return (
      <group>
        <Box size={[w - 0.12, 0.08, d - 0.16]} at={[0, 0, 0]}>
          {M('frame')}
        </Box>
        <Soft
          size={[w - 0.24, 0.18, d * 0.7]}
          round={[0.05, 0.05, 0.05]}
          wrinkle={0.003}
          position={[0, seat - 0.09, 0.06]}
        >
          {M('seat')}
        </Soft>
        <Soft
          size={[w - 0.04, seat - 0.1, d - 0.1]}
          round={[0.05, 0.05, 0.05]}
          position={[0, 0.08 + (seat - 0.18) / 2, 0]}
        >
          {M('seat')}
        </Soft>
        <Soft
          size={[w - 0.06, h - seat + 0.05, 0.22]}
          round={[0.08, 0.07, 0.07]}
          position={[0, seat + (h - seat) / 2 - 0.02, -d / 2 + 0.13]}
          rotation={[-0.1, 0, 0]}
        >
          {M('seat')}
        </Soft>
        {[-1, 1].map(sx => (
          <group key={sx}>
            <Soft
              size={[0.14, 0.3, d * 0.82]}
              round={[0.06, 0.06, 0.06]}
              position={[sx * (w / 2 - 0.07), seat + 0.02, 0.02]}
            >
              {M('seat')}
            </Soft>
            <Soft
              size={[0.12, 0.36, 0.26]}
              round={[0.05, 0.08, 0.08]}
              position={[sx * (w / 2 - 0.08), h - 0.26, -d / 2 + 0.2]}
            >
              {M('seat')}
            </Soft>
          </group>
        ))}
      </group>
    )
  }
  if (style === 'glider') {
    const seat = 0.45
    return (
      <group>
        {[-1, 1].map(sx => (
          <group key={sx}>
            <Tube points={rocker(sx, w / 2 - 0.08)} radius={0.02}>
              {M('frame')}
            </Tube>
            {[-1, 1].map(sz => (
              <Box key={sz} size={[0.035, 0.22, 0.035]} at={[sx * (w / 2 - 0.08), 0.06, sz * (d / 2 - 0.2)]}>
                {M('frame')}
              </Box>
            ))}
          </group>
        ))}
        <Soft size={[w - 0.04, 0.2, d * 0.75]} round={[0.05, 0.05, 0.05]} position={[0, 0.28 + 0.1, 0.02]}>
          {M('seat')}
        </Soft>
        <Soft
          size={[w - 0.24, 0.12, d * 0.62]}
          round={[0.05, 0.04, 0.05]}
          wrinkle={0.003}
          position={[0, seat + 0.03, 0.06]}
        >
          {M('seat')}
        </Soft>
        <Soft
          size={[w - 0.08, h - seat + 0.04, 0.18]}
          round={[0.08, 0.08, 0.07]}
          position={[0, seat + (h - seat) / 2, -d / 2 + 0.17]}
          rotation={[-0.16, 0, 0]}
        >
          {M('seat')}
        </Soft>
        {[-1, 1].map(sx => (
          <Soft
            key={sx}
            size={[0.12, 0.26, d * 0.72]}
            round={[0.05, 0.06, 0.05]}
            position={[sx * (w / 2 - 0.06), seat + 0.06, 0.02]}
          >
            {M('seat')}
          </Soft>
        ))}
      </group>
    )
  }
  // The Windsor: a saddle seat on four legs on the rockers, a back of
  // spindles under a curved top rail, and arms on short posts.
  const seat = 0.43
  const back = -d * 0.24
  return (
    <group>
      {[-1, 1].map(sx => (
        <group key={sx}>
          <Tube points={rocker(sx, w / 2 - 0.05)} radius={0.016}>
            {M('frame')}
          </Tube>
          {[-1, 1].map(sz => (
            <Strut
              key={sz}
              from={[sx * (w / 2 - 0.05), 0.04, sz * d * 0.22]}
              to={[sx * (w / 2 - 0.09), seat, sz * d * 0.2]}
              t={0.03}
            >
              {M('frame')}
            </Strut>
          ))}
        </group>
      ))}
      <Slab size={[w - 0.08, 0.04, d * 0.58]} radius={0.08} bevel={0.012} position={[0, seat, 0.02]}>
        {M('frame')}
      </Slab>
      <group position={[0, seat + 0.04, back]} rotation={[-0.14, 0, 0]}>
        {between(-(w / 2 - 0.08), w / 2 - 0.08, 5).map(x => (
          <mesh key={x} position={[x, (h - seat - 0.1) / 2, 0]} castShadow>
            <cylinderGeometry args={[0.009, 0.011, h - seat - 0.1, 10]} />
            {M('frame')}
          </mesh>
        ))}
        {[-1, 1].map(sx => (
          <mesh key={sx} position={[sx * (w / 2 - 0.06), (h - seat - 0.05) / 2, 0]} castShadow>
            <cylinderGeometry args={[0.015, 0.017, h - seat - 0.05, 12]} />
            {M('frame')}
          </mesh>
        ))}
        <Slab size={[w - 0.04, 0.07, 0.035]} radius={0.015} bevel={0.006} position={[0, h - seat - 0.1, 0]}>
          {M('frame')}
        </Slab>
      </group>
      {[-1, 1].map(sx => (
        <group key={sx}>
          <Box size={[0.05, 0.025, d * 0.5]} at={[sx * (w / 2 - 0.04), seat + 0.24, 0]}>
            {M('frame')}
          </Box>
          <mesh position={[sx * (w / 2 - 0.05), seat + 0.12, d * 0.2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.24, 10]} />
            {M('frame')}
          </mesh>
        </group>
      ))}
    </group>
  )
}

// A sound machine by a child's bed. The glow dome lights in its color as it
// plays, the pixel player lights a little face on its screen, and the
// story cube lights a ring round its top.
function SoundMachine({ p, c, M, style, state, on }: Look) {
  const s = p('size')
  const lit = useEased(on ? (state?.level ?? 1) : 0, 6)
  const [r, g, b] = state?.glow ?? [1, 0.82, 0.6]
  const glow: Vec3 = [r, g, b]
  if (style === 'pixel') {
    const h = s * 0.95
    const dd = s * 0.62
    // A small face drawn in a five by five grid.
    const face = ['.....', '.x.x.', '.....', 'x...x', '.xxx.']
    const cell = (s * 0.62) / 5
    return (
      <group>
        <Slab size={[s, h, dd]} radius={s * 0.12} bevel={s * 0.04} position={[0, 0, 0]}>
          {M('body')}
        </Slab>
        <mesh position={[0, h * 0.52, dd / 2 + 0.001]}>
          <planeGeometry args={[s * 0.72, s * 0.72]} />
          {M('top')}
        </mesh>
        {face.flatMap((row, i) =>
          [...row].map((ch, j) =>
            ch === 'x' ? (
              <mesh key={`${i}${j}`} position={[(j - 2) * cell, h * 0.52 + (2 - i) * cell, dd / 2 + 0.002]}>
                <planeGeometry args={[cell * 0.8, cell * 0.8]} />
                <meshStandardMaterial color="#3a3d40" emissive={glow} emissiveIntensity={1.4 * lit} />
              </mesh>
            ) : null,
          ),
        )}
        {[-1, 1].map(sx => (
          <mesh key={sx} position={[sx * s * 0.28, h + 0.008, 0]}>
            <cylinderGeometry args={[s * 0.1, s * 0.1, 0.016, 20]} />
            {M('top')}
          </mesh>
        ))}
        <Halo
          on={on}
          position={[0, h * 0.5, dd / 2 + 0.05]}
          color={`rgb(${r * 255},${g * 255},${b * 255})`}
          intensity={0.04}
        />
      </group>
    )
  }
  if (style === 'cube') {
    return (
      <group>
        <Soft size={[s, s, s]} round={[s * 0.18, s * 0.18, s * 0.18]} position={[0, s / 2, 0]}>
          {M('body')}
        </Soft>
        {/* A ring round the top that lights while it plays. */}
        <mesh position={[0, s + 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[s * 0.3, s * 0.03, 8, 32]} />
          <meshStandardMaterial color="#e9e4dc" emissive={glow} emissiveIntensity={1.2 * lit} />
        </mesh>
        {/* Two ears on its top corners, and a little figure stood on it. */}
        {[-1, 1].map(sx => (
          <Soft
            key={sx}
            size={[s * 0.22, s * 0.16, s * 0.22]}
            round={[s * 0.08, s * 0.07, s * 0.08]}
            position={[sx * s * 0.34, s + s * 0.05, -s * 0.3]}
          >
            {M('body')}
          </Soft>
        ))}
        <mesh position={[0, s + s * 0.16, 0]}>
          <cylinderGeometry args={[s * 0.12, s * 0.14, s * 0.3, 16]} />
          {M('top')}
        </mesh>
        <mesh position={[0, s + s * 0.4, 0]}>
          <sphereGeometry args={[s * 0.13, 16, 12]} />
          <Material color={c('top')} material="matte" />
        </mesh>
        <Halo on={on} position={[0, s + 0.05, 0]} color={`rgb(${r * 255},${g * 255},${b * 255})`} intensity={0.04} />
      </group>
    )
  }
  // The glow dome: a round base with an opal dome on top.
  const base = s * 0.3
  return (
    <group>
      <mesh position={[0, base / 2, 0]} castShadow>
        <cylinderGeometry args={[s * 0.46, s / 2, base, SEG]} />
        {M('body')}
      </mesh>
      <mesh position={[0, base, 0]}>
        <sphereGeometry args={[s * 0.44, SEG, SEG / 2, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={c('top')} emissive={glow} emissiveIntensity={1.1 * lit} roughness={0.6} />
      </mesh>
      <Halo
        on={on}
        position={[0, base + s * 0.3, 0]}
        color={`rgb(${r * 255},${g * 255},${b * 255})`}
        intensity={0.06}
        distance={0.8}
      />
    </group>
  )
}
