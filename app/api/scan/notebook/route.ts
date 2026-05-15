import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

type Section = 'damage' | 'expiring' | 'discount'

const CATEGORIES = 'Grocery, Fresh Food, Toiletries, Baby, Health & Beauty, 3F, Cashier, Household'

const SHARED_RULES = `
Rules:
- Return ONLY a valid JSON array. No markdown, no code fences, no explanation.
- Extract EVERY row visible in the image — do not stop early.
- If a field is not visible, use "" for strings and 0 for numbers.
- For "barcode": read the barcode number or SKU exactly as printed. Use "" if none visible.
- For "category": infer from the product type. Must be one of: ${CATEGORIES}. Use your best judgement.
- For prices: extract numbers only, no currency symbols.
- If no records found, return [].`

const PROMPTS: Record<Section, string> = {
  damage: `You are a data extraction assistant for Foodco Arulogun retail store.
Extract ALL damage records from this image. This may be a handwritten notebook, printed list, or product labels.

Return a JSON array where each object has exactly these fields:
- "barcode": barcode number or SKU printed on label/sheet (string, "" if not visible)
- "description": product name exactly as written (string)
- "quantity": number of damaged units (number, default 1)
- "price": unit price in naira (number, 0 if not shown)
- "reason": damage condition e.g. Broken, Spillage, Pest damage, Wet, Expired, Transit damage (string)
- "category": department — must be one of: ${CATEGORIES} (string, infer from product)
- "notes": any extra notes visible (string, "" if none)
${SHARED_RULES}

Example: [{"barcode":"6001234567890","description":"Milo 400g","quantity":2,"price":1200,"reason":"Pest damage","category":"Grocery","notes":"shelf 3"}]`,

  expiring: `You are a data extraction assistant for Foodco Arulogun retail store.
Extract ALL about-to-expire product records from this image. This may be a handwritten notebook, product labels, or a printed expiry report.

Return a JSON array where each object has exactly these fields:
- "barcode": barcode number or SKU printed on label/sheet (string, "" if not visible)
- "description": product name exactly as written (string)
- "quantity": number of units (number, default 1)
- "price": unit price in naira (number, 0 if not shown)
- "expiry_date": expiry date in YYYY-MM-DD format — look for "EXP", "BB", "Use by", "Best before" (string, "" if not visible)
- "category": department — must be one of: ${CATEGORIES} (string, infer from product)
- "notes": any extra notes visible (string, "" if none)
${SHARED_RULES}

Example: [{"barcode":"6009876543210","description":"Peak Milk 400g","quantity":6,"price":950,"expiry_date":"2025-06-15","category":"Grocery","notes":""}]`,

  discount: `You are a data extraction assistant for Foodco Arulogun retail store.
Extract ALL discount or price-markdown records from this image. This may be a handwritten list, printed markdown sheet, or product labels.

Return a JSON array where each object has exactly these fields:
- "barcode": barcode number or SKU printed on label/sheet (string, "" if not visible)
- "description": product name exactly as written (string)
- "quantity": number of units (number, default 1)
- "original_price": original unit price in naira before discount (number, 0 if not shown)
- "name": discount label or reason e.g. Flash Sale, Clearance, Markdown, Near Expiry (string)
- "category": department — must be one of: ${CATEGORIES} (string, infer from product)
- "notes": any extra notes visible (string, "" if none)
${SHARED_RULES}

Example: [{"barcode":"6005432167890","description":"Bournvita 500g","quantity":4,"original_price":2400,"name":"Clearance","category":"Grocery","notes":"near expiry"}]`,
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { image, mimeType, section } = await req.json() as {
      image:    string
      mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      section:  Section
    }

    if (!image || !mimeType || !section) {
      return NextResponse.json({ error: 'image, mimeType, and section are required' }, { status: 400 })
    }
    if (!['damage', 'expiring', 'discount'].includes(section)) {
      return NextResponse.json({ error: 'section must be damage, expiring, or discount' }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature:     0.1,   // low temperature = consistent structured output
        maxOutputTokens: 8192,
      },
    })

    const result = await model.generateContent([
      { inlineData: { mimeType, data: image } },
      PROMPTS[section],
    ])

    const raw = result.response.text()

    // Strip any markdown fences the model might still add
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

    let records: unknown[]
    try {
      records = JSON.parse(cleaned)
      if (!Array.isArray(records)) records = []
    } catch {
      records = []
    }

    return NextResponse.json({ records, count: records.length })

  } catch (err: unknown) {
    console.error('[scan/notebook] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
