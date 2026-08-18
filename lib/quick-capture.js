import { getTodayStr } from './tasks-selectors'

const MONTHS = {
  января: 0, январь: 0, февраля: 1, февраль: 1, марта: 2, март: 2,
  апреля: 3, апрель: 3, мая: 4, май: 4, июня: 5, июнь: 5,
  июля: 6, июль: 6, августа: 7, август: 7, сентября: 8, сентябрь: 8,
  октября: 9, октябрь: 9, ноября: 10, ноябрь: 10, декабря: 11, декабрь: 11,
}

function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function findDate(text) {
  const today = new Date()
  if (/\bсегодня\b/i.test(text)) return getTodayStr()
  if (/\bзавтра\b/i.test(text)) {
    today.setDate(today.getDate() + 1)
    return dateString(today)
  }
  const match = text.match(/\b(\d{1,2})\s+(января?|февраля?|марта?|апреля?|мая?|июня?|июля?|августа?|сентября?|октября?|ноября?|декабря?)\b/i)
  if (!match) return getTodayStr()
  const year = today.getFullYear()
  const date = new Date(year, MONTHS[match[2].toLowerCase()], Number(match[1]))
  if (date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) date.setFullYear(year + 1)
  return dateString(date)
}

function findTime(text) {
  const match = text.match(/\b(?:в\s+(\d{1,2})(?::(\d{2}))?|(?:(\d{1,2})\s*(?:час(?:а|ов)?|ч\.?)|\b(\d{1,2}):(\d{2})))\b/i)
  const hours = match?.[1] ?? match?.[3] ?? match?.[4]
  const minutes = match?.[2] ?? match?.[5] ?? '00'
  if (!hours || Number(hours) > 23 || Number(minutes) > 59) return null
  return `${String(hours).padStart(2, '0')}:${minutes}`
}

function findAmount(text) {
  const match = text.match(/(?:за|на|потратил(?:а)?\s*)?\s*(\d+(?:[\s,.]\d{3})*(?:[,.]\d{1,2})?)\s*(?:₽|руб(?:лей|ля|\.?)?)/i)
  return match ? Number(match[1].replace(/\s/g, '').replace(',', '.')) : null
}

function stripCommand(text, expression) {
  return text.replace(expression, '').replace(/\s+/g, ' ').trim().replace(/[,.]+$/, '')
}

/** Converts frequent Russian diary phrases into records that still need confirmation. */
export function parseQuickCapture(text) {
  const value = text.trim()
  if (!value) return []
  const proposals = []
  const date = findDate(value)

  if (/\b(встреч[ауие]|договорил[а-я]*\s+о\s+встрече)\b/i.test(value)) {
    const time = findTime(value)
    const person = value.match(/\b(?:с|со)\s+([А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+)?)/)?.[1] || 'Встреча'
    proposals.push({
      kind: 'meeting', title: `Встреча: ${person}`, date, time,
      detail: time ? `${date} в ${time}` : `${date}, время нужно указать`,
      valid: Boolean(time), person,
    })
  }

  const food = value.match(/\b(?:съел(?:а)?|поел(?:а)?|съела|съели)\s+(.+?)(?=$|[.;]|\b(?:купил(?:а)?|сделал(?:а)?\s+тренировк|выполнил(?:а)?))\b/i)
  if (food) {
    const name = stripCommand(food[1], /\b(?:сегодня|завтра)\b/gi) || 'Приём пищи'
    const isChocolate = /шоколад/i.test(name)
    proposals.push({
      kind: 'food', title: name[0].toUpperCase() + name.slice(1), date,
      detail: isChocolate ? 'Оценка: 550 ккал на 100 г, проверьте порцию' : 'Калории и БЖУ можно добавить в питании',
      calories: isChocolate ? 550 : 0, protein: isChocolate ? 7 : 0, carbs: isChocolate ? 55 : 0, fat: isChocolate ? 35 : 0,
    })
  }

  if (/\b(купил(?:а)?|заплатил(?:а)?|потратил(?:а)?)\b/i.test(value)) {
    const amount = findAmount(value)
    const note = stripCommand(value, /\b(?:купил(?:а)?|заплатил(?:а)?|потратил(?:а)?)\b/i)
      .replace(/\b(?:за|на)\s+\d+(?:[\s,.]\d{3})*(?:[,.]\d{1,2})?\s*(?:₽|руб(?:лей|ля|\.?)?)/i, '').trim() || 'Покупка'
    proposals.push({ kind: 'expense', title: note[0].toUpperCase() + note.slice(1), date, amount, detail: amount ? `${amount} ₽` : 'Сумму нужно указать', valid: Boolean(amount) })
  }

  const workout = value.match(/\b(?:сделал(?:а)?\s+)?(тренировк\w*|пробежк\w*|бег|йог\w*|плавани\w*)\b/i)
  if (workout) {
    const duration = Number(value.match(/\b(\d{1,3})\s*(?:мин(?:ут[ы]?)?|м\b)/i)?.[1] || 0)
    const typeName = /бег|пробеж/i.test(workout[1]) ? 'Бег' : /йог/i.test(workout[1]) ? 'Йога' : /плаван/i.test(workout[1]) ? 'Плавание' : 'Тренировка'
    proposals.push({ kind: 'workout', title: typeName, date, duration, detail: duration ? `${duration} мин` : 'Длительность можно добавить' })
  }

  const task = value.match(/\b(?:выполнил(?:а)?|закончил(?:а)?|сделал(?:а)?)\s+(?:задач[ау]\s*)?(.+)/i)
  if (task && !workout && !/\b(купил|съел|встреч)/i.test(value)) {
    const title = stripCommand(task[1], /\b(?:сегодня|завтра)\b/gi)
    if (title) proposals.push({ kind: 'task_complete', title, date, detail: 'Отметим существующую задачу выполненной' })
  }

  if (proposals.length === 0) proposals.push({ kind: 'task', title: value, date, detail: 'Создадим как задачу на сегодня' })
  return proposals
}
