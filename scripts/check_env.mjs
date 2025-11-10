#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const envPath = path.resolve(process.cwd(), '.env')
if (!fs.existsSync(envPath)) {
  console.log('[check:env] .env not found. Please create from .env.example')
  process.exit(1)
}
dotenv.config({ path: envPath })

function looksLikeDoubaoKey(k) {
  if (!k) return false
  const s = String(k).trim()
  // UUID-like with hyphens, or 32/36 hex-ish; not starting with sk-
  const uuidLike = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  const hexLike = /^[0-9a-fA-F-]{32,40}$/
  const isOpenAI = /^sk-[A-Za-z0-9]/
  return (uuidLike.test(s) || hexLike.test(s)) && !isOpenAI.test(s)
}

function normalize(k) {
  if (!k) return k
  return String(k).trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '')
}

const doub = normalize(process.env.DOUBAO_API_KEY)
const compat = normalize(process.env.OPENAI_COMPAT_API_KEY)
const openai = normalize(process.env.OPENAI_API_KEY)

console.log('[check:env] Summary:')
console.log({ DOUBAO_API_KEY: doub ? `${doub.slice(0,5)}...(${doub.length})` : null, OPENAI_COMPAT_API_KEY: compat ? `${compat.slice(0,5)}...(${compat.length})` : null, OPENAI_API_KEY: openai ? `${openai.slice(0,5)}...(${openai.length})` : null })

if (!doub) {
  console.error('[check:env] Missing DOUBAO_API_KEY. Online Doubao image generation will fail.')
  process.exitCode = 2
} else if (!looksLikeDoubaoKey(doub)) {
  console.error('[check:env] DOUBAO_API_KEY does not look like Doubao (Ark) key. Avoid using sk-...')
  process.exitCode = 3
} else {