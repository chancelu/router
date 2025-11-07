import fetch from 'node-fetch'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function uploadToImgbb(b64, name) {
  const key = process.env.IMGBB_API_KEY
  if (!key) throw new Error('缺少 IMGBB_API_KEY')
  const params = new URLSearchParams()
  params.append('image', b64)
  if (name) params.append('name', name)
  const url = `https://api.imgbb.com/1/upload?key=${key}`
  const resp = await fetch(url, { method: 'POST', body: params })
  const text = await resp.text().catch(() => '')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`)
  let json
  try { json = JSON.parse(text) } catch { throw new Error('图床返回非JSON: ' + text.slice(0,200)) }
  if (!json?.success) throw new Error('图床上传失败: ' + (json?.error?.message || text.slice(0,200)))
  const u = json?.data?.url || json?.data?.display_url
  if (!u) throw new Error('图床未返回URL')
  return u
}

// 火山引擎 TOS（S3兼容）上传
async function uploadToVolcTOS(buffer, filename) {
  const accessKeyId = process.env.VOLC_ACCESS_KEY_ID
  const secretAccessKey = process.env.VOLC_SECRET_ACCESS_KEY
  const bucket = process.env.VOLC_BUCKET
  const region = process.env.VOLC_REGION || 'cn-beijing'
  // 使用 S3 兼容 Endpoint（注意，与通用 REST 域名不同）
  const endpoint = process.env.VOLC_ENDPOINT || `https://tos-s3-${region}.volces.com`
  if (!accessKeyId || !secretAccessKey || !bucket) throw new Error('缺少火山TOS配置: VOLC_ACCESS_KEY_ID/VOLC_SECRET_ACCESS_KEY/VOLC_BUCKET')
  // 采用虚拟主机风格（bucket 在域名前缀），避免 Path-Style 导致的 403
  const client = new S3Client({ region, endpoint, credentials: { accessKeyId, secretAccessKey } })
  const key = filename || `upload_${Date.now()}.png`
  const contentType = 'image/' + ((key.split('.').pop() || 'png'))
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType, ACL: 'public-read' }))
  const publicHost = process.env.VOLC_PUBLIC_HOST // 例如自定义域名 https://img.example.com
  if (publicHost) return `${publicHost.replace(/\/$/,'')}/${key}`
  // 默认公网访问：虚拟主机风格 https://<bucket>.tos-<region>.volces.com/<key>
  const vhost = `https://${bucket}.tos-${region}.volces.com`
  return `${vhost.replace(/\/$/,'')}/${key}`
}

// 预留：sm.ms 上传（国内稳定性更好）。当前仅占位，未来可启用。
async function uploadToSmms(b64, name) {
  const token = process.env.SMMS_API_TOKEN
  if (!token) throw new Error('缺少 SMMS_API_TOKEN')
  throw new Error('sm.ms 未启用')
}

export async function uploadToImageHost(buffer, filename = `upload_${Date.now()}.png`) {
  const hostRaw = (process.env.IMAGE_HOST || 'imgbb').toLowerCase()
  // auto：如果配置了火山TOS，优先TOS；否则走 imgbb
  const hasVolc = process.env.VOLC_ACCESS_KEY_ID && process.env.VOLC_SECRET_ACCESS_KEY && process.env.VOLC_BUCKET
  const host = hostRaw === 'auto' ? (hasVolc ? 'volc' : 'imgbb') : hostRaw
  const b64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : String(buffer || '')
  if (!b64 && !Buffer.isBuffer(buffer)) throw new Error('空图片数据')

  let attempts = 2
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      if (host === 'volc') {
        const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(b64, 'base64')
        return await uploadToVolcTOS(buf, filename)
      } else if (host === 'imgbb') {
        const data = Buffer.isBuffer(buffer) ? buffer.toString('base64') : b64
        return await uploadToImgbb(data, filename)
      } else if (host === 'smms') {
        return await uploadToSmms(b64, filename)
      }
      throw new Error('不支持的图床: ' + host)
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await sleep(400)
    }
  }
  throw lastErr || new Error('图床上传失败')
}