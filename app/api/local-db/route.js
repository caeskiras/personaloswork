import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001'
const MODULE_IDS = [
  'tasks', 'habits', 'fitness', 'nutrition', 'sleep', 'finance',
  'journal', 'goals', 'focus', 'projects', 'calendar',
]

const dataRoot = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'PersonalOS', 'data')
  : path.join(process.cwd(), '.local-data')
const dataFile = path.join(dataRoot, 'personalos-data.json')
const backupFile = path.join(dataRoot, 'personalos-data.backup.json')
const tempFile = path.join(dataRoot, 'personalos-data.tmp.json')

let writeQueue = Promise.resolve()

function localModeDisabled() {
  return process.env.NEXT_PUBLIC_LOCAL_MODE !== 'true'
}

function notFound() {
  return Response.json({ error: { message: 'Not found' } }, { status: 404 })
}

function initialDatabase() {
  const now = new Date().toISOString()
  return {
    user_profiles: [{
      id: crypto.randomUUID(),
      user_id: LOCAL_USER_ID,
      username: 'Игор',
      display_name: 'Игор',
      onboarding_completed: true,
      theme: 'system',
      created_at: now,
      updated_at: now,
    }],
    user_modules: MODULE_IDS.map((module_id, position) => ({
      id: crypto.randomUUID(),
      user_id: LOCAL_USER_ID,
      module_id,
      is_active: true,
      position,
      created_at: now,
      updated_at: now,
    })),
  }
}

async function readDatabase() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      try {
        return JSON.parse(await readFile(backupFile, 'utf8'))
      } catch { /* fall through to a fresh local profile */ }
    }
    return initialDatabase()
  }
}

async function writeDatabase(database) {
  await mkdir(dataRoot, { recursive: true })
  try { await copyFile(dataFile, backupFile) } catch { /* first write has no backup */ }
  await writeFile(tempFile, JSON.stringify(database, null, 2), 'utf8')
  await rename(tempFile, dataFile)
}

function matches(row, filters = []) {
  return filters.every(({ type, column, value }) => {
    if (type === 'eq') return row[column] === value
    if (type === 'neq') return row[column] !== value
    if (type === 'in') return Array.isArray(value) && value.includes(row[column])
    if (type === 'gte') return row[column] >= value
    if (type === 'gt') return row[column] > value
    if (type === 'lte') return row[column] <= value
    if (type === 'lt') return row[column] < value
    if (type === 'is') return row[column] === value
    return true
  })
}

function sortRows(rows, orders = []) {
  return [...rows].sort((a, b) => {
    for (const { column, ascending = true, nullsFirst = false } of orders) {
      const av = a[column]
      const bv = b[column]
      if (av == null || bv == null) {
        if (av == null && bv == null) continue
        const result = av == null ? (nullsFirst ? -1 : 1) : (nullsFirst ? 1 : -1)
        return ascending ? result : -result
      }
      if (av < bv) return ascending ? -1 : 1
      if (av > bv) return ascending ? 1 : -1
    }
    return 0
  })
}

function projectRow(row, columns, database, table) {
  if (!columns || columns === '*') return { ...row }
  const result = {}
  if (columns.includes('*')) Object.assign(result, row)
  for (const token of columns.split(',').map(part => part.trim())) {
    if (!token || token === '*' || token.includes('(')) continue
    result[token] = row[token]
  }
  if (table === 'workouts' && columns.includes('workout_types')) {
    result.workout_types = (database.workout_types ?? []).find(type => type.id === row.type_id) ?? null
  }
  return result
}

function normalizeRows(values) {
  const now = new Date().toISOString()
  return (Array.isArray(values) ? values : [values]).map(value => ({
    id: value.id ?? crypto.randomUUID(),
    created_at: value.created_at ?? now,
    updated_at: now,
    ...value,
  }))
}

function cascadeDelete(database, table, removedRows) {
  const ids = new Set(removedRows.map(row => row.id))
  if (table === 'tasks') {
    database.subtasks = (database.subtasks ?? []).filter(row => !ids.has(row.task_id))
  } else if (table === 'habits') {
    database.habit_completions = (database.habit_completions ?? []).filter(row => !ids.has(row.habit_id))
  } else if (table === 'goals') {
    database.goal_milestones = (database.goal_milestones ?? []).filter(row => !ids.has(row.goal_id))
  } else if (table === 'booking_links') {
    database.availability_rules = (database.availability_rules ?? []).filter(row => !ids.has(row.link_id))
    database.meetings = (database.meetings ?? []).map(row => ids.has(row.link_id) ? { ...row, link_id: null } : row)
  }
}

async function execute(operation) {
  const database = await readDatabase()
  const table = operation.table
  const rows = database[table] ?? []
  let result = []
  let changed = false

  if (operation.action === 'select') {
    result = rows.filter(row => matches(row, operation.filters))
  } else if (operation.action === 'insert') {
    result = normalizeRows(operation.values)
    database[table] = [...rows, ...result]
    changed = true
  } else if (operation.action === 'update') {
    const now = new Date().toISOString()
    database[table] = rows.map(row => {
      if (!matches(row, operation.filters)) return row
      const updated = { ...row, ...operation.values, updated_at: now }
      result.push(updated)
      return updated
    })
    changed = true
  } else if (operation.action === 'delete') {
    result = rows.filter(row => matches(row, operation.filters))
    database[table] = rows.filter(row => !matches(row, operation.filters))
    cascadeDelete(database, table, result)
    changed = true
  } else if (operation.action === 'upsert') {
    const incoming = normalizeRows(operation.values)
    const keys = (operation.onConflict || 'id').split(',').map(key => key.trim())
    database[table] = [...rows]
    for (const value of incoming) {
      const index = database[table].findIndex(row => keys.every(key => row[key] === value[key]))
      if (index >= 0) {
        const updated = { ...database[table][index], ...value, id: database[table][index].id, updated_at: new Date().toISOString() }
        database[table][index] = updated
        result.push(updated)
      } else {
        database[table].push(value)
        result.push(value)
      }
    }
    changed = true
  } else {
    return { data: null, error: { message: `Unsupported local action: ${operation.action}` } }
  }

  if (changed) await writeDatabase(database)

  result = sortRows(result, operation.orders)
  if (Number.isInteger(operation.limit)) result = result.slice(0, operation.limit)
  result = result.map(row => projectRow(row, operation.columns, database, table))

  if (operation.mode === 'single') {
    return result.length === 1
      ? { data: result[0], error: null }
      : { data: result[0] ?? null, error: result.length ? null : { message: 'No local record found' } }
  }
  if (operation.mode === 'maybeSingle') {
    return { data: result[0] ?? null, error: null }
  }
  return { data: result, error: null }
}

export async function POST(request) {
  if (localModeDisabled()) return notFound()
  try {
    const operation = await request.json()
    const run = () => execute(operation)
    const result = operation.action === 'select'
      ? await writeQueue.then(run)
      : await (writeQueue = writeQueue.then(run, run))
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json(
      { data: null, error: { message: error?.message ?? 'Local database error' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export function GET() {
  if (localModeDisabled()) return notFound()
  return Response.json(
    { service: 'personalos-local', status: 'ready' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
