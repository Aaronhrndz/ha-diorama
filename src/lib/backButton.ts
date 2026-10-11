import { useEffect, useRef, useState } from 'react'

// The key the card marks its own entry in the browser's history with.
const KEY = 'floorplanRoom'
// Each card on the page gets its own mark, as every card is its own React
// root and React's ids would repeat.
let cards = 0

// While a room is in view, the card adds an entry to the browser's history,
// with the same address, so the back button, a phone's own among them,
// takes the camera back to the whole home instead of leaving the page. Home
// Assistant does the same for its dialogs. Flying on to another room keeps
// that one entry, and going home any other way takes it back off.
export function useBackToHome(inRoom: boolean, goHome: () => void, enabled = true) {
  const [id] = useState(() => ++cards)
  // Whether the entry this card added is still in the history.
  const added = useRef(false)
  const home = useRef(goHome)
  useEffect(() => {
    home.current = goHome
  })

  useEffect(() => {
    if (!enabled) return
    const ours = () => (history.state as Record<string, unknown> | null)?.[KEY] === id
    if (inRoom && !added.current) {
      history.pushState({ [KEY]: id }, '')
      added.current = true
    } else if (!inRoom && added.current) {
      added.current = false
      // Only while the entry is still on top, so a page gone on from it
      // since is never sent back.
      if (ours()) history.back()
    }
  }, [inRoom, enabled, id])

  useEffect(() => {
    if (!enabled) return
    const onPop = () => {
      if (!added.current || (history.state as Record<string, unknown> | null)?.[KEY] === id) return
      added.current = false
      home.current()
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [enabled, id])
}
