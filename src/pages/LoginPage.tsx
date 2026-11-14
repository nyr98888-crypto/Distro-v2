import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { BrandLogo } from '../components/BrandLogo'
import { appConfig } from '../lib/config'
import { isExtensionBridgePresent } from '../lib/extensionBridge'

function authQueryErrorMessage(code: string | null, locale: string): string | null {
  if (!code || code === 'connected') return null
  if (locale === 'he') {
    switch (code) {
      case 'error':
        return 'ספק ההתחברות החזיר שגיאה. נסו שוב.'
      case 'invalid_state':
        return 'בקשת ההתחברות לא תקינה או פגה. נסו שוב.'
      case 'token_failed':
        return 'קבלת אסימון ההתחברות נכשלה. בדקו את הגדרות Google OAuth ב־Vercel.'
      default:
        return `ההתחברות נכשלה (${code}).`
    }
  }
  switch (code) {
    case 'error':
      return 'The OAuth provider returned an error. Please try again.'
    case 'invalid_state':
      return 'Login request was invalid or expired. Please try again.'
    case 'token_failed':
      return 'Failed to obtain an auth token. Check Google OAuth settings on Vercel.'
    default:
      return `Sign-in failed (${code}).`
  }
}

/** Only click #1 of the product: Google sign-in. Everything else is automatic. */
export function LoginPage() {
  const { t, locale } = useLanguage()
  const { loginWithGoogle } = useAuth()
  const [authError, setAuthError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [extensionReady, setExtensionReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const auth = params.get('auth')
    const message = authQueryErrorMessage(auth, locale)
    if (message) {
      setAuthError(message)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [locale])

  useEffect(() => {
    const sync = () => setExtensionReady(isExtensionBridgePresent())
    sync()
    const onMsg = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (data?.source === 'distro-extension' && data?.type === 'DISTRO_EXTENSION_READY') {
        setExtensionReady(true)
      }
    }
    window.addEventListener('message', onMsg)
    const t1 = window.setTimeout(sync, 600)
    const t2 = window.setTimeout(sync, 2200)
    return () => {
      window.removeEventListener('message', onMsg)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  async function handleGoogle() {
    setAuthError(null)
    setPending(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-warm-mist px-4 py-10">
      <div className="card w-full max-w-md p-8 shadow-modal">
        <div className="mb-8 text-center">
          <BrandLogo size={72} rounded="rounded-2xl" className="mx-auto mb-4 shadow-sm" />
          <h1 className="text-2xl font-semibold text-slate-900">{t('appName')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('loginSubtitle')}</p>
        </div>

        <button
          type="button"
          className="btn-primary w-full"
          disabled={pending}
          onClick={() => void handleGoogle()}
        >
          {pending ? '…' : t('loginWithGoogle')}
        </button>

        <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
          {extensionReady
            ? 'התוסף זוהה — אחרי Google החיבור והקבוצות רצים אוטומטית ברקע.'
            : t('loginAutoExtensionHint')}
        </p>

        {!extensionReady && (
          <p className="mt-2 text-center text-[11px] text-slate-400">
            <a
              className="underline hover:text-slate-600"
              href={appConfig.extensionStoreUrl}
              target="_blank"
              rel="noreferrer"
            >
              Distro v1.0.9
            </a>
          </p>
        )}

        {authError ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            {authError}
          </div>
        ) : null}

        <p className="mt-6 text-center text-xs text-slate-400">
          <a href="/privacy" className="text-brand-indigo hover:underline">
            {t('privacyPolicy')}
          </a>
        </p>
      </div>
    </div>
  )
}
