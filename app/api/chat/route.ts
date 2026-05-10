import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { createClient } from '@/lib/supabase/server'
import { buildChatContext } from '@/lib/services/chatContext'
import { TOOL_DEFINITIONS, PAGE_LINKS, executeTool } from '@/lib/services/chatTools'

export const runtime = 'nodejs'

const MAX_TOOL_ROUNDS = 3

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const { messages } = await req.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response('messages array is required', { status: 400 })
    }

    const { snapshot } = await buildChatContext(user.id)
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

    const pageLinksText = Object.entries(PAGE_LINKS)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')

    const systemPrompt = `${snapshot}

=== NAVIGATION LINKS ===
When referencing a module, include a markdown link so the user can navigate there:
${pageLinksText}
Example: "You can view them on the [Discounts page](/discounts)."

=== TOOL USE ===
Use the query tools when the user asks about specific items, stock, or data not already in the snapshot. Prefer real data over "I don't know".`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conversation: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    let finalText = ''

    // Agentic loop — run non-streaming so we can read tool_calls
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  1024,
        temperature: 0.4,
        stream:      false,
        tools:       TOOL_DEFINITIONS,
        tool_choice: 'auto',
        messages:    conversation,
      })

      const msg = response.choices[0]?.message
      if (!msg) break

      // No tool calls → this is the final text answer
      if (!msg.tool_calls?.length) {
        finalText = msg.content ?? ''
        break
      }

      // Push assistant turn with explicit fields only (no extra SDK properties)
      conversation.push({
        role:       'assistant',
        content:    msg.content ?? null,
        tool_calls: msg.tool_calls.map(tc => ({
          id:       tc.id,
          type:     'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      })

      // Execute each tool and append result
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* use empty */ }

        const result = await executeTool(tc.function.name, args)
        conversation.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    }

    // If all rounds used tool calls, ask once more without tools to get prose
    if (!finalText) {
      const fallback = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  1024,
        temperature: 0.4,
        stream:      false,
        messages:    conversation,
      })
      finalText = fallback.choices[0]?.message?.content
        ?? 'I could not retrieve that information right now.'
    }

    // Return text as a single chunk — client appends it to the message bubble
    return new Response(finalText, {
      headers: {
        'Content-Type':           'text/plain; charset=utf-8',
        'Cache-Control':          'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[chat/route] error:', message)
    return new Response('Internal server error', { status: 500 })
  }
}
