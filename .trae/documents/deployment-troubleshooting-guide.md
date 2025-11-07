# AI Router 项目部署问题分析与解决方案

## 项目概述

AI Router 是一个前后端分离的应用，提供AI模型对比、风水分析等功能。项目使用React作为前端，Node.js+Express作为后端API服务，目前配置为Vercel部署环境。

## 当前部署配置问题分析

### 1. Vercel配置问题

**当前配置** (`vercel.json`):
```json
{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}
```

**问题分析**:
- 配置过于简单，只处理了前端路由重写
- 没有正确处理API路由，所有请求都被重写到前端页面
- 缺少服务器函数配置，无法正确处理后端API

### 2. 服务器架构适配问题

**当前架构**:
- 使用Express.js作为独立服务器
- 监听固定端口（3001）
- 使用静态文件服务

**问题分析**:
- Vercel采用Serverless架构，需要函数式API
- Express需要适配为Vercel Serverless Functions
- 静态文件服务和API路由需要分离处理

### 3. 环境变量配置问题

**当前环境变量模板** (`.env.template`):
- 包含大量AI服务商API密钥配置
- 图片存储服务配置（火山引擎TOS、imgbb）
- 服务器域名配置

**潜在问题**:
- 环境变量可能未正确配置到Vercel
- 敏感信息暴露风险
- 不同环境变量配置混淆

### 4. 构建流程问题

**当前构建脚本**:
```json
{
  "build": "vite build",
  "start": "node server/index.js",
  "preview": "NODE_ENV=production node server/index.js"
}
```

**问题分析**:
- 构建脚本只构建前端，未处理后端
- 生产环境启动方式不适用于Vercel
- 缺少Vercel特定的构建配置

## 正确的Vercel配置方案

### 1. 更新Vercel配置文件

创建新的 `vercel.json`:
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
    },
    {
      "src": "api/**/*.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/uploads/(.*)",
      "dest": "/api/uploads/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "functions": {
    "api/**/*.js": {
      "maxDuration": 30
    }
  }
}
```

### 2. 创建API目录结构

创建 `api/index.js` (Vercel Serverless Function):
```javascript
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

const app = express()

// 配置中间件
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || '*', 
  credentials: false 
}))
app.use(express.json({ limit: '50mb' }))

// 导入路由
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

// 导出为Vercel函数
export default app
```

### 3. 适配图片上传功能

创建 `api/uploads/[filename].js`:
```javascript
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const path = require('path')
const fs = require('fs')

export default async function handler(req, res) {
  const { filename } = req.query
  
  // 设置正确的Content-Type
  const ext = path.extname(filename).toLowerCase()
  const contentTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  }
  
  res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=31536000')
  
  // 返回图片数据
  // 注意：在Vercel上需要使用外部存储服务
  res.status(200).end()
}
```

## 环境变量配置指南

### 1. Vercel环境变量设置

在Vercel控制台设置以下环境变量：

```bash
# 必需环境变量
CORS_ORIGIN=https://your-domain.vercel.app
PUBLIC_SERVER_ORIGIN=https://your-domain.vercel.app

# AI服务商API密钥（根据需求配置）
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# 图片存储配置
IMAGE_HOST=imgbb
IMGBB_API_KEY=your_imgbb_key
```

### 2. 本地开发环境配置

复制 `.env.template` 为 `.env` 并配置：
```bash
# 开发环境配置
CORS_ORIGIN=http://localhost:5173
PUBLIC_SERVER_ORIGIN=http://localhost:3001
```

## 构建和部署步骤

### 1. 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.template .env
# 编辑 .env 文件，填入必要的API密钥

# 启动开发服务器
npm run dev
```

### 2. 生产构建

```bash
# 构建前端
npm run build

# 本地预览
npm run preview
```

### 3. Vercel部署

```bash
# 安装Vercel CLI
npm i -g vercel

# 登录Vercel
vercel login

# 部署项目
vercel --prod

# 或者在Vercel控制台连接GitHub自动部署
```

## 常见错误排查指南

### 1. API路由404错误

**症状**: 访问 `/api/*` 返回404

**解决方案**:
- 检查 `vercel.json` 路由配置
- 确认API文件存在于 `api/` 目录
- 验证函数导出格式正确

### 2. 环境变量未生效

**症状**: API调用失败，提示缺少密钥

**解决方案**:
- 在Vercel控制台检查环境变量设置
- 重新部署应用使环境变量生效
- 检查环境变量名称拼写

### 3. CORS错误

**症状**: 前端无法调用API，提示CORS错误

**解决方案**:
- 检查 `CORS_ORIGIN` 环境变量设置
- 确认前后端域名匹配
- 检查CORS中间件配置

### 4. 图片上传失败

**症状**: 图片上传后无法访问

**解决方案**:
- 检查图片存储服务配置
- 验证API密钥有效性
- 考虑使用CDN服务替代本地存储

### 5. 函数超时错误

**症状**: API调用超时，返回504错误

**解决方案**:
- 增加 `maxDuration` 配置
- 优化API响应时间
- 考虑使用流式响应

## 推荐的架构调整

### 1. 使用Vercel Functions

将服务器代码重构为独立的Vercel Functions，每个API端点一个函数：

```
api/
├── compare.js
├── compare-stream.js
├── fengshui/
│   ├── analyze-image.js
│   ├── advise.js
│   └── generate-ref.js
├── uploads/
│   └── [filename].js
└── openrouter/
    └── models.js
```

### 2. 图片存储服务化

使用专业的图片存储服务：
- 阿里云OSS
- 腾讯云COS
- AWS S3
- Cloudinary

### 3. 前端优化

- 使用Next.js替代纯React，获得更好的SSR支持
- 实现API路由代理，避免CORS问题
- 添加错误边界和加载状态

## 总结

当前的部署问题主要源于Vercel配置不当和服务器架构不适配。通过重构为Serverless架构、正确配置路由和环境变量，可以解决大部分部署问题。建议按照本指南逐步调整配置，确保每个环节都能正常工作。