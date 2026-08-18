export function getTodayStr() {
  const d   = new Date()
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function groupTasks(tasks) {
  const today = getTodayStr()
  const active = tasks.filter(t => t.status !== 'done')
  const done   = tasks.filter(t => t.status === 'done')
  return {
    overdue:  active.filter(t => t.due_date && t.due_date < today),
    today:    active.filter(t => t.due_date === today),
    upcoming: active.filter(t => t.due_date && t.due_date > today),
    noDate:   active.filter(t => !t.due_date),
    done,
  }
}

// Today View: только задачи с due_date = сегодня или просроченные (без срока — не включаем)
export function getTodayAndOverdue(tasks) {
  const today = getTodayStr()
  return tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date <= today)
}

export function formatDueDate(due_date) {
  if (!due_date) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = new Date(due_date + 'T00:00:00')
  const diff = Math.round((due - now) / 86400000)
  if (diff < 0) return `Просрочено ${Math.abs(diff)} дн.`
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Завтра'
  return due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function isOverdue(due_date) {
  if (!due_date) return false
  return due_date < getTodayStr()
}

export function calculateNextDueDate(dueDateStr, recurrence) {
  const base = dueDateStr ? new Date(dueDateStr + 'T00:00:00') : new Date()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const next = new Date(base)

  switch (recurrence) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      while (next <= today) next.setDate(next.getDate() + 1)
      return localDateString(next)
    case 'weekly':
      next.setDate(next.getDate() + 7)
      while (next <= today) next.setDate(next.getDate() + 7)
      return localDateString(next)
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      while (next <= today) next.setMonth(next.getMonth() + 1)
      return localDateString(next)
    default:
      return null
  }
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
