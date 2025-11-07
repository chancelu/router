import fetch from 'node-fetch'

export async function runAnthropic(provider, { prompt, system }) {
  const inlineKey = provider.params?.apiKey
  const apiKey = inlineKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('缺少 API Key: ANTHROPIC_API_KEY')
  const model = provider.params?.model || 'claude-3-5-sonnet-latest'
  const max_tokens = provider.params?.max_tokens || 1024
  const temperature = provider.params?.temperature ?? 0.7
  const url = 'https://api.anthropic.com/v1/messages'
  const body = {
    model,
    max_tokens,
    temperature,
    system: system || undefined,
    messages: [ { role: 'user', content: prompt } ]
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  }
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const output = data?.content?.map(c => c.text).join('\n') || ''
  const usage = data?.usage ? {
    prompt_tokens: data.usage.input_tokens,
    completion_tokens: data.usage.output_tokens,
    total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
  } : null
  return { output, usage }
}

export async function streamAnthropic(provider, { prompt, system }, onDelta) {
  const inlineKey = provider.params?.apiKey
  const apiKey = inlineKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('缺少 API Key: ANTHROPIC_API_KEY')
  const model = provider.params?.model || 'claude-3-5-sonnet-latest'
  const max_tokens = provider.params?.max_tokens || 1024
  const temperature = provider.params?.temperature ?? 0.7
  const url = 'https://api.anthropic.com/v1/messages'
  const body = {
    model,
    max_tokens,
    temperature,
    stream: true,
    system: system || undefined,
    messages: [ { role: 'user', content: prompt } ]
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  }
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() || ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const dataStr = trimmed.slice(5).trim()
      if (!dataStr || dataStr === '[DONE]') { onDelta({ type: 'done' }); continue }
      try {
        const json = JSON.parse(dataStr)
        // Anthropic events: content_block_delta -> { delta: { type: 'text_delta', text } }
        const text = json?.delta?.text || json?.content_block?.text || ''
        if (text) onDelta({ type: 'delta', delta: text })
        if (json?.message && json?.message?.usage) {
          const u = json.message.usage
          onDelta({ type: 'usage', usage: { prompt_tokens: u.input_tokens, completion_tokens: u.output_tokens, total_tokens: (u.input_tokens||0)+(u.output_tokens||0) } })
        }
      } catch {}
    }
  }
}
