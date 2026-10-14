// The pointers a piece has asked to keep from the camera, by id. A press on
// a piece that can be dragged, like a blind, is asked for the moment it goes
// down, and the camera leaves it alone while the piece makes up its mind.
// A press that runs along the piece's travel stays the piece's until it is
// let go. Any other is given back, and the camera turns from there.
export const held = new Set<number>()

// When a piece was last let go after a drag. The browser still makes a
// click of that release, and the click is not a press on the piece.
let droppedAt = -Infinity

export function dropped() {
  droppedAt = performance.now()
}

// Whether a click now is the tail of a drag that just ended.
export function justDropped() {
  return performance.now() - droppedAt < 400
}
