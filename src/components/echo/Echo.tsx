/**
 * Echo — RadarIQ's only chat entry point.
 * Manages bubble open/close, unread tracking, and feedback toggle.
 */
import { useEffect, useRef, useState } from 'react'
import { EchoBubble } from './EchoBubble'
import { EchoPanel } from './EchoPanel'

const OPEN_FEEDBACK_EVENT = 'echo:open-feedback'
export const ECHO_TOGGLE_EVENT = 'echo:toggle'
export const ECHO_STATE_EVENT = 'echo:state'

export function openEchoFeedback() {
  window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT))
}

/** Toggle Echo open/closed from anywhere (e.g. the mobile bottom nav). */
export function toggleEcho() {
  window.dispatchEvent(new CustomEvent(ECHO_TOGGLE_EVENT))
}

export function Echo() {
  const [open, setOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const lastSeenIdRef = useRef<string | null>(null)

  useEffect(() => {
    const handler = () => { setOpen(true) }
    window.addEventListener(OPEN_FEEDBACK_EVENT, handler)
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, handler)
  }, [])

  // Allow MobileBottomNav (and any future caller) to toggle Echo externally.
  useEffect(() => {
    const handler = () => {
      setOpen((o) => {
        const next = !o
        if (next) setHasUnread(false)
        return next
      })
    }
    window.addEventListener(ECHO_TOGGLE_EVENT, handler)
    return () => window.removeEventListener(ECHO_TOGGLE_EVENT, handler)
  }, [])

  // Broadcast state so external buttons can reflect open/closed.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(ECHO_STATE_EVENT, { detail: { open } }))
  }, [open])

  const handleToggle = () => {
    setOpen((o) => {
      const next = !o
      if (next) setHasUnread(false)
      return next
    })
  }

  // Called by the panel whenever a new assistant message arrives.
  const handleAssistantMessage = (id: string) => {
    if (!open) setHasUnread(true)
    else lastSeenIdRef.current = id
  }

  return (
    <>
      <EchoBubble open={open} hasUnread={hasUnread} onToggle={handleToggle} />
      {open && (
        <EchoPanel
          onClose={() => setOpen(false)}
          onAssistantMessage={handleAssistantMessage}
        />
      )}
    </>
  )
}
