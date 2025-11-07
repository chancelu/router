import { runOpenAICompat, streamOpenAICompat } from '../providers/openaiCompat.js'
import { runAnthropic, streamAnthropic } from '../providers/anthropic.js'
import { runGemini, streamGemini } from '../providers/gemini.js'

export async function handleCompare(req, res) {
  const { prompt, system, providers } = req.body || {}
  if (!prompt || !Array.isArray(providers)) {
    return res.status(400).json({ error: 'bad request' })
  }
  const tasks = providers.map(async (p) => {
    const start = Date.now()
    try {
      const systemEffective = p.params?.system || system || ''
      let out
      if (p.type === 'openai-compat') out = await runOpenAICompat(p, { prompt, system: systemEffective })
      else if (p.type === 'anthropic') out = await runAnthropic(p, { prompt, system: systemEffective })
      else if (p.type === 'gemini') out = await runGemini(p, { prompt, system: systemEffective })
      else throw new Error('unknown provider')
      const end = Date.now()
      return { id: p.id, name: p.name, ok: true, output: out.output, usage: out.usage || null, timings: { start, end, durationMs: end - start } }
    } catch (e) {
      const end = Date.now()
      return { id: p.id, name: p.name, ok: false, error: e.message || 'error', usage: null, timings: { start, end, durationMs: end - start } }
    }
  })
  const results = await Promise.all(tasks)
  res.json(results)
}

export async function handleCompareStream(req, res) {
  const { prompt, system, providers } = req.body || {}
  if (!prompt || !Array.isArray(providers)) {
    res.status(400).setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'bad request' }))
  }
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')

  const write = (obj) => res.write(JSON.stringify(obj) + '\n')

  await Promise.all(providers.map(async (p) => {
    const start = Date.now()
    write({ id: p.id, name: p.name, type: 'start', t: start })
    const systemEffective = p.params?.system || system || ''
    try {
      if (p.type === 'openai-compat') {
        let acc = ''
        await streamOpenAICompat(p, { prompt, system: systemEffective }, (evt) => {
          if (evt.type === 'delta') {
            acc += evt.delta
            write({ id: p.id, type: 'delta', delta: evt.delta })
          } else if (evt.type === 'usage') {
            write({ id: p.id, type: 'usage', usage: evt.usage })
          } else if (evt.type === 'done') {
            const end = Date.now()
            write({ id: p.id, name: p.name, type: 'done', ok: true, output: acc, timings: { start, end, durationMs: end - start } })
          }
        })
      } else if (p.type === 'anthropic') {
        let acc = ''
        await streamAnthropic(p, { prompt, system: systemEffective }, (evt) => {
          if (evt.type === 'delta') {
            acc += evt.delta
            write({ id: p.id, type: 'delta', delta: evt.delta })
          } else if (evt.type === 'usage') {
            write({ id: p.id, type: 'usage', usage: evt.usage })
          } else if (evt.type === 'done') {
            const end = Date.now()
            write({ id: p.id, name: p.name, type: 'done', ok: true, output: acc, timings: { start, end, durationMs: end - start } })
          }
        })
      } else if (p.type === 'gemini') {
        let acc = ''
        await streamGemini(p, { prompt, system: systemEffective }, (evt) => {
          if (evt.type === 'delta') {
            acc += evt.delta
            write({ id: p.id, type: 'delta', delta: evt.delta })
          } else if (evt.type === 'usage') {
            write({ id: p.id, type: 'usage', usage: evt.usage })
          } else if (evt.type === 'done') {
            const end = Date.now()
            write({ id: p.id, name: p.name, type: 'done', ok: true, output: acc, timings: { start, end, durationMs: end - start } })
          }
        })
      } else {
        throw new Error('unknown provider')
      }
    } catch (e) {
      const end = Date.now()
      write({ id: p.id, name: p.name, type: 'error', ok: false, error: e.message || 'error', timings: { start, end, durationMs: end - start } })
    }
  }))
  res.end()
}
