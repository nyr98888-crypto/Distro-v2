import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { t } = useLanguage()
  const { loginWithGoogle, loginWithFacebook } = useAuth()

  return (
    <div className="flex min-h-full items-center justify-center bg-warm-mist px-4 py-10">
      <div className="card w-full max-w-md p-8 shadow-modal">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-deep-slate text-xl font-bold text-white">
            D
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('appName')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('loginSubtitle')}</p>
        </div>

        <div className="space-y-3">
          <button type="button" className="btn-primary w-full" onClick={loginWithGoogle}>
            {t('loginWithGoogle')}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={loginWithFacebook}>
            {t('loginWithFacebook')}
          </button>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          {t('loginAutoExtensionHint')}
        </p>
      </div>
    </div>
  )
}
