# AI Router 项目部署修复方案

## 立即修复步骤

### 第一步：修复Vercel配置

**创建新的 `vercel.json` 文件：**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/index.js"
    },
    {
      "src": "/uploads/(.*)",
      "dest": "/api/uploads.js"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "functions": {
    "api/index.js": {
      "maxDuration": 30
    }
  }
}
```

### 第二步：创建API入口文件

**创建 `api/index.js` 文件：**

```javascript
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

// 创建上传目录
const uploadsDir = join(__dirname, '..', 'server', 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
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

// Vercel需要导出为默认函数
export default app
```

### 第三步：创建上传处理文件

**创建 `api/uploads.js` 文件：**

```javascript
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default async function handler(req, res) {
  const { filename } = req.query
  
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' })
  }
  
  // 安全检查：防止路径遍历
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  
  const filePath = join(__dirname, '..', 'server', 'uploads', filename)
  
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
```

### 第四步：修改package.json

**更新 `package.json` 中的构建脚本：**

```json
{
  "scripts": {
    "dev": "concurrently -n server,web -c blue,green \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server": "nodemon server/index.js",
    "dev:web": "vite",
    "build": "vite build",
    "build:vercel": "npm run build && npm run prepare:api",
    "prepare:api": "mkdir -p api && cp -r server api/",
    "start": "node server/index.js",
    "preview": "NODE_ENV=production node server/index.js",
    "vercel-build": "npm run build"
  }
}
```

### 第五步：配置环境变量

**在Vercel控制台设置以下环境变量：**

```bash
# 基础配置
CORS_ORIGIN=https://your-domain.vercel.app
PUBLIC_SERVER_ORIGIN=https://your-domain.vercel.app
NODE_ENV=production

# AI服务商API密钥（根据需求配置）
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_API_KEY=your_google_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# 图片存储配置
IMAGE_HOST=imgbb
IMGBB_API_KEY=your_imgbb_api_key

# 火山引擎TOS配置（可选）
VOLC_ACCESS_KEY_ID=your_volc_access_key
VOLC_SECRET_ACCESS_KEY=your_volc_secret_key
VOLC_BUCKET=your_bucket_name
VOLC_REGION=cn-beijing
VOLC_ENDPOINT=https://tos-s3-cn-beijing.volces.com
VOLC_PUBLIC_HOST=your_cdn_domain
```

### 第六步：适配服务器代码

**修改 `server/utils/imageHost.js` 以适配Vercel环境：**

```javascript
// 添加Vercel环境检测
const isVercel = process.env.VERCEL === '1' || process.env.NOW_REGION === 'dev1'

// 修改图片URL生成逻辑
export function getImageUrl(filename) {
  const origin = process.env.PUBLIC_SERVER_ORIGIN || 'http://localhost:3001'
  
  if (isVercel) {
    // Vercel环境使用/uploads路由
    return `${origin}/api/uploads?filename=${filename}`
  } else {
    // 本地环境使用/uploads目录
    return `${origin}/uploads/${filename}`
  }
}
```

## 部署验证步骤

### 1. 本地测试

```bash
# 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 测试本地构建
npm run build

# 测试本地服务器
npm run preview
```

### 2. Vercel部署测试

```bash
# 安装Vercel CLI
npm install -g vercel

# 登录Vercel
vercel login

# 部署到预览环境
vercel

# 如果预览环境正常，部署到生产环境
vercel --prod
```

### 3. 功能验证

部署完成后，验证以下功能：

1. **API路由测试**:
   ```bash
   curl https://your-domain.vercel.app/api/openrouter/models
   ```

2. **前端页面测试**:
   - 访问首页是否正常加载
   - 检查浏览器控制台是否有错误

3. **AI模型对比测试**:
   - 测试模型对比功能是否正常
   - 验证流式响应是否工作

4. **图片上传测试**:
   - 测试图片上传功能
   - 验证上传后的图片是否可以正常访问

## 常见问题快速修复

### 问题1: API返回404

**症状**: 所有API请求返回404

**快速修复**:
```bash
# 检查API路由文件是否存在
ls -la api/

# 重新创建API目录
mkdir -p api
# 重新部署
vercel --prod
```

### 问题2: CORS错误

**症状**: 前端无法调用API，浏览器报CORS错误

**快速修复**:
1. 检查Vercel环境变量中的 `CORS_ORIGIN`
2. 确保与前端域名完全匹配
3. 重新部署应用

### 问题3: 环境变量未生效

**症状**: API调用失败，提示缺少密钥

**快速修复**:
```bash
# 在Vercel控制台重新设置环境变量
vercel env add OPENAI_API_KEY production

# 重新部署
vercel --prod
```

### 问题4: 图片无法访问

**症状**: 上传的图片返回404

**快速修复**:
1. 检查图片存储服务配置
2. 验证API密钥是否有效
3. 检查上传目录权限

## 备用方案：使用传统服务器部署

如果Vercel部署持续遇到问题，可以考虑以下备用方案：

### 1. Railway部署

```bash
# 安装Railway CLI
npm install -g @railway/cli

# 登录并部署
railway login
railway init
railway up
```

### 2. Heroku部署

```bash
# 创建Procfile
echo "web: npm run preview" > Procfile

# 安装Heroku CLI并部署
heroku create your-app-name
git push heroku main
```

### 3. Docker部署

**创建 `Dockerfile`:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "run", "preview"]
```

## 总结

这个修复方案涵盖了从Vercel配置到代码适配的完整流程。按照这些步骤操作，应该能够解决大部分部署问题。关键在于：

1. 正确配置Vercel路由和环境变量
2. 适配Serverless架构
3. 处理好静态资源和API路由
4. 充分测试各项功能

如果仍然遇到问题，请检查Vercel控制台的具体错误日志，或者考虑使用备用部署方案。