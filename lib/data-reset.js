import { supabase } from './supabase'

const RESET_TABLES = {
  tasks: ['subtasks', 'tasks'],
  habits: ['habit_completions', 'habits'],
  focus: ['focus_sessions'],
  fitness: ['workouts'],
  nutrition: ['food_entries'],
  sleep: ['sleep_entries'],
  finance: ['transactions', 'finance_budgets'],
  journal: ['journal_entries'],
  calendar: ['meetings'],
  projects: ['projects'],
  goals: ['goal_milestones', 'goals'],
}

export const RESET_MODULE_LABELS = {
  tasks: 'задачи и подзадачи', habits: 'привычки и отметки', focus: 'сессии фокуса',
  fitness: 'тренировки', nutrition: 'записи питания', sleep: 'записи сна',
  finance: 'операции и бюджеты', journal: 'записи дневника', calendar: 'встречи',
  projects: 'проекты', goals: 'цели и этапы', all: 'все записи во всех модулях',
}

function tablesFor(scope) {
  if (scope !== 'all') return RESET_TABLES[scope] ?? []
  return [...new Set(Object.values(RESET_TABLES).flat())]
}

export async function resetModuleRecords(userId, scope) {
  const tables = tablesFor(scope)
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw error
  }
}
