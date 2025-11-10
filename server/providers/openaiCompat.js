import fetch from 'node-fetch'

function resolveBrand(provider, baseURL) {
  const id = (provider?.id || '').toLowerCase()
  const u = (baseURL || '').toLowerCase()
  if (u.includes('volces.com')) return 'doubao'
  if (u.includes('dashscope.aliyuncs.com')) return 'qianwen'
  if (u.includes('openrouter.ai')) return 'openrouter'
  if (u.includes('deepseek.com')) return 'deepseek'
  if (u.includes('api.openai.com')) return 'openai'
  if (id === 'azure') return 'azure'
  return id || 'openai'
}

// Normalize baseURL/path to avoid malformed schemes like "ttps://"
function normalizeBaseURL(u) {
  if (!u) return u
  let s = String(u)
  s = s.replace(/\s+/g, '')
  s = s.replace(/^ttps:\/\//i, 'https://')
  s = s.replace(/^ttp:\/\//i, 'http://')
  s = s.trim()
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '')
  s = s.replace(/\/$/, '')
  return s
}
function normalizePath(p) {
  if (!p) return ''
  let s = String(p).trim()
  if (!s.startsWith('/')) s = '/' + s
  return s
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
async function fetchWithTimeoutRetry(url, options, { timeoutMs = 20000, retries = 1, retryDelayMs = 500 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      if ([408, 429, 500, 502, 503, 504].includes(resp.status) && attempt < retries) {
        await sleep(retryDelayMs)
        continue
      }
      return resp
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      const isAbort = e && (e.name === 'AbortError' || /aborted|timeout/i.test(String(e.message)))
      if (!isAbort && attempt >= retries) throw e
      if (attempt < retries) await sleep(retryDelayMs)
    }
  }
  throw lastErr || new Error('fetch failed')
}

function safeJoinURL(baseURL, path) {
  const b = normalizeBaseURL(baseURL)
  const p = normalizePath(path)
  if (!p) return b
  return `${b}${p}`
}

const MOCK_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
function generateMockA() {
  return JSON.stringify({
    objects: [
      { name: 'bed', position: 'north', relative_area: 0.3, material: 'wood', color: 'light', notes: '靠墙摆放' },
      { name: 'desk', position: 'east', relative_area: 0.1, material: 'metal', color: 'black', notes: '靠窗采光' }
    ],
    layout: { facing: 'south', doors: 1, windows: 2, bed: 'north', desk: 'east', sofa: null, stove: null, entrance: 'west' },
    directions: { north: '床', south: '空区', east: '桌', west: '门', center: '空' },
    questions: []
  })
}
function generateMockB() {
  return JSON.stringify({
    advice: [
      '床头保持整洁，提升休息质量',
      '书桌靠窗增强采光与工作效率'
    ],
    itemsToAdd: [
      { item: '植物', reason: '提升生气', area: '角落', direction: 'east', style: '现代', color: '绿色', size: '中', material: '自然' },
      { item: '地毯', reason: '提升温馨感', area: '中心', direction: 'center', style: '简约', color: '米色', size: '中', material: '纤维' }
    ]
  })
}
function mockTextForPrompt(prompt) {
  const s = String(prompt || '')
  const isB = /itemsToAdd|风水顾问|风水建议/i.test(s)
  return isB ? generateMockB() : generateMockA()
}

function normalizeDoubaoKey(k) {
  if (!k) return k
  let s = String(k).trim()
  s = s.replace(/^['"]|['"]$/g, '') // remove surrounding quotes
  s = s.replace(/\s+/g, '') // remove spaces/newlines
  return s
}

function isInvalidDoubaoInlineKey(k) {
  if (!k) return false
  const s = String(k).trim()
  if (/^sk-[A-Za-z0-9]/.test(s)) return true // OpenAI key
  if (/^AIza[\w-]+/.test(s)) return true // Google key
  if (/:/.test(s)) return true // AK:SK combo
  if (/AKID|SK|AK\w{6,}/i.test(s)) return true // AK/SK hints
  return false
}

export async function runOpenAICompat(provider, { prompt, system }) {
  if (process.env.MOCK_FENGSHUI === '1') {
    return { output: mockTextForPrompt(prompt) }
  }
  let { baseURL, model, temperature, top_p, max_tokens, path = '/chat/completions', apiKey: inlineKey, reasoning_effort } = provider.params || {}
  if (!baseURL) {
    if (provider.id === 'openai' || provider.id === 'openrouter' || provider.id === 'azure') baseURL = 'https://api.openai.com/v1'
    else if (provider.id === 'deepseek') baseURL = 'https://api.deepseek.com/v1'
    else if (provider.id === 'qianwen') baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    else if (provider.id === 'doubao') baseURL = 'https://ark.cn-beijing.volces.com/api/v3'
    else baseURL = 'https://api.openai.com/v1'
  }
  const before = baseURL
  baseURL = normalizeBaseURL(baseURL)
  path = normalizePath(path)
  console.log('runOpenAICompat baseURL normalize', { before, after: baseURL, path })
  const brand = resolveBrand(provider, baseURL)
  const keyEnvMap = {
    openai: process.env.OPENAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    qianwen: process.env.DASHSCOPE_API_KEY,
    doubao: process.env.DOUBAO_API_KEY || process.env.DOUDAO_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    azure: process.env.AZURE_OPENAI_API_KEY
  }
  // Guard: if inline key is invalid for Doubao, ignore it and prefer env var
  if (brand === 'doubao' && inlineKey && isInvalidDoubaoInlineKey(inlineKey)) {
    const pref = String(inlineKey).slice(0, 5)
    console.warn('[Key] invalid inline key for doubao, will use env var instead', { pref, len: String(inlineKey).length })
    inlineKey = undefined
  }
  let apiKey = inlineKey || keyEnvMap[brand] || process.env.OPENAI_COMPAT_API_KEY
  apiKey = normalizeDoubaoKey(apiKey)
  const keySource = inlineKey ? 'inline' : (keyEnvMap[brand] ? `env:${brand}` : (process.env.OPENAI_COMPAT_API_KEY ? 'env:compat' : 'none'))
  if (!apiKey) {
    console.warn('[Key] missing API key', { brand, source: keySource })
    throw new Error('缺少 API Key: ' + brand)
  }
  if (brand === 'doubao') {
    const prefix = apiKey.slice(0, 5)
    const looksLikeOpenAI = /^sk-[A-Za-z0-9]/.test(apiKey)
    const looksLikeAKSK = /[:]|AKID|SK|AK\w{6,}/i.test(apiKey)
    console.log('[Key] doubao key in use', { source: keySource, len: apiKey.length, prefix, looksLikeOpenAI, looksLikeAKSK })
  }
  const url = `${baseURL}${path}`
  let userContent = provider.__contentParts || prompt
  if (Array.isArray(userContent) && brand === 'doubao') {
    userContent = userContent.map((p) => {
      if (p && p.type === 'image_url') {
        const u = (p.image_url && (typeof p.image_url === 'string' ? p.image_url : p.image_url.url)) || ''
        return u ? { type: 'image_url', image_url: u } : p
      }
      if (p && p.type === 'text') {
        return { type: 'text', text: p.text }
      }
      return p
    })
  }
  const body = {
    model,
    messages: [
      system ? { role: 'system', content: system } : null,
      { role: 'user', content: userContent }
    ].filter(Boolean),
  }
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
  const timeoutMs = brand === 'doubao' ? 60000 : 30000
  const resp = await fetchWithTimeoutRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, { timeoutMs, retries: 1 })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    const err = new Error(`HTTP ${resp.status} for ${url}: ${text || 'fetch failed'}`)
    err.httpStatus = resp.status
    err.providerUrl = url
    err.providerResponse = text
    throw err
  }
  const json = await resp.json()
  const output = json?.choices?.[0]?.message?.content || ''
  return { output }
}

export async function runOpenAIImagesCompat(provider, { prompt, model, size = '1024x1024', images }) {
  if (process.env.MOCK_FENGSHUI === '1') {
    return { b64: MOCK_PIXEL_PNG }
  }
  let { baseURL, apiKey: inlineKey, response_format: forcedRF, seed, guidance_scale, negative_prompt } = provider.params || {}
  if (!baseURL) {
    if (provider.id === 'doubao') baseURL = 'https://ark.cn-beijing.volces.com/api/v3'
    else baseURL = 'https://api.openai.com/v1'
  }
  const before = baseURL
  baseURL = normalizeBaseURL(baseURL)
  console.log('runOpenAIImagesCompat baseURL normalize', { before, after: baseURL })
  const brand = resolveBrand(provider, baseURL)
  const keyEnvMap = {
    openai: process.env.OPENAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    qianwen: process.env.DASHSCOPE_API_KEY,
    doubao: process.env.DOUBAO_API_KEY || process.env.DOUDAO_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    azure: process.env.AZURE_OPENAI_API_KEY
  }
  // Guard invalid inline key for Doubao images
  if (brand === 'doubao' && inlineKey && isInvalidDoubaoInlineKey(inlineKey)) {
    const pref = String(inlineKey).slice(0, 5)
    console.warn('[Key] invalid inline key for doubao(images), will use env var instead', { pref, len: String(inlineKey).length })
    inlineKey = undefined
  }
  let apiKey = inlineKey || keyEnvMap[brand] || process.env.OPENAI_COMPAT_API_KEY
  apiKey = normalizeDoubaoKey(apiKey)
  const keySource = inlineKey ? 'inline' : (keyEnvMap[brand] ? `env:${brand}` : (process.env.OPENAI_COMPAT_API_KEY ? 'env:compat' : 'none'))
  if (!apiKey) throw new Error('缺少 API Key: ' + brand)
  if (brand === 'doubao') {
    const prefix = apiKey.slice(0, 5)
    const looksLikeOpenAI = /^sk-[A-Za-z0-9]/.test(apiKey)
    const looksLikeAKSK = /[:]|AKID|SK|AK\w{6,}/i.test(apiKey)
    console.log('[Key] doubao key in use (images)', { source: keySource, len: apiKey.length, prefix, looksLikeOpenAI, looksLikeAKSK })
  }
  const finalModel = model || (provider.params && provider.params.model) || 'gpt-image-1'
  const finalSize = brand === 'doubao' && (size === '1024x1024' || !size) ? '2K' : size
  const rf = forcedRF || (brand === 'doubao' ? 'url' : 'b64_json')
  const url = `${baseURL}/images/generations`
  const body = brand === 'doubao'
    ? { prompt: prompt || '', model: finalModel, size: finalSize, response_format: rf, image: Array.isArray(images) ? images : undefined, seed, guidance_scale, negative_prompt }
    : { prompt: prompt || '', model: finalModel, size: finalSize, response_format: rf }
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
  const resp = await fetchWithTimeoutRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, { timeoutMs: brand === 'doubao' ? 60000 : 45000, retries: brand === 'doubao' ? 2 : 1 })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    const err = new Error(`HTTP ${resp.status} for ${url}: ${text || 'fetch failed'}`)
    err.httpStatus = resp.status
    err.providerUrl = url
    err.providerResponse = text
    throw err
  }
  const json = await resp.json()
  const b64 = json?.data?.[0]?.b64_json || ''
  const imgUrl = json?.data?.[0]?.url || ''
  if (imgUrl) return { url: imgUrl }
  return { b64 }
}

export async function streamOpenAICompat(provider, { prompt, system }, onDelta) {
  let { baseURL, model, temperature, top_p, max_tokens, path = '/chat/completions', apiKey: inlineKey, reasoning_effort } = provider.params || {}
}
