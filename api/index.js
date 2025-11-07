import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

// 加载环境变量
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()

// 配置中间件
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || '*', 
  credentials: false 
}))
app.use(express.json({ limit: '50mb' }))

// 创建上传目录（Vercel 使用 /tmp/uploads）
const isVercel = process.env.VERCEL === '1' || !!process.env.NOW_REGION
const uploadsDir = isVercel ? '/tmp/uploads' : join(__dirname, '..', 'server', 'uploads')
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true })
  } catch (e) {
    console.warn('[uploads] mkdir failed', e?.message || e)
  }
}

// 导入路由处理函数
import { handleCompare, handleCompareStream } from '../server/routes/compare.js'
import { uploadBase64, analyzeImage, adviseFengshui, generateReference } from '../server/routes/fengshui.js'
import { listOpenRouterModels } from '../server/routes/openrouter.js'

// API路由
app.post('/api/compare', handleCompare)
app.post('/api/compare/stream', handleCompareStream)
app.post('/api/upload', uploadBase64)
app.post('/api/fengshui/analyze-image', analyzeImage)
app.post('/api/fengshui/advise', adviseFengshui)
app.post('/api/fengshui/generate-ref', generateReference)
app.get('/api/openrouter/models', listOpenRouterModels)

// 静态文件服务
app.use('/uploads', express.static(uploadsDir))

// Vercel需要导出为默认函数（确保为处理函数）
export default (req, res) => app(req, res)