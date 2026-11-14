import { useEffect, useState } from 'react'
import { consumeHandshakeFlag, useAuth } from '../context/AuthContext'
import { syncSessionToExtension } from '../lib/extensionBridge'

/**
 * Shown once after Google OAuth returns (?auth=connected) and the v1.0.9
 * extension handshake completes (or is retried).
 */
export function ExtensionConnectedBanner() {
  const { extensionHandshakeOk } = useAuth()
  const [visible, setVisible] = useState(false)
  const [ok, setOk] = useState<boolean | null>(null)

  useEffect(() => {
    const justConnected = consumeHandshakeFlag()
    if (!justConnected && extensionHandshakeOk !== true) return

    setVisible(true)
    setOk(extensionHandshakeOk)

    if (extensionHandshakeOk !== true) {
      void syncSessionToExtension().then((synced) => setOk(synced))
    }
  }, [extensionHandshakeOk])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div
        role="status"
        className={`flex w-full max-w-lg items-start gap-3 rounded-xl border px-4 py-3 shadow-modal ${
          ok === false
            ? 'border-amber-200 bg-amber-50 text-amber-950'
            : 'border-emerald-200 bg-emerald-50 text-emerald-950'
        }`}
      >
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          {ok === false ? (
            <>
              התחברתם בהצלחה ל־Distro. לא זוהה אישור מהתוסף — ודאו ש־
              <strong> Distro v1.0.9 </strong>
              מותקן ופעיל, ואז לחצו &quot;סנכרון מחדש&quot; בהגדרות.
            </>
          ) : (
            <>מחובר בהצלחה — התוסף v1.0.9 סונכרן</>
          )}
          <div className="mt-1 text-xs opacity-80">DISTRO Smart Group Campaign Manager · v1.0.9</div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
          onClick={() => setVisible(false)}
        >
          סגור
        </button>
      </div>
    </div>
  )
}
