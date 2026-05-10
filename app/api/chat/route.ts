import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { createClient } from '@/lib/supabase/server'
import { buildChatContext } from '@/lib/services/chatContext'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json() as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('messages array is required', { status: 400 })
  }

  // Build live business context for the system prompt
  const { snapshot } = await buildChatContext(user.id)

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const stream = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    max_tokens:  1024,
    temperature: 0.5,
    stream:      true,
    messages: [
      { role: 'system', content: snapshot },
      ...messages,
    ],
  })

  // Stream the response as plain text chunks
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) controller.enqueue(encoder.encode(text))
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
