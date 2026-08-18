const DATE_HEADERS = ['дата', 'дата операции', 'дата платежа', 'date', 'operation date', 'payment date']
const AMOUNT_HEADERS = ['сумма', 'сумма операции', 'amount', 'operation amount', 'итого']
const DESCRIPTION_HEADERS = ['описание', 'описание операции', 'назначение', 'детали', 'description', 'details', 'merchant']
const INCOME_HEADERS = ['доход', 'поступление', 'credit', 'income']
const EXPENSE_HEADERS = ['расход', 'списание', 'debit', 'expense']

function normaliseHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex(header => aliases.includes(normaliseHeader(header)))
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  const delimiter = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ','
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim())
      if (row.some(value => value)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell.trim())
  if (row.some(value => value)) rows.push(row)
  return rows
}

function parseDate(value) {
  const raw = String(value ?? '').trim()
  const iso = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  const ru = raw.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/)
  if (!ru) return null
  const year = ru[3].length === 2 ? `20${ru[3]}` : ru[3]
  return `${year}-${ru[2].padStart(2, '0')}-${ru[1].padStart(2, '0')}`
}

function parseAmount(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const negative = raw.includes('-') || /^\(.*\)$/.test(raw)
  const number = Number(raw.replace(/[^0-9,.-]/g, '').replace(',', '.'))
  if (!Number.isFinite(number) || number === 0) return null
  return negative ? -Math.abs(number) : number
}

function valueAt(row, index) {
  return index >= 0 ? row[index] : ''
}

export async function parseStatementCsv(file) {
  const text = await file.text()
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('В файле нет операций для импорта')

  const headers = rows[0]
  const dateIndex = findHeaderIndex(headers, DATE_HEADERS)
  const amountIndex = findHeaderIndex(headers, AMOUNT_HEADERS)
  const descriptionIndex = findHeaderIndex(headers, DESCRIPTION_HEADERS)
  const incomeIndex = findHeaderIndex(headers, INCOME_HEADERS)
  const expenseIndex = findHeaderIndex(headers, EXPENSE_HEADERS)

  if (dateIndex < 0 || (amountIndex < 0 && incomeIndex < 0 && expenseIndex < 0)) {
    throw new Error('Не нашли столбцы с датой и суммой. Подойдёт CSV с колонками «Дата» и «Сумма».')
  }

  const imported = []
  let skipped = 0
  for (const row of rows.slice(1)) {
    const date = parseDate(valueAt(row, dateIndex))
    const directAmount = parseAmount(valueAt(row, amountIndex))
    const income = parseAmount(valueAt(row, incomeIndex))
    const expense = parseAmount(valueAt(row, expenseIndex))
    const amount = directAmount ?? (income ? Math.abs(income) : expense ? -Math.abs(expense) : null)
    if (!date || !amount) {
      skipped += 1
      continue
    }

    imported.push({
      date,
      amount: Math.abs(amount),
      type: amount > 0 ? 'income' : 'expense',
      note: valueAt(row, descriptionIndex) || 'Операция из выписки',
    })
  }

  if (!imported.length) throw new Error('Не удалось распознать ни одной операции в файле')
  return { rows: imported, skipped }
}

function textRows(items) {
  const grouped = new Map()
  for (const item of items) {
    const y = Math.round(item.transform[5])
    const row = grouped.get(y) ?? []
    row.push({ x: item.transform[4], text: item.str })
    grouped.set(y, row)
  }
  return [...grouped.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function parseTinkoffStatementLines(lines) {
  const startsOperation = /^(\d{2}\.\d{2}\.\d{2})(?:\s+\d{2}:\d{2})?\s+\d{2}\.\d{2}\.\d{2}\s+(.+)$/
  const rows = []
  let current = null

  const finishCurrent = () => {
    if (!current) return
    const amountMatches = [...current.text.matchAll(/([+-]?\s*\d[\d\s]*[.,]\d{2})\s*₽/g)]
    if (amountMatches.length) {
      const rawAmount = amountMatches[0][1]
      const amount = parseAmount(rawAmount)
      if (amount) {
        const note = current.text
          .replace(/([+-]?\s*\d[\d\s]*[.,]\d{2})\s*₽/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        rows.push({
          date: current.date,
          amount: Math.abs(amount),
          type: rawAmount.includes('+') ? 'income' : 'expense',
          note: note || 'Операция из выписки Т-Банка',
        })
      }
    }
    current = null
  }

  for (const line of lines) {
    const match = line.match(startsOperation)
    if (match) {
      finishCurrent()
      current = { date: parseDate(match[1]), text: match[2] }
    } else if (current && !/^Дата и время|^операции|^Расходы:|^Операции по карте|^Выписка по договору/.test(line)) {
      current.text += ` ${line}`
    }
  }
  finishCurrent()
  return rows.filter(row => row.date)
}

async function parseTinkoffStatementPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const rows = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    rows.push(...parseTinkoffStatementLines(textRows(content.items)))
  }

  if (!rows.length) {
    throw new Error('Не нашли операций в PDF. Сейчас поддерживается текстовая выписка Т-Банка.')
  }
  return { rows, skipped: 0 }
}

export function parseStatementFile(file) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  return isPdf ? parseTinkoffStatementPdf(file) : parseStatementCsv(file)
}

const CATEGORY_KEYWORDS = {
  'Еда': ['еда', 'продукт', 'ресторан', 'кафе', 'coffee', 'market', 'pizza', 'food'],
  'Транспорт': ['такси', 'яндекс go', 'uber', 'metro', 'транспорт', 'азс', 'gas'],
  'Жильё': ['жкх', 'аренда', 'квартира', 'дом', 'rent', 'utility'],
  'Развлечения': ['кино', 'театр', 'игра', 'steam', 'netflix', 'подписк'],
  'Здоровье': ['аптека', 'врач', 'клиник', 'health', 'pharmacy'],
  'Зарплата': ['зарплата', 'salary', 'аванс'],
}

export function suggestCategoryId(categories, transaction) {
  const description = transaction.note.toLowerCase()
  const category = categories.find(item =>
    CATEGORY_KEYWORDS[item.name]?.some(keyword => description.includes(keyword))
  )
  return category?.id ?? categories.find(item => item.name === 'Прочее')?.id ?? null
}
