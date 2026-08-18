'use client'

import { useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { useOS } from '../../lib/store'
import { RESET_MODULE_LABELS, resetModuleRecords } from '../../lib/data-reset'

export default function DataResetControl({ scope, settings = false, onDone }) {
  const { userId } = useOS()
  const [step, setStep] = useState(0)
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const label = RESET_MODULE_LABELS[scope] ?? 'записи модуля'

  const close = () => { if (!saving) { setStep(0); setTyped(''); setError(null) } }
  const erase = async () => {
    if (!userId || typed !== 'СБРОСИТЬ') return
    setSaving(true); setError(null)
    try {
      await resetModuleRecords(userId, scope)
      setSaving(false); setStep(0); setTyped('')
      onDone?.()
    } catch (err) {
      setError(err.message || 'Не удалось удалить записи.')
      setSaving(false)
    }
  }

  return <>
    {settings ? (
      <button onClick={() => setStep(1)} className="w-full flex items-center justify-between px-5 py-4 text-danger hover:bg-danger/5 transition-colors text-left">
        <div><p className="text-sm font-medium">Удалить все записи</p><p className="text-xs text-subtle mt-0.5">Очистить данные модулей, сохранив аккаунт и настройки</p></div>
        <Trash2 className="w-4 h-4" />
      </button>
    ) : (
      <button onClick={() => setStep(1)} title="Сбросить записи модуля" className="fixed right-4 bottom-4 z-30 flex items-center gap-2 px-3 py-2 text-xs text-danger bg-card border border-danger/30 rounded-lg shadow-lg hover:bg-danger/10 transition-colors">
        <Trash2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Сбросить записи</span>
      </button>
    )}
    {step > 0 && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-card border border-border-2 rounded-xl p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" /><div><h2 className="text-base font-semibold text-text">Удалить {label}?</h2><p className="text-sm text-subtle mt-1">Это действие нельзя отменить.</p></div></div><button onClick={close} className="text-subtle hover:text-text"><X className="w-4 h-4" /></button></div>
        {step === 1 ? <div className="flex justify-end gap-2 mt-6"><button onClick={close} className="px-3 py-2 text-sm text-subtle hover:text-text">Отмена</button><button onClick={() => setStep(2)} className="px-3 py-2 text-sm font-medium bg-danger text-white rounded-lg hover:opacity-90">Продолжить</button></div> : <>
          <p className="text-sm text-text mt-5">Для окончательного подтверждения введи <span className="font-semibold">СБРОСИТЬ</span>.</p>
          <input autoFocus value={typed} onChange={e => setTyped(e.target.value)} className="w-full mt-3 bg-bg border border-border-2 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-danger/60" />
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 mt-5"><button onClick={close} disabled={saving} className="px-3 py-2 text-sm text-subtle hover:text-text">Отмена</button><button onClick={erase} disabled={saving || typed !== 'СБРОСИТЬ'} className="px-3 py-2 text-sm font-medium bg-danger text-white rounded-lg disabled:opacity-40">{saving ? 'Удаляем...' : 'Удалить записи'}</button></div>
        </>}
      </div>
    </div>}
  </>
}
