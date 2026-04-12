import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { image, mimeType } = await req.json() as {
      image: string   // base64-encoded image data
      mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    }

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'image and mimeType are required' }, { status: 400 })
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${image}` },
            },
            {
              type: 'text',
              text: `You are a document transcription assistant for Foodco Arulogun retail store.

Carefully read all visible text in this image and transcribe it exactly as written.
- Preserve the original layout, line breaks, and formatting as best as possible.
- If the image contains a table or list, format it clearly.
- Correct obvious OCR artifacts only when you are very confident.
- If part of the text is unclear, write [unclear] in place of that word.
- Do not add any commentary, headers, or explanations — output only the transcribed text.`,
            },
          ],
        },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''

    return NextResponse.json({ text })
  } catch (err: unknown) {
    console.error('[scan] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
