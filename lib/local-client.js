const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001'
const LOCAL_SESSION = {
  access_token: 'local-offline-session',
  user: {
    id: LOCAL_USER_ID,
    email: 'local@personal-os',
    created_at: '2026-01-01T00:00:00.000Z',
  },
}

class LocalQuery {
  constructor(table) {
    this.operation = {
      table,
      action: 'select',
      columns: '*',
      filters: [],
      orders: [],
      limit: null,
      mode: 'many',
    }
  }

  select(columns = '*') { this.operation.columns = columns; return this }
  insert(values) { this.operation.action = 'insert'; this.operation.values = values; return this }
  update(values) { this.operation.action = 'update'; this.operation.values = values; return this }
  delete() { this.operation.action = 'delete'; return this }
  upsert(values, options = {}) {
    this.operation.action = 'upsert'
    this.operation.values = values
    this.operation.onConflict = options.onConflict
    return this
  }
  eq(column, value) { this.operation.filters.push({ type: 'eq', column, value }); return this }
  neq(column, value) { this.operation.filters.push({ type: 'neq', column, value }); return this }
  in(column, value) { this.operation.filters.push({ type: 'in', column, value }); return this }
  gt(column, value) { this.operation.filters.push({ type: 'gt', column, value }); return this }
  gte(column, value) { this.operation.filters.push({ type: 'gte', column, value }); return this }
  lt(column, value) { this.operation.filters.push({ type: 'lt', column, value }); return this }
  lte(column, value) { this.operation.filters.push({ type: 'lte', column, value }); return this }
  is(column, value) { this.operation.filters.push({ type: 'is', column, value }); return this }
  order(column, options = {}) { this.operation.orders.push({ column, ...options }); return this }
  limit(value) { this.operation.limit = value; return this }
  single() { this.operation.mode = 'single'; return this.execute() }
  maybeSingle() { this.operation.mode = 'maybeSingle'; return this.execute() }

  async execute() {
    try {
      const response = await fetch('/api/local-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.operation),
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok && !result.error) result.error = { message: 'Local database request failed' }
      return result
    } catch (error) {
      return { data: null, error: { message: error?.message ?? 'Local database request failed' } }
    }
  }

  then(resolve, reject) { return this.execute().then(resolve, reject) }
}

const auth = {
  async getSession() { return { data: { session: LOCAL_SESSION }, error: null } },
  async getUser() { return { data: { user: LOCAL_SESSION.user }, error: null } },
  onAuthStateChange() {
    return { data: { subscription: { unsubscribe() {} } } }
  },
  async signInWithPassword() { return { data: { user: LOCAL_SESSION.user, session: LOCAL_SESSION }, error: null } },
  async signUp() { return { data: { user: LOCAL_SESSION.user, session: LOCAL_SESSION }, error: null } },
  async signOut() { return { error: null } },
  async resend() { return { data: {}, error: null } },
  async resetPasswordForEmail() { return { data: {}, error: null } },
  async updateUser() { return { data: { user: LOCAL_SESSION.user }, error: null } },
}

export function createLocalClient() {
  return {
    auth,
    from(table) { return new LocalQuery(table) },
  }
}
