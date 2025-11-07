import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// Vercel 无持久写入：使用临时目录
const isVercel = process.env.VERCEL === '1' || !!process.env.NOW_REGION
const uploadsDir = isVercel ? '/tmp/uploads' : join(__dirname, '..', 'server', 'uploads')

export default async function handler(req, res) {
  const { filename } = req.query
  
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' })
  }
  
  // 安全检查：防止路径遍历
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  
  const filePath = join(uploadsDir, filename)
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }
  
  // 设置正确的Content-Type
  const ext = filename.split('.').pop().toLowerCase()
  const contentTypes = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp'
  }
  
  res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=31536000')
  
  // 读取并返回文件
  const fileStream = fs.createReadStream(filePath)
  fileStream.pipe(res)
}