// ─── Feature flags ────────────────────────────────────────────────────────────

/**
 * Cloud mode (default) → Supabase Auth; userId = auth.uid().
 * Local mode           → offline local session; userId = NEXT_PUBLIC_DEV_USER_ID.
 */
export const LOCAL_MODE = process.env.NEXT_PUBLIC_LOCAL_MODE === 'true'
export const AUTH_ENABLED = !LOCAL_MODE
