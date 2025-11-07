import express from 'express'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { handleCompare } from './routes/compare.js'
import { listOpenRouterModels } from './routes/openrouter.js'
import cors from 'cors'

dotenv.config()

const app = express()
// 为跨域请求开启 CORS（允许自定义来源，默认 *）
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: false }))
// 提高请求体大小限制，支持较大的 dataURL 图片
app.use(express.json({ limit: '50mb' }))
app.use(morgan('dev'))

import { handleCompareStream } from './routes/compare.js'
app.post('/api/compare', handleCompare)
app.post('/api/compare/stream', handleCompareStream)

import { uploadBase64, analyzeImage, adviseFengshui, generateReference } from './routes/fengshui.js'
app.post('/api/upload', uploadBase64)
app.post('/api/fengshui/analyze-image', analyzeImage)
app.post('/api/fengshui/advise', adviseFengshui)
app.post('/api/fengshui/generate-ref', generateReference)
app.get('/api/openrouter/models', listOpenRouterModels)

// 静态资源（生产预览）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
// 静态服务上传图片
import { fileURLToPath as __f } from 'url'
import fs from 'fs'
const uploadsPath = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsPath)) try { fs.mkdirSync(uploadsPath) } catch {}
app.use('/uploads', express.static(uploadsPath))
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

const port = process.env.PORT || 3001
app.listen(port, () => {
  const origin = process.env.PUBLIC_SERVER_ORIGIN || `http://localhost:${port}`
  console.log(`Server at ${origin}`)
  console.log(`Uploads available at ${origin}/uploads/`)
})
