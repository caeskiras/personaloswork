import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_REQUESTS_PER_HOUR = 20
const requestWindows = new Map()

function rateLimit(userId) {
  const now = Date.now()
  const windowStart = now - 60 * 60 * 1000
  const requests = (requestWindows.get(userId) ?? []).filter(time => time > windowStart)
  if (requests.length >= MAX_REQUESTS_PER_HOUR) return false
  requests.push(now)
  requestWindows.set(userId, requests)
  return true
}

async function getUser(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !url || !anonKey) return null

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

export async function POST(request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'Анализ фото пока не настроен. Добавьте GEMINI_API_KEY в Railway.' }, { status: 503 })
  }

  try {
    const user = await getUser(request)
    if (!user) return Response.json({ error: 'Нужно снова войти в аккаунт.' }, { status: 401 })
    if (!rateLimit(user.id)) return Response.json({ error: 'Лимит анализа фото на этот час исчерпан. Попробуйте позже.' }, { status: 429 })

    const formData = await request.formData()
    const image = formData.get('image')
    if (!(image instanceof File) || !image.type.startsWith('image/')) {
      return Response.json({ error: 'Загрузите изображение блюда.' }, { status: 400 })
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: 'Размер фото не должен превышать 5 МБ.' }, { status: 413 })
    }

    const imageData = Buffer.from(await image.arrayBuffer()).toString('base64')
    const model = process.env.GEMINI_NUTRITION_MODEL || 'gemini-2.5-flash'
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'Ты оцениваешь пищевую ценность блюд по фотографии. Оцени всю видимую порцию. Если размер порции неясен, выбирай консервативную оценку. Не идентифицируй людей. Все строки для пользователя пиши по-русски.' }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Определи блюдо на фото и оцени калории и БЖУ всей порции. Верни только JSON без Markdown: {"name":"название блюда","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":"low|medium|high","note":"краткая оговорка об оценке"}. Все числа неотрицательные.' },
              { inlineData: { mimeType: image.type, data: imageData } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
      },
    )

    if (!response.ok) {
      console.error('Gemini nutrition request failed', response.status, await response.text())
      return Response.json({ error: 'Не удалось распознать блюдо. Попробуйте другое фото.' }, { status: 502 })
    }

    const payload = await response.json()
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('')
    const estimate = JSON.parse(text)
    if (!estimate.name || !['calories', 'protein', 'carbs', 'fat'].every(key => Number.isFinite(Number(estimate[key])) && Number(estimate[key]) >= 0)) {
      throw new Error('Invalid Gemini nutrition response')
    }
    return Response.json({ estimate })
  } catch (error) {
    console.error('Nutrition analysis failed', error)
    return Response.json({ error: 'Не удалось обработать фото. Попробуйте ещё раз.' }, { status: 500 })
  }
}
