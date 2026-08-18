export const dynamic = 'force-dynamic'

export function GET() {
  const env = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  }

  const payload = JSON.stringify(env).replace(/</g, '\\u003c')

  return new Response(`globalThis.__PUBLIC_ENV__ = Object.freeze(${payload});`, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
