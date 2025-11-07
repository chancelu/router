import fetch from 'node-fetch'

export async function listOpenRouterModels(req, res) {
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models')
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return res.status(resp.status).json({ error: text || 'fetch failed' })
    }
    const json = await resp.json()
    const items = (json?.data || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider || (typeof m.id === 'string' ? m.id.split('/')[0] : ''),
      context_length: m.context_length || null
    }))
    res.json({ data: items })
  } catch (e) {
    res.status(500).json({ error: e.message || 'error' })
  }
}
