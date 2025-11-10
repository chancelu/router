import React, { useState, useCallback, useEffect } from 'react'
import { 
  Box, TextField, Button, Grid, Card, CardContent, Typography, 
  Stack, Alert, Select, MenuItem, Stepper, Step, StepLabel,
  CircularProgress, Chip, IconButton, Tooltip, Paper, FormControl, InputLabel, Snackbar
} from '@mui/material'
import { useStore } from '../store'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import VisibilityIcon from '@mui/icons-material/Visibility'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'

const STEPS = [
  '上传图片',
  'AI识别内容',
  '风水分析',
  '生成建议图'
]

const StepIcon = ({ active, completed, error }) => {
  if (error) return <ErrorIcon color="error" />
  if (completed) return <CheckCircleIcon color="success" />
  if (active) return <CircularProgress size={20} />
  return <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #ccc' }} />
}

export default function FengshuiAnalysisTab() {
  const { providers, running, setRunning } = useStore()
  const API_ORIGIN = (import.meta.env && import.meta.env.VITE_SERVER_ORIGIN) ? String(import.meta.env.VITE_SERVER_ORIGIN).replace(/\/$/, '') : ''
  
  // 状态管理
  const [activeStep, setActiveStep] = useState(0)
  const [uploadedImage, setUploadedImage] = useState(null)
  const [imageSourceType, setImageSourceType] = useState('upload')
  const [imageUrl, setImageUrl] = useState('')
  const [recognizedContent, setRecognizedContent] = useState('')
  const [fengshuiAdvice, setFengshuiAdvice] = useState('')
  const [generatedImage, setGeneratedImage] = useState(null)
  const [stepErrors, setStepErrors] = useState({})
  
  // 非阻塞通知（替换 alert）
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' })
  const notify = (message, severity = 'info') => setSnack({ open: true, message: String(message || ''), severity })
  const closeSnack = () => setSnack(s => ({ ...s, open: false }))
  
  // 提供商选择
  const [providerAId, setProviderAId] = useState('')
  const [providerBId, setProviderBId] = useState('')
  const [providerCId, setProviderCId] = useState('')
  
  // 配置
  const [systemPromptA, setSystemPromptA] = useState(
    '你是室内空间视觉理解与方位提取专家。严格遵循JSON输出模板：{objects:[{name,position,relative_area,material,color,notes}], layout:{facing,doors,windows,bed,desk,sofa,stove,entrance}, directions:{north,south,east,west,center}}。\n\n必须依据所给图片本身内容，不得臆造不存在的物品与方位；若无法识别某项请置为null或省略该对象。避免使用通用样例（如床、桌）替代真实识别结果。'
  )
  const [systemPromptB, setSystemPromptB] = useState(
    '你是专业风水顾问。严格仅输出JSON：{advice:[string], itemsToAdd:[{item,reason,area,direction,style,color,size,material}]}。先给出1-3条建议，再给出3件需添置物品。若输入不完整也需给出一般性建议。所有建议与物品必须与输入元素和方位直接相关，且尺度与场景匹配（桌面推荐桌面摆件/设置，家居推荐家具/软装）。不得输出任何非JSON文本。禁止扩展图片内容：仅在当前图片可见范围内添加或微调，不进行空间外延或结构性改动，不推荐需外扩空间的大型家具或施工。'
  )
  // 新增：A/B/C 的 Prompt（可编辑）
  const [promptA, setPromptA] = useState('请分析这张图片，仅提取关键元素、空间布局与方位信息，并用上述 JSON 模板输出，不要夹杂说明文字或提出问题。')
  const [promptB, setPromptB] = useState('')
  const [promptC, setPromptC] = useState('')
  const [promptBEdited, setPromptBEdited] = useState(false)
  const [promptCEdited, setPromptCEdited] = useState(false)

  // 辅助：检测 C 的保存内容是否仅为标题（视为未编辑）
  const isCHeaderOnly = (s) => {
    const base = '在保持原图不改变风格与布局的基础上，仅添加或调整以下元素：'
    const t = String(s || '').trim()
    return t.replace(/\s+/g, '') === base.replace(/\s+/g, '')
  }

  // 根据步骤输出自动生成默认 Prompt（用户未手动编辑时）
  useEffect(() => {
    if (!promptBEdited) {
      const base = typeof recognizedContent === 'string' ? recognizedContent : JSON.stringify(recognizedContent || '')
      const hints = buildSceneHints(recognizedContent)
      setPromptB(`输入元素：\n${base}\n\n仅输出JSON：{advice:[string], itemsToAdd:[{item,reason,area,direction,style,color,size,material}]}。规则：\n1) 先输出1-3条建议；\n2) 然后输出3件需添置物品；\n3) 若输入不完整也给出一般性建议；\n4) 建议与物品必须与输入元素/方位直接相关；\n5) 尺度/场景要求：${hints};\n6) 禁止扩展图片内容：仅在当前图片可见范围内添加或微调，不进行空间外延或结构性改动，不推荐需外扩空间的大型家具或施工；\n7) 严禁输出除JSON外任何文本。`)
    }
  }, [recognizedContent, promptBEdited])

  useEffect(() => {
    if (!promptCEdited || isCHeaderOnly(promptC)) {
      let itemsToAdd = []
      try {
        const advice = JSON.parse(fengshuiAdvice || 'null')
        itemsToAdd = advice?.itemsToAdd || []
      } catch {}
      const itemsStr = itemsToAdd.map(i => `${i.item}(${i.direction || ''}/${i.area || ''})`).join(', ')
      setPromptC(`在保持原图不改变风格与布局的基础上，仅添加或调整以下元素：\n${itemsStr}`)
    }
  }, [fengshuiAdvice, promptCEdited])
  // 保存配置（localStorage）
  const LS_KEYS = {
    systemPromptA: 'fs_systemPromptA',
    promptA: 'fs_promptA',
    systemPromptB: 'fs_systemPromptB',
    promptB: 'fs_promptB',
    promptC: 'fs_promptC'
  }
  const saveConfig = (key, value) => {
    try { localStorage.setItem(key, value || ''); notify('已保存配置', 'success') } catch (e) { console.warn('saveConfig failed', e) }
  }
  useEffect(() => {
    try {
      const aSys = localStorage.getItem(LS_KEYS.systemPromptA); if (aSys !== null) setSystemPromptA(aSys)
      const a = localStorage.getItem(LS_KEYS.promptA); if (a !== null) setPromptA(a)
      const bSys = localStorage.getItem(LS_KEYS.systemPromptB); if (bSys !== null) setSystemPromptB(bSys)
      const b = localStorage.getItem(LS_KEYS.promptB); if (b !== null) { setPromptB(b); if (String(b).trim().length > 0) setPromptBEdited(true) }
      const c = localStorage.getItem(LS_KEYS.promptC); if (c !== null) { setPromptC(c); if (String(c).trim().length > 0 && !isCHeaderOnly(c)) setPromptCEdited(true) }
    } catch (e) { console.warn('load saved prompts failed', e) }
  }, [])

  // 图片上传处理
  const handleImageUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const imageData = e.target.result
      setUploadedImage({
        name: file.name,
        size: file.size,
        type: file.type,
        data: imageData
      })
      setActiveStep(1)
      setStepErrors({})
      notify('图片已选择，准备识别', 'info')
    }
    reader.readAsDataURL(file)
  }

  // 步骤A：图片识别（返回输出，供后续串联使用）
  const runStepA = async () => {
    const isUrl = imageSourceType === 'url'
    if ((isUrl && !imageUrl) || (!isUrl && !uploadedImage) || !providerAId) {
      notify(isUrl ? '请输入公网图片URL并选择识别模型' : '请先上传图片并选择识别模型', 'warning')
      return null
    }
  
    setRunning(true)
    setStepErrors(prev => ({ ...prev, a: null }))
    
    try {
      const provider = providers.find(p => p.id === providerAId)
      if (!provider) throw new Error('未找到指定的模型提供商')
  
      // 直接将图片传给后端：公网URL或本地Base64二选一
      const analyzeResp = await fetch(`${API_ORIGIN || ''}/api/fengshui/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: isUrl ? imageUrl : undefined,
          imageDataUrl: !isUrl ? uploadedImage.data : undefined,
          system: systemPromptA,
          prompt: promptA,
          provider: {
            ...provider,
            params: { ...provider.params }
          }
        })
      })
  
      if (!analyzeResp.ok) {
        const error = await analyzeResp.json().catch(()=>({}))
        const info = []
        if (error?.debug?.providerUrl) info.push(`接口: ${error.debug.providerUrl}`)
        if (error?.debug?.providerResponse) info.push(`响应: ${String(error.debug.providerResponse).slice(0, 200)}`)
        throw new Error((error.error || '图片识别失败') + (info.length ? '\n' + info.join('\n') : ''))
      }
  
      const { output } = await analyzeResp.json()
      console.log('[StepA] output length:', (output||'').length)
      setRecognizedContent(output)
      setActiveStep(2)
      notify('步骤A完成', 'success')
      return output
    } catch (error) {
      console.error('步骤A失败:', error)
      setStepErrors(prev => ({ ...prev, a: error.message }))
      notify('图片识别失败: ' + error.message, 'error')
      return null
    } finally {
      setRunning(false)
    }
  }

  // 步骤B：风水分析（可接收 A 的输出作为覆盖，返回建议）
  const runStepB = async (elementsOverride = null) => {
    if (elementsOverride && (elementsOverride.nativeEvent || elementsOverride.target || elementsOverride.currentTarget)) {
      console.warn('[StepB] received click event, ignoring elementsOverride')
      elementsOverride = null
    }
    const imageElements = elementsOverride ?? recognizedContent
    if (!imageElements || !providerBId) {
      notify('请先完成图片识别并选择分析模型', 'warning')
      return null
    }

    // 修复：定义并校验步骤B的 provider
    const provider = providers.find(p => p.id === providerBId)
    if (!provider) {
      notify('未找到所选分析模型，请重新选择', 'warning')
      return null
    }

    setRunning(true)
    setStepErrors(prev => ({ ...prev, b: null }))
    const controller = new AbortController()
    const timeoutMsB = 120000 // 提升到120秒，避免长耗时分析被中断
     const timeout = setTimeout(() => controller.abort(), timeoutMsB)

     try {
       const response = await fetch(`${API_ORIGIN || ''}/api/fengshui/advise`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           imageElements,
           system: systemPromptB,
           prompt: promptB,
           provider: {
             ...provider,
             params: { ...provider.params }
           }
         }),
         signal: controller.signal
       })

       const json = await response.json().catch(() => ({}))
       if (!response.ok) {
         const info = []
         if (json?.debug?.providerUrl) info.push(`接口: ${json.debug.providerUrl}`)
         if (json?.debug?.providerResponse) info.push(`响应: ${String(json.debug.providerResponse).slice(0, 200)}`)
         info.unshift(`状态码: ${response.status}`)
         info.unshift(`路径: /api/fengshui/advise`)
         const msg = (json.error || '风水分析失败') + (info.length ? '\n' + info.join('\n') : '')
         setStepErrors(prev => ({ ...prev, b: msg }))
         notify(msg, 'error')
         clearTimeout(timeout)
         return null
       }

       const { output } = json
       console.log('[StepB] output length:', (output||'').length)
       setFengshuiAdvice(output)
       setActiveStep(3)
       notify('步骤B完成', 'success')
       clearTimeout(timeout)
       return output
     } catch (error) {
       console.error('步骤B失败:', error)
       setStepErrors(prev => ({ ...prev, b: error.message }))
       notify('风水分析失败: ' + error.message, 'error')
       return null
     } finally {
       clearTimeout(timeout)
       setRunning(false)
     }
  }

  // 步骤C：图片生成（可接收 B 的输出作为覆盖，避免状态未同步）
  const runStepC = async (adviceOverride = null) => {
    const adviceSrc = adviceOverride ?? fengshuiAdvice
    const adviceStr = typeof adviceSrc === 'string' ? adviceSrc.trim() : ''
    const src = imageSourceType === 'url' ? (imageUrl || '') : (uploadedImage?.data || '')
    const provider = providers.find(p => p.id === providerCId)

    const precheck = {
      hasAdvice: adviceStr.length > 0,
      adviceLen: adviceStr.length,
      usedOverride: adviceOverride ? true : false,
      providerCId,
      providerFound: !!provider,
      imageSourceType,
      srcLen: (src || '').length,
      srcType: /^data:image\//i.test(src) ? 'dataURL' : (/^https?:\/\//i.test(src) ? 'http/https' : (String(src).startsWith('/uploads/') ? 'relativeUploads' : 'unknown')),
      itemsCount: 0,
    }
    console.log('[StepC] precheck:', precheck)

    if (!precheck.hasAdvice) { notify('请先完成风水分析：结果为空', 'warning'); return }
    if (!providerCId) { notify('请先选择生成模型', 'warning'); return }
    if (!precheck.providerFound) { notify('未找到所选生成模型，请重新选择', 'warning'); return }
    if (!src) { notify('未提供原图：请上传图片或填写公网URL', 'warning'); return }

    // 解析 B 的输出为 itemsToAdd（增强容错：从非纯JSON文本中提取 JSON 片段，并兼容中文键）
    let itemsToAdd = []
    const tryParseAdvice = (s) => {
      const t = String(s || '')
      // 尝试直接解析纯JSON
      try { return JSON.parse(t) } catch {}
      // 清理非JSON前后缀与多余字符
      const cleaned = t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      try { return JSON.parse(cleaned) } catch {}
      // 从文本中提取最大JSON片段
      const first = cleaned.indexOf('{')
      const last = cleaned.lastIndexOf('}')
      if (first >= 0 && last > first) {
        const candidate = cleaned.slice(first, last + 1)
        try { return JSON.parse(candidate) } catch {}
      }
      return null
    }
    const adviceJson = tryParseAdvice(adviceStr)
    if (adviceJson) {
      // 统一提取 itemsToAdd，兼容中文键与下划线风格
      const candidates = [
        adviceJson.itemsToAdd,
        adviceJson['应添置物品清单'],
        adviceJson['需添置物品清单'],
        adviceJson.items_to_add
      ]
      for (const cand of candidates) {
        if (Array.isArray(cand)) { itemsToAdd = cand; break }
        if (typeof cand === 'string' && cand.trim()) {
          // 字符串容错：按逗号/顿号/分号拆分为条目
          itemsToAdd = cand.split(/[，,；;\n]+/).filter(Boolean).map(s => ({ item: s.trim() }))
          break
        }
      }
    }
    // 同步更新 C 的默认 Prompt（仅当用户未编辑或仅保存标题时）
    if (!promptCEdited || isCHeaderOnly(promptC)) {
      const itemsStr = itemsToAdd.map(i => `${i.item}(${i.direction || ''}/${i.area || ''})`).join(', ')
      setPromptC(`在保持原图不改变风格与布局的基础上，仅添加或调整以下元素：\n${itemsStr}`)
    }

    const body = {
      originalImageUrl: src,
      itemsToAdd,
      // 仅当用户手动编辑过且非空时才覆盖
      prompt: (promptCEdited && String(promptC).trim().length > 0) ? promptC : undefined,
      provider: {
        ...provider,
        params: { ...provider.params }
      }
    }

    setRunning(true)
    setStepErrors(prev => ({ ...prev, c: null }))

    const controller = new AbortController()
    const timeoutMsC = 120000 // 提升到120秒，避免长耗时生成被中断
    const timeout = setTimeout(() => controller.abort(), timeoutMsC)

    try {
      const response = await fetch(`${API_ORIGIN || ''}/api/fengshui/generate-ref`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })

      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        const info = []
        if (json?.debug?.providerUrl) info.push(`接口: ${json.debug.providerUrl}`)
        if (json?.debug?.providerResponse) info.push(`响应: ${String(json.debug.providerResponse).slice(0, 200)}`)
        const msg = (json.error || '图片生成失败') + (info.length ? '\n' + info.join('\n') : '')
        setStepErrors(prev => ({ ...prev, c: msg }))
        notify(msg, 'error')
        clearTimeout(timeout)
        return
      }

      const genUrl = json.imageUrl || ''
      if (!genUrl) throw new Error('生成成功但返回空链接')
      setGeneratedImage(genUrl)
      setActiveStep(4)
      console.log('[StepC] success url:', genUrl)
      notify('步骤C完成', 'success')
    } catch (error) {
      console.error('步骤C失败:', error)
      if (error?.name === 'AbortError') {
        setStepErrors(prev => ({ ...prev, c: '请求超时（>120秒），请重试或更换生成模型' }))
        notify('图片生成请求超时（>120秒）。请重试或更换模型', 'warning')
      } else {
        setStepErrors(prev => ({ ...prev, c: error?.message || '未知错误' }))
        notify('图片生成失败: ' + (error?.message || '未知错误'), 'error')
      }
    } finally {
      clearTimeout(timeout)
      setRunning(false)
    }
  }

  // 一键运行所有步骤（串联使用返回值，避免状态未同步导致跳步）
  const runAllSteps = async () => {
    if (!uploadedImage && !imageUrl) {
      notify('请先上传图片或填写URL', 'warning')
      return
    }
    
    if (!providerAId || !providerBId || !providerCId) {
      notify('请为三个步骤都选择对应的模型提供商', 'warning')
      return
    }

    setActiveStep(1)
    const aOut = await runStepA()
    if (aOut) {
      const bOut = await runStepB(aOut)
      if (bOut) {
        await runStepC(bOut)
      }
    }
  }

  // 重置所有步骤
  const resetAll = () => {
    setActiveStep(0)
    setUploadedImage(null)
    setImageUrl('')
    setImageSourceType('upload')
    setRecognizedContent('')
    setFengshuiAdvice('')
    setGeneratedImage(null)
    setStepErrors({})
    notify('已重置', 'info')
  }

  // 下载生成的图片
  const downloadGeneratedImage = () => {
    if (generatedImage) {
      const link = document.createElement('a')
      link.href = generatedImage
      link.download = `fengshui_generated_${Date.now()}.png`
      link.click()
      notify('图片已下载', 'success')
    }
  }

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        风水图片分析：上传室内图片，AI将识别空间布局，提供风水建议，并生成优化后的参考图
      </Alert>

      {/* 非阻塞通知 */}
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={closeSnack} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={closeSnack} severity={snack.severity} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>

      {/* 步骤指示器 */}
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((label, index) => (
          <Step key={label}>
            <StepLabel 
              StepIconComponent={() => (
                <StepIcon 
                  active={activeStep === index} 
                  completed={activeStep > index}
                  error={stepErrors[['upload', 'a', 'b', 'c'][index]]}
                />
              )}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <Grid container spacing={3}>
        {/* 左侧：图片上传和配置 */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>1. 上传图片</Typography>
              
              <Select
                size="small"
                value={imageSourceType}
                onChange={(e) => setImageSourceType(e.target.value)}
              >
                <MenuItem value="upload">本地上传</MenuItem>
                <MenuItem value="url">公网图片URL</MenuItem>
              </Select>
              
              {imageSourceType === 'upload' ? (
                <Box
                  sx={{
                    border: '2px dashed #ccc',
                    borderRadius: 2,
                    p: 3,
                    mt: 2,
                    textAlign: 'center',
                    cursor: 'pointer',
                    '&:hover': { borderColor: '#1976d2', bgcolor: 'action.hover' }
                  }}
                  onClick={() => document.getElementById('image-upload').click()}
                >
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  {uploadedImage ? (
                    <Box>
                      <img
                        src={uploadedImage.data}
                        alt="上传图片"
                        style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }}
                      />
                      <Typography variant="caption" display="block" mt={1}>
                        {uploadedImage.name} ({Math.round(uploadedImage.size / 1024)}KB)
                      </Typography>
                    </Box>
                  ) : (
                    <Box>
                      <CloudUploadIcon sx={{ fontSize: 48, color: 'action.active' }} />
                      <Typography variant="body2" color="text.secondary" mt={1}>
                        点击上传图片或拖拽到此处
                      </Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ mt: 2 }}>
                  <TextField
                    fullWidth
                    label="公网图片URL"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="如：https://example.com/room.jpg"
                    sx={{ mb: 2 }}
                  />
                  {imageUrl && (
                    <Box sx={{ textAlign: 'center' }}>
                      <img
                        src={imageUrl}
                        alt="公网图片预览"
                        style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }}
                      />
                    </Box>
                  )}
                </Box>
              )}
              {(uploadedImage || imageUrl) && (
                <Button variant="outlined" fullWidth onClick={resetAll} sx={{ mt: 2 }}>
                  重新选择
                </Button>
              )}
            </CardContent>
          </Card>
          {/* 其余左侧卡片省略 */}

          {/* 模型选择 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>模型配置</Typography>
              <FormControl fullWidth sx={{ mb: 1 }}>
                <InputLabel>步骤A - 图片识别</InputLabel>
                <Select value={providerAId} onChange={(e) => setProviderAId(e.target.value)} label="步骤A - 图片识别">
                  <MenuItem value=""><em>请选择模型</em></MenuItem>
                  {providers.map(p => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl fullWidth sx={{ mb: 1 }}>
                <InputLabel>步骤B - 风水分析</InputLabel>
                <Select value={providerBId} onChange={(e) => setProviderBId(e.target.value)} label="步骤B - 风水分析">
                  <MenuItem value=""><em>请选择模型</em></MenuItem>
                  {providers.map(p => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl fullWidth sx={{ mb: 1 }}>
                <InputLabel>步骤C - 图片生成</InputLabel>
                <Select value={providerCId} onChange={(e) => setProviderCId(e.target.value)} label="步骤C - 图片生成">
                  <MenuItem value=""><em>请选择模型</em></MenuItem>
                  {providers.map(p => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
                </Select>
              </FormControl>
            </CardContent>
          </Card>

          {/* 控制按钮 */}
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Button
              variant="contained"
              onClick={runAllSteps}
              disabled={running || !((imageSourceType === 'url' ? imageUrl : uploadedImage)) || !providerAId || !providerBId || !providerCId}
              fullWidth
            >
              {running ? '处理中...' : '一键分析'}
            </Button>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              onClick={runStepA}
              disabled={running || !((imageSourceType === 'url' ? imageUrl : uploadedImage)) || !providerAId}
              sx={{ flex: 1 }}
            >
              仅识别
            </Button>
            <Button
              variant="outlined"
              onClick={runStepB}
              disabled={running || !recognizedContent || !providerBId}
              sx={{ flex: 1 }}
            >
              仅分析
            </Button>
            <Button
              variant="outlined"
              onClick={() => runStepC(fengshuiAdvice)}
              disabled={
                running ||
                !providerCId ||
                !((imageSourceType === 'url' ? imageUrl : uploadedImage)) ||
                !(typeof fengshuiAdvice === 'string' && fengshuiAdvice.trim())
              }
              sx={{ flex: 1 }}
            >
              仅生成
            </Button>
          </Stack>
        </Grid>

        {/* 右侧：结果展示 */}
        <Grid item xs={12} md={8}>
          <Stack spacing={2}>
            {/* 提示与传输预览 */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>提示与传输（可编辑）</Typography>
                <Typography variant="caption">A 的 System</Typography>
                <TextField fullWidth multiline minRows={2} value={systemPromptA} onChange={(e)=>setSystemPromptA(e.target.value)} sx={{ mb: 1 }} />
                <Button size="small" variant="outlined" onClick={()=>saveConfig(LS_KEYS.systemPromptA, systemPromptA)} sx={{ mb: 2 }}>保存 A 的 System</Button>
                <TextField fullWidth multiline minRows={2} value={promptA} onChange={(e)=>setPromptA(e.target.value)} label="A 的 Prompt" sx={{ mb: 1 }} />
                <Button size="small" variant="outlined" onClick={()=>saveConfig(LS_KEYS.promptA, promptA)} sx={{ mb: 2 }}>保存 A 的 Prompt</Button>

                <Typography variant="caption">B 的 System</Typography>
                <TextField fullWidth multiline minRows={2} value={systemPromptB} onChange={(e)=>setSystemPromptB(e.target.value)} sx={{ mb: 1 }} />
                <Button size="小" variant="outlined" onClick={()=>saveConfig(LS_KEYS.systemPromptB, systemPromptB)} sx={{ mb: 2 }}>保存 B 的 System</Button>
                <TextField fullWidth multiline minRows={2} value={promptB} onChange={(e)=>{setPromptB(e.target.value); setPromptBEdited(String(e.target.value).trim().length > 0)}} label="B 的 Prompt（默认基于 A 输出自动生成）" sx={{ mb: 1 }} />
                <Button size="小" variant="outlined" onClick={()=>saveConfig(LS_KEYS.promptB, promptB)} sx={{ mb: 2 }}>保存 B 的 Prompt</Button>

                <TextField fullWidth multiline minRows={2} value={promptC} onChange={(e)=>{setPromptC(e.target.value); setPromptCEdited(String(e.target.value).trim().length > 0)}} label="C 的 Prompt（默认基于 B 输出自动生成）" sx={{ mb: 1 }} />
                <Button size="小" variant="outlined" onClick={()=>saveConfig(LS_KEYS.promptC, promptC)} sx={{ mb: 2 }}>保存 C 的 Prompt</Button>
              </CardContent>
            </Card>

            {recognizedContent && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="subtitle1">图片识别结果</Typography>
                    <Chip label="步骤A完成" color="success" size="small" />
                  </Stack>
                  <TextField fullWidth multiline minRows={6} maxRows={10} value={recognizedContent} onChange={(e) => setRecognizedContent(e.target.value)} variant="outlined" sx={{ '& .MuiOutlinedInput-root': { fontFamily: 'monospace', fontSize: 14 } }} />
                </CardContent>
              </Card>
            )}

            {fengshuiAdvice && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="subtitle1">风水分析建议</Typography>
                    <Chip label="步骤B完成" color="success" size="small" />
                  </Stack>
                  <TextField fullWidth multiline minRows={8} maxRows={15} value={fengshuiAdvice} onChange={(e) => setFengshuiAdvice(e.target.value)} variant="outlined" sx={{ '& .MuiOutlinedInput-root': { fontFamily: 'monospace', fontSize: 14 } }} />
                </CardContent>
              </Card>
            )}

            {generatedImage && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="subtitle1">优化后的风水参考图</Typography>
                    <Chip label="步骤C完成" color="success" size="small" />
                  </Stack>
                  <Box sx={{ textAlign: 'center', mb: 2 }}>
                    <img src={generatedImage} alt="风水参考图" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }} />
                  </Box>
                  <Stack direction="row" spacing={1} justifyContent="center">
                    <Button variant="contained" startIcon={<DownloadIcon />} onClick={downloadGeneratedImage}>下载图片</Button>
                    <Button variant="outlined" startIcon={<VisibilityIcon />} onClick={() => window.open(generatedImage, '_blank')}>查看大图</Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {!recognizedContent && !fengshuiAdvice && !generatedImage && (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', bgcolor: 'grey.50' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>开始风水分析</Typography>
                <Typography variant="body2" color="text.secondary">上传一张室内图片，选择合适的模型，开始三步骤的风水分析流程</Typography>
              </Paper>
            )}
          </Stack>
        </Grid>
      </Grid>
    </Box>
  )
}

// 基于步骤A识别结果生成场景与尺度提示
function buildSceneHints(recognizedContent) {
  let data = null
  try { data = typeof recognizedContent === 'string' ? JSON.parse(recognizedContent) : recognizedContent } catch {}
  const names = Array.isArray(data?.objects) ? data.objects.map(o => String(o?.name || '').toLowerCase()) : []
  const hasDesk = names.some(n => ['desk','table','workbench','书桌','桌子'].includes(n))
  const hasMonitor = names.some(n => ['monitor','display','显示器'].includes(n))
  const hasLaptop = names.some(n => ['laptop','notebook','笔记本'].includes(n))
  const hasKeyboard = names.some(n => ['keyboard','键盘'].includes(n))
  const hasMouse = names.some(n => ['mouse','鼠标'].includes(n))
  const hasBed = names.some(n => ['bed','床'].includes(n))
  const hasSofa = names.some(n => ['sofa','沙发'].includes(n))
  const hasDining = names.some(n => ['diningtable','餐桌','dining table'].includes(n))
  const hasCabinet = names.some(n => ['cabinet','柜子','wardrobe','衣柜'].includes(n))

  let scene = 'generic'
  if ((hasDesk && (hasMonitor || hasLaptop || hasKeyboard || hasMouse)) || (hasDesk && !hasBed && !hasSofa)) scene = 'desktop'
  else if (hasBed || hasSofa || hasDining || hasCabinet) scene = 'room'

  const dirKeys = data?.directions ? Object.keys(data.directions).filter(k => data.directions[k]) : []
  const dirHint = dirKeys.length ? `可用方位: ${dirKeys.join(', ')}` : '如有方位信息请在 direction 字段中体现'

  if (scene === 'desktop') {
    return `场景为桌面/工作台：建议与物品应为桌面尺度（如理线器、小型植物、笔筒、显示器支架、桌垫），避免家具级推荐。${dirHint}。`
  }
  if (scene === 'room') {
    return `场景为房间/家居：建议与物品应为家居/软装尺度（如地毯、落地灯、墙面装饰、边几、收纳柜），避免过小的桌面级物品。${dirHint}。`
  }
  return `根据识别场景选择合适尺度：桌面图片推荐桌面摆件与设置；家居图片推荐家具与软装。${dirHint}。`
}