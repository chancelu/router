#!/usr/bin/env node
import dotenv from 'dotenv'
import { S3Client, CreateBucketCommand, PutBucketAclCommand, PutBucketPolicyCommand, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'

dotenv.config()

const accessKeyId = process.env.VOLC_ACCESS_KEY_ID
const secretAccessKey = process.env.VOLC_SECRET_ACCESS_KEY
const bucket = process.env.VOLC_BUCKET || 'fengshui-images'
const region = process.env.VOLC_REGION || 'cn-beijing'
// 使用 S3 兼容 endpoint（建议 tos-s3-<region>.volces.com），并采用虚拟主机风格
const endpoint = (process.env.VOLC_ENDPOINT || `https://tos-s3-${region}.volces.com`).replace(/\/$/, '')
const publicHost = (process.env.VOLC_PUBLIC_HOST || '').replace(/\/$/, '')

if (!accessKeyId || !secretAccessKey) {
  console.error('缺少 VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY，请先在 .env 中配置')
  process.exit(1)
}

const client = new S3Client({ region, endpoint, credentials: { accessKeyId, secretAccessKey } })

async function ensureBucket() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log('[TOS] 桶已存在:', bucket)
    return
  } catch {}
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
    console.log('[TOS] 已创建桶:', bucket)
  } catch (e) {
    console.error('[TOS] 创建桶失败:', e?.message || e)
    throw e
  }
}

async function makePublicRead() {
  try {
    await client.send(new PutBucketAclCommand({ Bucket: bucket, ACL: 'public-read' }))
    console.log('[TOS] ACL: public-read 设置完成')
  } catch (e) {
    console.warn('[TOS] 设置 ACL 失败:', e?.message || e)
  }
  const policy = {
    Version: '2012-10-17',
    Statement: [{
      Sid: 'PublicReadGetObject',
      Effect: 'Allow',
      Principal: '*',
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucket}/*`]
    }]
  }
  try {
    await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }))
    console.log('[TOS] 公共读策略设置完成')
  } catch (e) {
    console.warn('[TOS] 设置策略失败:', e?.message || e)
  }
}

async function uploadProbe() {
  const key = `setup_probe_${Date.now()}.txt`
  const body = 'TOS setup success\n' + new Date().toISOString()
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain', ACL: 'public-read' }))
  // 公网URL优先使用自定义域，否则用 REST 域名拼接
  const restBase = `https://tos-${region}.volces.com`
  const url = publicHost ? `${publicHost}/${key}` : `${restBase}/${bucket}/${key}`
  console.log('[TOS] 测试文件已上传:', key)
  console.log('[TOS] 公网访问URL:', url)
  return url
}

;(async () => {
  console.log('[TOS] 开始配置，区域:', region, 'Endpoint:', endpoint)
  await ensureBucket()
  await makePublicRead()
  const url = await uploadProbe()
  console.log('\n完成！请在浏览器中访问上述 URL 验证是否公开可读。')
})().catch(err => { console.error('配置失败:', err); process.exit(1) })