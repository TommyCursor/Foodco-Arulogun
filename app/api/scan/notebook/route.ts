import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createClient } from '@/lib/supabase/server'

type Section = 'damage' | 'expiring' | 'discount'

const PROMPTS: Record<Section, string> = {
  damage: `You are a data extraction assistant for Foodco Arulogun retail store.
Extract all damage records from this notebook/document image.
Return a JSON array. Each object must have exactly these fields:
- "description": product name (string)
- "quantity": number of damaged units (number, default 1 if unclear)
- "price": unit price in naira (number, use 0 if not shown)
- "reason": damage reason such as "Spillage", "Pest damage", "Expiry write-off", "Transit damage" (string)
- "notes": any extra notes (string, use "" if none)

Rules:
- Return ONLY the JSON array, no explanation, no markdown, no code fences.
- If no records found, return [].
- Keep description exactly as written in the notebook.
Example: [{"description":"Milo 400g","quantity":2,"price":1200,"reason":"Pest damage","notes":"shelf 3"}]`,

  expiring: `You are a data extraction assistant for Foodco Arulogun retail store.
Extract all about-to-expire product records from this notebook/document image.
Return a JSON array. Each object must have exactly these fields:
- "description": product name (string)
- "quantity": number of units (number, default 1 if unclear)
- "price": unit price in naira (number, use 0 if not shown)
- "expiry_date": expiry date in YYYY-MM-DD format (string, use "" if not visible)
- "notes": any extra notes (string, use "" if none)

Rules:
- Return ONLY the JSON array, no explanation, no markdown, no code fences.
- If no records found, return [].
- Keep description exactly as written in the notebook.
Example: [{"description":"Peak Milk 400g","quantity":6,"price":950,"expiry_date":"2025-06-15","notes":""}]`,

  discount: `You are a data extraction assistant for Foodco Arulogun retail store.
Extract all discount or price-markdown records from this notebook/document image.
Return a JSON array. Each object must have exactly these fields:
- "description": product name (string)
- "quantity": number of units (number, default 1 if unclear)
- "original_price": original unit price in naira (number, use 0 if not shown)
- "name": discount label such as "Flash Sale", "Clearance", "Markdown" (string)
- "notes": any extra notes (string, use "" if none)

Rules:
- Return ONLY the JSON array, no explanation, no markdown, no code fences.
- If no records found, return [].
- Keep description exactly as written in the notebook.
Example: [{"description":"Bournvita 500g","quantity":4,"original_price":2400,"name":"Clearance","notes":"near expiry"}]`,
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

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const response = await groq.chat.completions.create({
      model:      'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${mimeType};base64,${image}` },
            },
            {
              type: 'text',
              text: PROMPTS[section],
            },
          ],
        },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? '[]'

    // Strip markdown fences if the model adds them
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    let records: unknown[]
    try {
      records = JSON.parse(cleaned)
      if (!Array.isArray(records)) records = []
    } catch {
      records = []
    }

    return NextResponse.json({ records })
  } catch (err: unknown) {
    console.error('[scan/notebook] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
