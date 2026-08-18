'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

export default function ResetPasswordScreen() {
  const router    = useRouter()
  const { updatePassword } = useAuth()

  const [password,   setPassword]   = useState('')
  const [password2,  setPassword2]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [done,       setDone]       = useState(false)
  const [checking,   setChecking]   = useState(true)
  const [linkError,  setLinkError]  = useState('')
  // True when Supabase has restored the recovery session from the email link
  const [ready,      setReady]      = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    const hash = new URLSearchParams(url.hash.slice(1))
    const linkErrorDescription = hash.get('error_description') || url.searchParams.get('error_description')
    const hasRecoveryToken = Boolean(
      url.searchParams.get('code') ||
      (hash.get('access_token') && hash.get('type') === 'recovery')
    )

    if (linkErrorDescription) {
      setLinkError(decodeURIComponent(linkErrorDescription.replace(/\+/g, ' ')))
      setChecking(false)
      return undefined
    }

    if (!hasRecoveryToken) {
      setLinkError('Эта страница открывается только по ссылке из письма для сброса пароля.')
      setChecking(false)
      return undefined
    }

    let isActive = true
    let timeoutId

    const markReady = () => {
      if (!isActive) return
      setReady(true)
      setChecking(false)
      clearTimeout(timeoutId)
    }

    // Supabase fires PASSWORD_RECOVERY when the page loads with the recovery token in the URL hash.
    // The client parses the hash automatically and fires onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') markReady()
      // If already signed in (e.g. navigated here from settings), allow too
      if (event === 'SIGNED_IN') markReady()
    })
    // Also check current session — user might already be authenticated via recovery link
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady()
    }).catch(() => {
      if (isActive) setLinkError('Не удалось проверить ссылку. Попробуйте запросить новую.')
    })

    timeoutId = setTimeout(() => {
      if (!isActive) return
      setLinkError('Ссылка недействительна или срок её действия истёк. Запросите новую ссылку.')
      setChecking(false)
    }, 10000)

    return () => {
      isActive = false
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  const submit = async () => {
    if (password.length < 6) { setError('Пароль — минимум 6 символов'); return }
    if (password !== password2) { setError('Пароли не совпадают'); return }
    setError('')
    setSubmitting(true)
    try {
      const { error: authError } = await updatePassword(password)
      if (authError) { setError(authError.message); return }
      setDone(true)
      // Redirect to /home after 2s
      setTimeout(() => router.replace('/home'), 2000)
    } catch (err) {
      setError(err?.message ?? 'Не удалось сохранить пароль')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center text-xl font-bold text-white">P</div>
          <span className="text-text font-semibold tracking-widest text-sm uppercase">Personal OS</span>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center text-2xl">✓</div>
            <div>
              <p className="text-text font-semibold mb-1">Пароль обновлён</p>
              <p className="text-subtle text-sm">Перенаправляем в приложение…</p>
            </div>
          </div>
        ) : linkError ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <div>
              <p className="text-text font-semibold mb-2">Не удалось открыть сброс пароля</p>
              <p className="text-subtle text-sm">{linkError}</p>
            </div>
            <Link href="/auth/forgot" className="text-sm text-accent hover:text-accent-light transition-colors">
              Запросить новую ссылку
            </Link>
          </div>
        ) : checking && !ready ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <p className="text-subtle text-sm">Проверяем ссылку сброса…</p>
          </div>
        ) : (
          <>
            <h2 className="text-text font-semibold text-lg mb-1">Новый пароль</h2>
            <p className="text-subtle text-sm mb-6">Придумайте новый пароль для вашего аккаунта.</p>

            <div className="flex flex-col gap-3 mb-4">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Новый пароль"
                autoComplete="new-password"
                autoFocus
                className="bg-surface border border-border rounded-xl px-4 py-3 text-text text-sm outline-none focus:border-accent transition-colors placeholder:text-subtle"
              />
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="Повторите пароль"
                autoComplete="new-password"
                className="bg-surface border border-border rounded-xl px-4 py-3 text-text text-sm outline-none focus:border-accent transition-colors placeholder:text-subtle"
              />
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl text-danger text-sm">
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || !password || !password2}
              className="w-full bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
            >
              {submitting ? 'Сохранение...' : 'Сохранить пароль'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
