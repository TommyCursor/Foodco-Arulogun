import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { createClient } from '@/lib/supabase/server'
import { buildChatContext } from '@/lib/services/chatContext'
import { TOOL_DEFINITIONS, PAGE_LINKS, executeTool } from '@/lib/services/chatTools'

export const runtime = 'nodejs'

const MAX_TOOL_ROUNDS = 3

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

  const { snapshot } = await buildChatContext(user.id)

  const pageLinksText = Object.entries(PAGE_LINKS)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n')

  const systemPrompt = `${snapshot}

=== NAVIGATION LINKS ===
When referencing a module, include a markdown link so the user can navigate there:
${pageLinksText}
Example: "You can view them on the [Discounts page](/discounts)."

=== TOOL USE ===
You have access to live query tools. Use them when the user asks about specific items, quantities, or data not already in the snapshot above. Always prefer real data over saying "I don't know".`

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  // Build the conversation for Groq
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let conversation: any[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  // Agentic loop — up to MAX_TOOL_ROUNDS rounds of tool calling
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

    const choice = response.choices[0]

    // No tool calls — we have the final answer, break to stream it
    if (!choice.message.tool_calls?.length) {
      // Append assistant message and stream it
      const finalText = choice.message.content ?? ''

      const encoder  = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          // Stream word by word for a natural feel
          const words = finalText.split(/(?<=\s)|(?=\s)/)
          let i = 0
          function push() {
            if (i >= words.length) { controller.close(); return }
            controller.enqueue(encoder.encode(words[i++]))
            // Tiny delay gives the streaming feel without blocking
            setTimeout(push, 8)
          }
          push()
        },
      })

      return new Response(readable, {
        headers: {
          'Content-Type':           'text/plain; charset=utf-8',
          'Cache-Control':          'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    // Execute each tool call and collect results
    conversation.push(choice.message)

    for (const toolCall of choice.message.tool_calls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(toolCall.function.arguments) } catch { /* empty args */ }

      const result = await executeTool(toolCall.function.name, args)

      conversation.push({
        role:         'tool',
        tool_call_id: toolCall.id,
        content:      result,
      })
    }
  }

  // Fallback: one last non-tool call to get the final answer
  const fallback = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    max_tokens:  1024,
    temperature: 0.4,
    stream:      true,
    messages:    conversation,
  })

  const encoder  = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of fallback) {
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
      'Content-Type':           'text/plain; charset=utf-8',
      'Cache-Control':          'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
