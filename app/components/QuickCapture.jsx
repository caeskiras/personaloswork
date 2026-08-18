'use client'

import { useRef, useState } from 'react'
import { Check, Mic, Send, Sparkles, X } from 'lucide-react'
import { useOS } from '../../lib/store'
import { parseQuickCapture } from '../../lib/quick-capture'
import { tasksRepo } from '../../lib/db/tasks'
import { foodEntriesRepo } from '../../lib/db/foodEntries'
import { transactionsRepo } from '../../lib/db/transactions'
import { workoutsRepo } from '../../lib/db/workouts'
import { meetingsRepo } from '../../lib/db/meetings'

const ICON = { meeting: '🗓️', food: '🍽️', expense: '💳', workout: '⚡', task_complete: '✓', task: '☑' }

function localIso(date, time) {
  return new Date(`${date}T${time}:00`).toISOString()
}

export default function QuickCapture() {
  const { userId } = useOS()
  const [text, setText] = useState('')
  const [proposals, setProposals] = useState([])
  const [listening, setListening] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const recognitionRef = useRef(null)

  const parse = () => {
    const parsed = parseQuickCapture(text)
    setProposals(parsed)
    setNotice(null)
  }

  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) { setNotice('Голосовой ввод доступен в Chrome или Edge.'); return }
    const recognition = new Recognition()
    recognition.lang = 'ru-RU'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = event => setText(prev => `${prev} ${event.results[0][0].transcript}`.trim())
    recognition.onerror = () => setNotice('Не удалось распознать голос. Проверьте доступ к микрофону.')
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const confirm = async () => {
    if (!userId || proposals.some(p => p.valid === false)) return
    setSaving(true); setNotice(null)
    try {
      for (const proposal of proposals) {
        if (proposal.kind === 'meeting') {
          const startAt = localIso(proposal.date, proposal.time)
          await meetingsRepo.create(userId, { guest_name: proposal.person, start_at: startAt, end_at: new Date(new Date(startAt).getTime() + 30 * 60000).toISOString(), status: 'confirmed' })
        } else if (proposal.kind === 'food') {
          await foodEntriesRepo.create(userId, { name: proposal.title, calories: proposal.calories, protein: proposal.protein, carbs: proposal.carbs, fat: proposal.fat, mealType: 'snack', date: proposal.date, time: null })
        } else if (proposal.kind === 'expense') {
          await transactionsRepo.create(userId, { type: 'expense', amount: proposal.amount, note: proposal.title, date: proposal.date })
        } else if (proposal.kind === 'workout') {
          await workoutsRepo.create(userId, { typeName: proposal.title, duration: proposal.duration, date: proposal.date })
        } else if (proposal.kind === 'task_complete') {
          const tasks = await tasksRepo.list(userId)
          const query = proposal.title.toLowerCase()
          const task = tasks.find(item => !item.done && (item.title.toLowerCase().includes(query) || query.includes(item.title.toLowerCase())))
          if (!task) throw new Error(`Не нашёл незавершённую задачу «${proposal.title}».`)
          await tasksRepo.toggleComplete(task.id, task.done)
        } else {
          await tasksRepo.create(userId, { title: proposal.title, due_date: proposal.date })
        }
      }
      setNotice('Готово: изменения сохранены.')
      setText(''); setProposals([])
    } catch (error) {
      setNotice(error.message || 'Не удалось сохранить изменения.')
    } finally { setSaving(false) }
  }

  return (
    <section className="bg-card border border-border-2 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[#6c63ff]" />
        <h2 className="text-sm font-semibold text-text">Быстрый ввод</h2>
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && parse()} placeholder="Например: купил шоколадку за 120 рублей и съел её" className="min-w-0 flex-1 bg-bg border border-border-2 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-[#6c63ff]/60" />
        <button type="button" title="Продиктовать" onClick={startVoice} className={`w-10 h-10 grid place-items-center border border-border-2 rounded-lg transition-colors ${listening ? 'text-danger border-danger/50' : 'text-subtle hover:text-text'}`}><Mic className="w-4 h-4" /></button>
        <button type="button" title="Разобрать запись" onClick={parse} disabled={!text.trim()} className="w-10 h-10 grid place-items-center bg-[#6c63ff] text-white rounded-lg disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </div>
      {proposals.length > 0 && <div className="mt-3 flex flex-col gap-2">
        {proposals.map((proposal, index) => <div key={`${proposal.kind}-${index}`} className="flex items-center gap-3 bg-surface border border-border rounded-lg px-3 py-2">
          <span>{ICON[proposal.kind]}</span><div className="min-w-0 flex-1"><p className="text-sm text-text truncate">{proposal.title}</p><p className={`text-xs ${proposal.valid === false ? 'text-warning' : 'text-subtle'}`}>{proposal.detail}</p></div>
        </div>)}
        <div className="flex gap-2 pt-1"><button onClick={() => setProposals([])} className="px-3 py-1.5 text-xs text-subtle hover:text-text"><X className="inline w-3.5 h-3.5 mr-1" />Отменить</button><button onClick={confirm} disabled={saving || proposals.some(p => p.valid === false)} className="px-3 py-1.5 text-xs font-medium bg-[#6c63ff] text-white rounded-lg disabled:opacity-40"><Check className="inline w-3.5 h-3.5 mr-1" />{saving ? 'Сохраняю...' : 'Подтвердить'}</button></div>
      </div>}
      {notice && <p className={`mt-3 text-xs ${notice.startsWith('Готово') ? 'text-success' : 'text-warning'}`}>{notice}</p>}
    </section>
  )
}
