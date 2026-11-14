import { useEffect, useState } from 'react'
import { consumeHandshakeFlag, useAuth } from '../context/AuthContext'

/** Tiny auto-dismiss status — never a setup/connect CTA. */
export function ExtensionConnectedBanner() {
  const { extensionHandshakeOk } = useAuth()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const justConnected = consumeHandshakeFlag()
    if (!justConnected) return
    setVisible(true)
    const hide = window.setTimeout(() => setVisible(false), 2800)
    return () => window.clearTimeout(hide)
  }, [extensionHandshakeOk])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div
        role="status"
        className="w-full max-w-md rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-modal"
      >
        מחובר לתוסף — לחצו «משוך וסנכרן» בתוסף ואז רענון בקבוצות
      </div>
    </div>
  )
}
