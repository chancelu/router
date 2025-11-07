import fetch from 'node-fetch'

function buildGeminiContents(provider, { prompt, system }) {
  const parts = []
  // System as first message
  if (system) parts.push({ text: `System instruction: ${system}` })
  // Convert OpenAI-compat content parts to Gemini parts
  const cps = provider.__contentParts
  if (Array.isArray(cps) && cps.length) {
    for (const p of cps) {
      if (p.type === 'image_url' && p.image_url?.url) {
        const u = p.image_url.url
        if (typeof u === 'string' && u.startsWith('data:image/')) {
          // dataURL -> inline_data
          const [meta, b64] = u.split(',')
          const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/png'
          parts.push({ inline_data: { mimeType: mime, data: b64 } })
        } else {
          // Fallback: Gemini无法直接拉取外链，这里作为文本提示传递
          parts.push({ text: `Image URL: ${u}` })
        }
      } else if (p.type === 'text' && p.text) {
        parts.push({ text: p.text })
      }
    }
  }
  // Append prompt as text if not already provided
  if (prompt) parts.push({ text: prompt })
  return [{ role: 'user', parts }]
}

export async function runGemini(provider, { prompt, system }) {
  const inlineKey = provider.params?.apiKey
  const apiKey = inlineKey || process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('缺少 API Key: GOOGLE_API_KEY')
  const model = provider.params?.model || 'gemini-1.5-flash'
  const temperature = provider.params?.temperature ?? 0.7
  const max_tokens = provider.params?.max_tokens
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`
  const contents = buildGeminiContents(provider, { prompt, system })
  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: max_tokens
    }
  }
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const output = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || ''
  const usage = data?.usageMetadata ? {
    prompt_tokens: data.usageMetadata.promptTokenCount,
    completion_tokens: data.usageMetadata.candidatesTokenCount,
    total_tokens: (data.usageMetadata.promptTokenCount || 0) + (data.usageMetadata.candidatesTokenCount || 0)
  } : null
  return { output, usage }
}

export async function streamGemini(provider, { prompt, system }, onDelta) {
  const inlineKey = provider.params?.apiKey
  const apiKey = inlineKey || process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('缺少 API Key: GOOGLE_API_KEY')
  const model = provider.params?.model || 'gemini-1.5-flash'
  const temperature = provider.params?.temperature ?? 0.7
  const max_tokens = provider.params?.max_tokens
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:streamGenerateContent?key=${apiKey}`
  const contents = buildGeminiContents(provider, { prompt, system })
  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: max_tokens
    }
  }
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const s = line.trim()
      if (!s) continue
      try {
        const json = JSON.parse(s)
        const parts = json?.candidates?.[0]?.content?.parts || []
        const delta = parts.map(p => p.text).filter(Boolean).join('')
        if (delta) onDelta({ type: 'delta', delta })
        if (json?.usageMetadata) {
          const u = json.usageMetadata
          onDelta({ type: 'usage', usage: { prompt_tokens: u.promptTokenCount, completion_tokens: u.candidatesTokenCount, total_tokens: (u.promptTokenCount||0)+(u.candidatesTokenCount||0) } })
        }
      } catch {}
    }
  }
  onDelta({ type: 'done' })
}
