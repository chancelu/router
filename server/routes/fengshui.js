import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runGemini } from '../providers/gemini.js'
import { runOpenAICompat, runOpenAIImagesCompat } from '../providers/openaiCompat.js'
import { uploadToImageHost } from '../utils/imageHost.js'
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Vercel 使用临时目录进行读写
const isVercel = process.env.VERCEL === '1' || !!process.env.NOW_REGION
const uploadDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadDir)) { try { fs.mkdirSync(uploadDir, { recursive: true }) } catch (e) { console.warn('[uploads] mkdir failed', e?.message || e) } }

// 依据请求动态推断 Origin（优先使用代理头），用于生成绝对 URL
function getOrigin(req) {
  try {
    const xfProto = req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol']
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const proto = Array.isArray(xfProto) ? xfProto[0] : (xfProto || (isVercel ? 'https' : 'http'))
    if (host) return `${proto}://${host}`
  } catch {}
  return process.env.PUBLIC_SERVER_ORIGIN || `http://localhost:${process.env.PORT || 3001}`
}

// 上传Base64图片，保存到服务器本地并返回URL（绝对URL）
export async function uploadBase64(req, res) {
  try {
    const { dataUrl, filename } = req.body || {}
    if (!dataUrl) return res.status(400).json({ error: 'missing dataUrl' })
    const [meta, b64] = dataUrl.split(',')
    const ext = (meta.match(/data:(.*?);/) || [])[1]?.split('/')[1] || 'png'
    const name = filename || `upload_${Date.now()}.${ext}`
    const buf = Buffer.from(b64, 'base64')
    const filePath = path.join(uploadDir, name)
    fs.writeFileSync(filePath, buf)
    const origin = getOrigin(req)
    const localUrl = `${origin}/uploads/${name}`
    let publicUrl = null
    try {
      const hostConf = (process.env.IMAGE_HOST || 'auto').toLowerCase()
      publicUrl = await uploadToImageHost(buf, name)
      console.log('[Upload] hosted via', hostConf, '=>', publicUrl)
    } catch (e) {
      console.warn('[Upload] image host failed:', e?.message || e)
    }
    return res.json({ url: publicUrl || localUrl, localUrl, hosted: !!publicUrl, host: (process.env.IMAGE_HOST || 'auto') })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'upload failed' })
  }
}

// 图片理解（A）：根据提供商类型路由到对应实现
export async function analyzeImage(req, res) {
  try {
    const { imageUrl, imageDataUrl, system, provider, prompt } = req.body || {}
    const urlOrData = imageUrl || imageDataUrl
    if (!urlOrData) return res.status(400).json({ error: 'missing imageUrl or imageDataUrl' })

    const isDataUrl = typeof urlOrData === 'string' && urlOrData.startsWith('data:image/')
    const sys = system || '你是室内空间视觉理解与方位提取专家...'
    const userPrompt = prompt || '请分析这张图片，提取关键元素、空间布局与方位信息，并用上述 JSON 模板输出，不要夹杂说明文字。'

    // mock: 仅在服务端环境变量开启时返回模拟结果
    if (process.env.MOCK_FENGSHUI === '1') {
      const out = await runOpenAICompat(provider, { prompt: userPrompt, system: sys })
      return res.json({ output: out.output })
    }

    const origin = getOrigin(req)
    let resolvedImage = urlOrData

    // Gemini 无法直接抓取外链图片：在服务端将 URL 转为 dataURL 以内联传递
    if ((provider?.type || '').toLowerCase() === 'gemini' && !isDataUrl && typeof urlOrData === 'string') {
      try {
        const absUrl = urlOrData.startsWith('/uploads/') ? `${origin}${urlOrData}` : urlOrData
        const resp = await fetch(absUrl)
        if (resp.ok) {
          const buf = await resp.arrayBuffer()
          const b64 = Buffer.from(buf).toString('base64')
          const ct = resp.headers.get('content-type') || 'image/png'
          resolvedImage = `data:${ct};base64,${b64}`
          console.log('[StepA] Gemini inline dataURL prepared from', absUrl)
        } else {
          console.warn('[StepA] fetch image for Gemini failed:', resp.status)
        }
      } catch (e) {
        console.warn('[StepA] inline image for Gemini failed:', e?.message || e)
      }
    }

    // Doubao 视觉模型更可靠地消费公网URL；当为 dataURL 或本地 /uploads/ 路径时，尽量托管为公网URL
    const isDoubao = String(provider?.params?.baseURL || '').includes('volces.com') || (provider?.id || '').toLowerCase() === 'doubao'
    if (isDoubao) {
      try {
        if (isDataUrl && typeof resolvedImage === 'string') {
          const [meta, b64] = resolvedImage.split(',')
          const ext = (meta.match(/data:(.*?);/) || [])[1]?.split('/')[1] || 'png'
          const name = `upload_${Date.now()}.${ext}`
          let hostedUrl = null
          try {
            hostedUrl = await uploadToImageHost(Buffer.from(b64, 'base64'), name)
            if (hostedUrl) {
              resolvedImage = hostedUrl
              console.log('[StepA] Doubao image hosted =>', hostedUrl)
            }
          } catch (hostErr) {
            console.warn('[StepA] Doubao image host failed, fallback to local:', hostErr?.message || hostErr)
          }
          if (!hostedUrl) {
            const filePath = path.join(uploadDir, name)
            fs.writeFileSync(filePath, Buffer.from(b64, 'base64'))
            resolvedImage = `${origin}/uploads/${name}`
            console.log('[StepA] saved dataURL locally =>', resolvedImage)
          }
        } else if (typeof resolvedImage === 'string' && resolvedImage.startsWith('/uploads/')) {
          resolvedImage = `${origin}${resolvedImage}`
        }
      } catch (e) {
        console.warn('[StepA] Doubao image prepare failed:', e?.message || e)
      }
    }

    const contentParts = [
      { type: 'image_url', image_url: { url: resolvedImage } },
      { type: 'text', text: userPrompt }
    ]

    const params = { ...(provider?.params || {}) }
    if (typeof params.baseURL === 'string') {
      params.baseURL = params.baseURL.trim().replace(/^ttps:\/\//i, 'https://').replace(/^ttp:\/\//i, 'http://')
      params.baseURL = params.baseURL.replace(/\/$/, '')
    }
    if (typeof params.path === 'string') {
      params.path = params.path.trim()
      if (!params.path.startsWith('/')) params.path = '/' + params.path
    }
    const safeProvider = { ...(provider || {}), params, __contentParts: contentParts }

    let out
    if ((safeProvider?.type || '').toLowerCase() === 'gemini') {
      out = await runGemini(safeProvider, { prompt: userPrompt, system: sys })
    } else {
      out = await runOpenAICompat(safeProvider, { prompt: userPrompt, system: sys })
    }
    return res.json({ output: out.output })
  } catch (e) {
    const msg = e?.message || 'analyze failed'
    const status = e?.httpStatus || (/缺少\s*API\s*Key/i.test(msg) ? 400 : 500)
    const payload = { error: msg }
    if (process.env.NODE_ENV !== 'production') {
      payload.debug = {
        providerUrl: e?.providerUrl,
        providerResponse: e?.providerResponse,
      }
    }
    console.warn('[StepA] failed:', payload)
    return res.status(status).json(payload)
  }
}

// 风水分析与物品清单（B）
export async function adviseFengshui(req, res) {
  try {
    const { imageElements, system, provider, prompt: promptOverride } = req.body || {}
    if (!imageElements) return res.status(400).json({ error: 'missing imageElements' })
    const sys = system || '你是专业风水顾问...'
    const prompt = promptOverride || `输入元素：\n${typeof imageElements==='string'?imageElements:JSON.stringify(imageElements)}\n\n请按 JSON 模板输出风水建议与应添置物品清单。`

    // mock: 仅在服务端环境变量开启时返回模拟建议
    if (process.env.MOCK_FENGSHUI === '1') {
      const out = await runOpenAICompat(provider, { prompt, system: sys })
      return res.json({ output: out.output })
    }

    const params = { ...(provider?.params || {}) }
    if (typeof params.baseURL === 'string') {
      params.baseURL = params.baseURL.trim().replace(/^ttps:\/\//i, 'https://').replace(/^ttp:\/\//i, 'http://')
      params.baseURL = params.baseURL.replace(/\/$/, '')
    }
    if (typeof params.path === 'string') {
      params.path = params.path.trim()
      if (!params.path.startsWith('/')) params.path = '/' + params.path
    }
    const safeProvider = { ...(provider || {}), params }

    if ((safeProvider?.type || '').toLowerCase() === 'openai-compat') {
      const pth = String(safeProvider.params?.path || '')
      if (!pth || /images\/generations/i.test(pth)) {
        safeProvider.params.path = '/chat/completions'
      }
    }

    const out = await runOpenAICompat(safeProvider, { prompt, system: sys })

    return res.json({ output: out.output })
  } catch (e) {
    const msg = e?.message || 'advise failed'
    const status = e?.httpStatus || (/缺少\s*API\s*Key/i.test(msg) ? 400 : 500)
    const payload = { error: msg }
    if (process.env.NODE_ENV !== 'production') {
      payload.debug = {
        providerUrl: e?.providerUrl,
        providerResponse: e?.providerResponse,
      }
    }
    return res.status(status).json(payload)
  }
}

// 参考图生成（C）：调用图片生成接口，支持本地 dataURL 或公网 URL 作为 originalImageUrl
export async function generateReference(req, res) {
  try {
    const { originalImageUrl, itemsToAdd = [], provider, prompt: promptOverride } = req.body || {}
    if (!originalImageUrl) return res.status(400).json({ error: 'missing originalImageUrl' })

    // mock: 返回一个 1x1 像素图片（仅环境变量开启时）
    if (process.env.MOCK_FENGSHUI === '1') {
      const r = await runOpenAIImagesCompat(provider, { prompt: '保持原图风格与布局，仅添加或调整指定元素' })
      const name = `gen_${Date.now()}.png`
      const filePath = path.join(uploadDir, name)
      if (r.url) {
        return res.json({ imageUrl: r.url })
      }
      const b64 = r.b64
      fs.writeFileSync(filePath, Buffer.from(b64, 'base64'))
      // 返回绝对URL，避免前端在 5173 下请求相对 /uploads 导致 404
      const origin = process.env.PUBLIC_SERVER_ORIGIN || `http://localhost:${process.env.PORT || 3001}`
      return res.json({ imageUrl: `${origin}/uploads/${name}` })
    }

    const prompt = promptOverride || `在保持原图不改变风格与布局的基础上，仅添加或调整以下元素：\n${itemsToAdd.map(i=>`${i.item}(${i.direction||''}/${i.area||''})`).join(', ')}`

    if ((provider?.type || '').toLowerCase() === 'gemini') {
      return res.json({ imageUrl: originalImageUrl })
    }

    // 解析 originalImageUrl：支持 dataURL、本地相对路径与 localhost 绝对URL
    let refUrl = null
    const origin = process.env.PUBLIC_SERVER_ORIGIN || `http://localhost:${process.env.PORT || 3001}`
    if (typeof originalImageUrl === 'string') {
      if (/^data:image\//i.test(originalImageUrl)) {
        // 优先上传到图床获得公网URL；失败则保存到本地
        try {
          const [meta, b64] = originalImageUrl.split(',')
          const ext = (meta.match(/data:(.*?);/) || [])[1]?.split('/')[1] || 'png'
          const name = `upload_${Date.now()}.${ext}`
          try {
            refUrl = await uploadToImageHost(Buffer.from(b64, 'base64'), name)
            console.log('[StepC] image hosted via', (process.env.IMAGE_HOST || 'auto'), '=>', refUrl)
          } catch (hostErr) {
            console.warn('[StepC] image host failed, fallback to local:', hostErr?.message || hostErr)
          }
          if (!refUrl) {
            fs.writeFileSync(path.join(uploadDir, name), Buffer.from(b64, 'base64'))
            refUrl = `${origin}/uploads/${name}`
            console.log('[StepC] saved dataURL locally =>', refUrl)
          }
        } catch (e) {
          console.warn('[StepC] failed to process dataURL:', e?.message || e)
        }
      } else if (/^https?:\/\//i.test(originalImageUrl)) {
        refUrl = originalImageUrl
      } else if (originalImageUrl.startsWith('/uploads/')) {
        refUrl = `${origin}${originalImageUrl}`
      }
    }

    // 仅当存在可访问的URL时，作为参考图传给 Doubao
    const images = refUrl ? [refUrl] : undefined
    const isDoubao = String(provider?.params?.baseURL || '').includes('volces.com') || (provider?.id || '').toLowerCase() === 'doubao'

    let r
    try {
      r = await runOpenAIImagesCompat(provider, { prompt, images })
    } catch (e) {
      // 针对豆包错误的降级：
      const pr = String(e?.providerResponse || e?.message || '')
      const isDownloadFail = /Error while downloading/i.test(pr) || /dial tcp|i\/o timeout|timeout/i.test(pr)
      if (isDoubao && (e?.httpStatus === 500 || /InternalServiceError/i.test(e?.message || '') || (e?.httpStatus === 400 && isDownloadFail))) {
        console.warn('[StepC] Doubao无法下载参考图，降级为无参考图生成')
        const downgraded = { ...provider, params: { ...(provider.params||{}), response_format: 'b64_json' } }
        r = await runOpenAIImagesCompat(downgraded, { prompt, images: undefined, size: '1024x1024' })
      } else {
        throw e
      }
    }

    // 豆包优先返回 URL；其他返回 base64
    const name = `gen_${Date.now()}.png`
    const filePath = path.join(uploadDir, name)
    if (r.url) {
      return res.json({ imageUrl: r.url })
    }
    const b64 = r.b64
    fs.writeFileSync(filePath, Buffer.from(b64, 'base64'))
    // 返回绝对URL，避免前端在 5173 下加载相对 /uploads 导致 404
    return res.json({ imageUrl: `${origin}/uploads/${name}` })
  } catch (e) {
    const msg = e?.message || 'generate failed'
    const status = e?.httpStatus || 500
    const payload = { error: msg }
    if (process.env.NODE_ENV !== 'production') {
      payload.debug = { providerUrl: e?.providerUrl, providerResponse: e?.providerResponse }
    }
    return res.status(status).json(payload)
  }
}
