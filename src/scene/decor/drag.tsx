import { decorationVariant, paramValue, screenSize, type DecorationKind } from '#/decoration/catalog.ts'
import { dropped, held } from '#/scene/drags.ts'
import { multiTouchSince } from '#/scene/touches.ts'
import type { DecorationConfig } from '#/types.ts'
import { Html } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Vector3, type Group } from 'three'

type Vec3 = [number, number, number]

// Where the edge of a cover that moves is when it is shut and when it is
// open, in the piece's own frame, and how far that edge reaches either way
// from its middle. A finger that drags the edge moves the cover with it.
export type Travel = { shut: Vec3; open: Vec3; span: Vec3 }

// What a drag on a piece does: whether one may start now, and what to do
// with the level it was let go at.
export type DragAction = { may: () => boolean; drop: (level: number) => void }

// Only the covers that run along a line, which a finger can follow. A door
// or a window swings, and a drag on one turns the camera as before.
export function travelOf(kind: DecorationKind, item: DecorationConfig): Travel | null {
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const style = decorationVariant(kind, item.variant)?.id ?? ''
  switch (kind.id) {
    case 'blind': {
      // The bottom rail, under the shutter's box or the blind's head rail.
      const top = style === 'shutter' ? 0.13 : 0.06
      const z = style === 'shutter' ? 0.1 : 0.08
      return { shut: [0, -top - p('drop'), z], open: [0, -top, z], span: [p('width') / 2, 0, 0] }
    }
    case 'projector_screen': {
      // The weighted bar along the bottom of the sheet.
      const [w, h] = screenSize(p('inches'))
      return { shut: [0, -0.09, 0.04], open: [0, -0.09 - h, 0.04], span: [w / 2, 0, 0] }
    }
    case 'garage_door':
      return { shut: [0, 0, 0.12], open: [0, p('height'), 0.12], span: [p('width') / 2, 0, 0] }
    case 'awning': {
      // The front profile, out along the arms at the awning's pitch.
      const pitch = style === 'pergola' ? 0.1 : 0.25
      const reach = p('drop')
      return {
        shut: [0, -0.1, 0.15],
        open: [0, -0.1 - reach * Math.sin(pitch), 0.15 + reach * Math.cos(pitch)],
        span: [p('width') / 2, 0, 0],
      }
    }
    case 'sliding_door': {
      // The far edge of the panel that runs the furthest, the one a hand
      // pulls it by.
      const h = p('height')
      const side = p('flip') > 0.5 ? -1 : 1
      const count = Math.max(1, Math.round(p('panels')))
      const run = p('width') - 0.1
      const panelW = run / count
      const steps = count === 1 ? 1 - 0.06 / panelW : count - 1
      const x = (-side * run) / 2
      const z = (count * 0.035 + 0.03) / 2 + 0.02
      return { shut: [x, h / 2, z], open: [x + side * steps * panelW, h / 2, z], span: [0, h / 2, 0] }
    }
    default:
      return null
  }
}

// How far a press moves before it is read as a drag, or as the camera's.
const SLOP_PX = 8
// A press held still this long is a long press, never a drag.
const LONG_PRESS_MS = 500
// A cover whose whole travel is shorter than this on screen is too small to
// drag, and a press on it turns the camera.
const MIN_TRAVEL_PX = 24
// How close to either end a drop is taken as that end.
const END = 0.02
// How long a sent level waits for the cover to start moving, and is kept
// once it stops short of it.
const SETTLE_MS = 3000

const clamp = (v: number) => Math.min(Math.max(v, 0), 1)

// A press on a cover that runs along its travel on screen, up and down for a
// blind, moves the cover with it, and letting go sends it there. A press
// that runs across it, or is held still first, is left to the camera and to
// the long press. While the cover travels to where it was sent, a mark shows
// where it is going, and the piece shows where it really is.
//
// The frame is the group the piece is drawn in, which the travel is in.
export function useDrag(travel: Travel | null, level: number, text: string | undefined, action?: DragAction) {
  const frame = useRef<Group>(null)
  const camera = useThree(state => state.camera)
  const gl = useThree(state => state.gl)
  const [dragged, setDragged] = useState<number | null>(null)
  const [sent, setSent] = useState<number | null>(null)
  // Read when a drag starts, so the drag starts where the cover is.
  const latest = useRef(level)
  useLayoutEffect(() => {
    latest.current = level
  })
  const end = useRef<(() => void) | null>(null)
  // The pointer being followed. A press is handed to the piece once for each
  // of its parts under it, and only the first starts a drag.
  const following = useRef<number | null>(null)
  useEffect(() => () => end.current?.(), [])

  const moving = text === 'opening' || text === 'closing'
  const arrived = sent !== null && Math.abs(level - sent) < 0.015
  useEffect(() => {
    if (sent === null || (moving && !arrived)) return
    const timer = setTimeout(() => setSent(null), arrived ? 0 : SETTLE_MS)
    return () => clearTimeout(timer)
  }, [sent, moving, arrived])

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const down = e.nativeEvent
    const piece = frame.current
    if (!travel || !action || !piece || down.button !== 0) return
    if (end.current && following.current === down.pointerId) return
    if (!action.may()) return
    end.current?.()
    const rect = gl.domElement.getBoundingClientRect()
    const onScreen = (v: Vec3) => {
      const p = piece.localToWorld(new Vector3(...v)).project(camera)
      return [rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height]
    }
    const [ax, ay] = onScreen(travel.shut)
    const [bx, by] = onScreen(travel.open)
    const ux = bx - ax
    const uy = by - ay
    const length = Math.hypot(ux, uy)
    if (length < MIN_TRAVEL_PX) return
    const id = down.pointerId
    const sx = down.clientX
    const sy = down.clientY
    const at = performance.now()
    const from = latest.current
    const page = gl.domElement.ownerDocument
    const view = page.defaultView ?? window
    let mine = false
    const levelAt = (x: number, y: number) => {
      const v = clamp(from + ((x - sx) * ux + (y - sy) * uy) / (length * length))
      return v < END ? 0 : v > 1 - END ? 1 : v
    }
    const stop = () => {
      held.delete(id)
      page.removeEventListener('pointermove', onMove, { capture: true })
      page.removeEventListener('pointerup', onUp, { capture: true })
      page.removeEventListener('pointercancel', onUp, { capture: true })
      view.removeEventListener('blur', onBlur)
      if (mine) document.body.style.cursor = ''
      end.current = null
      following.current = null
    }
    const give = () => {
      stop()
      if (mine) setDragged(null)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== id) return
      // A second finger makes it a pinch, and the camera's.
      if (multiTouchSince(at)) return give()
      const dx = event.clientX - sx
      const dy = event.clientY - sy
      if (!mine) {
        if (Math.hypot(dx, dy) < SLOP_PX) return
        const along = Math.abs(dx * ux + dy * uy) / length
        const across = Math.abs(dx * uy - dy * ux) / length
        if (along < across || performance.now() - at > LONG_PRESS_MS) return give()
        mine = true
        document.body.style.cursor = 'grabbing'
      }
      setDragged(levelAt(event.clientX, event.clientY))
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== id) return
      const was = mine
      give()
      if (!was) return
      dropped()
      if (event.type === 'pointercancel') return
      const to = levelAt(event.clientX, event.clientY)
      setSent(to)
      action.drop(to)
    }
    const onBlur = () => give()
    held.add(id)
    page.addEventListener('pointermove', onMove, { capture: true })
    page.addEventListener('pointerup', onUp, { capture: true })
    page.addEventListener('pointercancel', onUp, { capture: true })
    view.addEventListener('blur', onBlur)
    end.current = give
    following.current = id
  }

  return {
    frame,
    dragged,
    // Where the cover was sent, until it gets there or stops short.
    sent: sent !== null && !arrived && dragged === null ? sent : null,
    onPointerDown: travel && action ? onPointerDown : undefined,
  }
}

const at = (travel: Travel, level: number): Vec3 => [
  travel.shut[0] + (travel.open[0] - travel.shut[0]) * level,
  travel.shut[1] + (travel.open[1] - travel.shut[1]) * level,
  travel.shut[2] + (travel.open[2] - travel.shut[2]) * level,
]

const THICK = 0.014

// What a drag shows on the piece: the level under the finger while it drags,
// and a line where the cover was sent while it travels there.
export function DragMarks({ travel, dragged, sent }: { travel: Travel; dragged: number | null; sent: number | null }) {
  const size: Vec3 = [
    Math.max(Math.abs(travel.span[0]) * 2, THICK),
    Math.max(Math.abs(travel.span[1]) * 2, THICK),
    THICK,
  ]
  return (
    <>
      {sent !== null && (
        <mesh position={at(travel, sent)} renderOrder={1}>
          <boxGeometry args={size} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} />
        </mesh>
      )}
      {dragged !== null && (
        <Html position={at(travel, dragged)} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(0, 0, 0, 0.65)',
              color: '#fff',
              font: '600 12px/1.4 Montserrat, system-ui, sans-serif',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {Math.round(dragged * 100)}%
          </div>
        </Html>
      )}
    </>
  )
}
