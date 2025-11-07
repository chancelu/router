#!/usr/bin/env node
// End-to-end ABC flow test using backend mock mode
// Requires server running at http://localhost:3001

import fs from 'fs'

const BASE = process.env.BASE_URL || 'http://localhost:3001'
const OUTDIR = new URL('./out/', import.meta.url)

function log(step, msg) {
  console.log(`[${step}] ${msg}`)
}

async function postJSON(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json }
}

function safeParseOutput(obj) {
  const out = obj?.output ?? obj
  if (typeof out === 'string') {
    try { return JSON.parse(out) } catch { return out }
  }
  return out
}

async function main() {
  fs.mkdirSync(new URL('.', OUTDIR), { recursive: true })

  // Step A: analyze-image
  log('A', 'POST /api/fengshui/analyze-image (mock)')
  const aPayload = {
    imageUrl: 'https://picsum.photos/512',
    system: '你是室内空间视觉理解专家，严格输出JSON',
    provider: {
      id: 'doubao', name: 'Doubao', type: 'openai-compat',
      params: { baseURL: 'https://ark.cn-beijing.volces.com/api/v3', path: '/chat/completions', model: 'Doubao-Seed-1.6', mock: true }
    }
  }
  const aRes = await postJSON('/api/fengshui/analyze-image', aPayload)
  if (aRes.status !== 200) {
    console.error('Step A failed', aRes.json)
    process.exit(1)
  }
  const aOut = safeParseOutput(aRes.json)
  fs.writeFileSync(new URL('A.json', OUTDIR), JSON.stringify(aOut, null, 2))
  log('A', 'OK, saved to scripts/out/A.json')

  // Step B: advise
  log('B', 'POST /api/fengshui/advise (mock)')
  const bPayload = {
    imageElements: JSON.stringify(aOut),
    system: '你是风水顾问，输出JSON',
    provider: {
      id: 'doubao', name: 'Doubao', type: 'openai-compat',
      params: { baseURL: 'https://ark.cn-beijing.volces.com/api/v3', path: '/chat/completions', model: 'Doubao-Seed-1.6', mock: true }
    }
  }
  const bRes = await postJSON('/api/fengshui/advise', bPayload)
  if (bRes.status !== 200) {
    console.error('Step B failed', bRes.json)
    process.exit(1)
  }
  const bOut = safeParseOutput(bRes.json)
  fs.writeFileSync(new URL('B.json', OUTDIR), JSON.stringify(bOut, null, 2))
  log('B', 'OK, saved to scripts/out/B.json')

  const itemsToAdd = Array.isArray(bOut?.itemsToAdd) && bOut.itemsToAdd.length > 0
    ? bOut.itemsToAdd
    : [{ item: '植物', reason: '提升生气', area: '角落', direction: 'east' }]

  // Step C: generate-ref
  log('C', 'POST /api/fengshui/generate-ref (mock)')
  const cPayload = {
    originalImageUrl: 'https://picsum.photos/512',
    itemsToAdd,
    styleHints: '现代简约，浅色系',
    provider: {
      id: 'openai', name: 'OpenAI', type: 'openai-compat',
      params: { baseURL: 'https://api.openai.com/v1', path: '/images/edits', model: 'gpt-image-1', mock: true }
    }
  }
  const cRes = await postJSON('/api/fengshui/generate-ref', cPayload)
  if (cRes.status !== 200) {
    console.error('Step C failed', cRes.json)
    process.exit(1)
  }
  const cOut = cRes.json
  fs.writeFileSync(new URL('C.json', OUTDIR), JSON.stringify(cOut, null, 2))
  log('C', `OK, imageUrl=${cOut?.imageUrl} saved to scripts/out/C.json`)

  console.log('\nAll steps passed under mock mode. Expected UI flow works without real API keys.')
}

main().catch(err => { console.error(err); process.exit(1) })