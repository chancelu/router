import React, { useMemo, useState, useEffect } from 'react'
import { useStore } from './store'
import { AppBar, Toolbar, Container, Box, Typography, TextField, Button, Grid, Card, CardContent, Chip, IconButton, Tooltip, Stack, Divider, Alert, Tabs, Tab, Accordion, AccordionSummary, AccordionDetails, Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControlLabel, Select, MenuItem } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ReplayIcon from '@mui/icons-material/Replay'
import SettingsIcon from '@mui/icons-material/Settings'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteIcon from '@mui/icons-material/Delete'
import axios from 'axios'
const now = () => Date.now()

function ProviderCard({ r, onRetry }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{r.name}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {r.timings && <Chip size="small" label={`${r.timings.durationMs} ms`} />}
            {r.usage && (r.usage.total_tokens !== undefined) && <Chip size="small" color="primary" label={`tokens ${r.usage.total_tokens}`} />}
            <Tooltip title="复制">
              <IconButton size="small" onClick={() => navigator.clipboard.writeText(r.output || r.error || '')}><ContentCopyIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="重试">
              <IconButton size="small" onClick={() => onRetry(r.id)}><ReplayIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Divider sx={{ my: 1 }} />
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {r.ok ? (r.output || '') : (r.error || '出错')}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const { prompt, system, providers, running, results, presets, setPrompt, setSystem, setProviders, setRunning, setResults, savePreset, applyPreset, deletePreset, addProvider, removeProvider, saveProviders } = useStore()
  const [tab, setTab] = useState(0)
  const [presetName, setPresetName] = useState('默认预设')

  const enabledProviders = useMemo(() => providers.filter(p => p.enabled), [providers])
  const [streaming, setStreaming] = useState(true)

  // 风水应用状态
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageSourceType, setImageSourceType] = useState('url')
  const [aSystem, setASystem] = useState('')
  const [bSystem, setBSystem] = useState('')
  const [aOutput, setAOutput] = useState('')
  const [bOutput, setBOutput] = useState('')
  const [cPrompt, setCPrompt] = useState('')
  const [cImageUrl, setCImageUrl] = useState('')
  const [styleHints, setStyleHints] = useState('')
  const [providerAId, setProviderAId] = useState('')
  const [providerBId, setProviderBId] = useState('')
  const [providerCId, setProviderCId] = useState('')
  // 新增：A/B 的 Prompt 及编辑状态
  const [aPrompt, setAPrompt] = useState('请分析这张图片，提取关键元素、空间布局与方位信息，并用上述 JSON 模板输出，不要夹杂说明文字。')
  const [bPrompt, setBPrompt] = useState('')
  const [bPromptEdited, setBPromptEdited] = useState(false)
  const [cPromptEdited, setCPromptEdited] = useState(false)
  
  // 根据 A 输出动态生成 B 的默认 Prompt（未编辑时）
  useEffect(() => {
    if (!bPromptEdited) {
      const base = typeof aOutput === 'string' ? aOutput : JSON.stringify(aOutput || '')
      setBPrompt(`输入元素：\n${base}\n\n请按 JSON 模板输出风水建议与应添置物品清单。`)
    }
  }, [aOutput, bPromptEdited])

  // 根据 B 输出与风格提示动态生成 C 的默认 Prompt（未编辑时）
  useEffect(() => {
    if (!cPromptEdited) {
      let itemsToAdd = []
      try {
        const advice = JSON.parse(bOutput || 'null')
        itemsToAdd = advice?.itemsToAdd || []
      } catch {}
      const itemsStr = itemsToAdd.map(i=>`${i.item}(${i.direction||''}/${i.area||''})`).join(', ')
      setCPrompt(`在保持原图风格与布局的基础上，添加/调整以下元素：\n${itemsStr}\n\n风格倾向：${styleHints}`)
    }
  }, [bOutput, styleHints, cPromptEdited])

  const onImageChange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setImageDataUrl(reader.result)
    reader.readAsDataURL(f)
  }

  const runA = async () => {
    const url = (imageUrl || '').trim()
    const hasUrl = /^https?:\/\//i.test(url)
    const hasData = (imageDataUrl || '').startsWith('data:image/')
    if (!hasUrl && !hasData) { alert('请先上传图片或填写公网URL'); return }
    const provider = providers.find(p => p.id === providerAId)
    if (!provider) { alert('请选择提供商'); return }
    const body = { system: aSystem, provider, imageUrl: undefined, imageDataUrl: undefined, prompt: aPrompt }
    if (hasUrl) body.imageUrl = imageUrl
    else body.imageDataUrl = imageDataUrl
    try {
      console.log('[App] runA start', { imageSourceType, hasUrl, hasData, provider: { id: provider.id, name: provider.name }, params: provider.params })
      setRunning(true)
      const { data } = await axios.post('/api/fengshui/analyze-image', body)
      setAOutput(data?.output || data?.text || JSON.stringify(data, null, 2))
    } catch (e) {
      const status = e?.response?.status
      const payload = e?.response?.data || {}
      const msg = payload?.error || e?.message || '未知错误'
      const debug = payload?.debug || {}
      const info = []
      if (status) info.push(`状态: ${status}`)
      if (debug.providerUrl) info.push(`接口: ${debug.providerUrl}`)
      if (debug.providerResponse) info.push(`响应: ${String(debug.providerResponse).slice(0, 200)}`)
      console.error('步骤A失败:', e)
      alert('图片识别失败: ' + msg + (info.length ? '\n' + info.join('\n') : ''))
    } finally { setRunning(false) }
  }

  const runB = async () => {
    if (!aOutput) { alert('请先完成步骤A'); return }
    const provider = providers.find(p => p.id === providerBId)
    if (!provider) { alert('请在 B 中选择一个已配置的提供商'); return }
    setRunning(true)
    try {
      console.log('[App] runB start', { provider: { id: provider.id, name: provider.name }, params: provider.params })
      const body = { imageElements: aOutput, system: bSystem, prompt: bPrompt, provider }
      const resp = await fetch('/api/fengshui/advise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        const info = []
        if (json?.debug?.providerUrl) info.push(`接口: ${json.debug.providerUrl}`)
        if (json?.debug?.providerResponse) info.push(`响应: ${String(json.debug.providerResponse).slice(0, 200)}`)
        throw new Error((json.error || 'advise failed') + (info.length ? '\n' + info.join('\n') : ''))
      }
      setBOutput(json.output || '')
    } catch (e) { console.error(e); alert('风水分析失败: ' + (e?.message || '未知错误')); } finally { setRunning(false) }
  }

  const runC = async () => {
    if (!bOutput) { alert('请先完成步骤B'); return }
    const provider = providers.find(p => p.id === providerCId)
    if (!provider) return
    const src = imageSourceType === 'url' ? (imageUrl || '') : (imageDataUrl || '')
    // 从 B 输出中解析物品清单
    let itemsToAdd = []
    try {
      const advice = JSON.parse(bOutput)
      itemsToAdd = advice.itemsToAdd || []
    } catch (err) {
      console.warn('无法解析风水建议为JSON，将使用原始文本')
    }
    const body = { originalImageUrl: src, itemsToAdd, styleHints, prompt: cPrompt, provider }
    try {
      console.log('[App] runC start', { provider: { id: provider.id, name: provider.name }, params: provider.params, itemsCount: itemsToAdd.length })
      setRunning(true)
      const response = await fetch('/api/fengshui/generate-ref', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        const info = []
        if (json?.debug?.providerUrl) info.push(`接口: ${json.debug.providerUrl}`)
        if (json?.debug?.providerResponse) info.push(`响应: ${String(json.debug.providerResponse).slice(0, 200)}`)
        throw new Error((json.error || '图片生成失败') + (info.length ? '\n' + info.join('\n') : ''))
      }
      setCImageUrl(json.imageUrl || '')
    } catch (e) { console.error(e); alert('图片生成失败: ' + (e?.message || '未知错误')) } finally { setRunning(false) }
  }

  const runABC = async () => { await runA(); await runB(); await runC() }

  // 导入 OpenRouter 模型弹窗状态
  const [openImport, setOpenImport] = useState(false)
  const [models, setModels] = useState([])
  const [q, setQ] = useState('')
  const [brandSet, setBrandSet] = useState([])
  const [brandFilter, setBrandFilter] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkKey, setBulkKey] = useState('')

  const fetchModels = async () => {
    try {
      const resp = await fetch('/api/openrouter/models')
      const json = await resp.json()
      const data = json.data || []
      setModels(data)
      const brands = Array.from(new Set(data.map(m => (m.provider || (m.id.split('/')[0] || '')).toLowerCase()))).sort()
      setBrandSet(brands)
    } catch (e) { console.error(e); alert('获取模型列表失败') }
  }
  useEffect(() => { if (openImport) fetchModels() }, [openImport])

  const filteredModels = useMemo(() => models.filter(m => {
    const brand = (m.provider || (m.id.split('/')[0] || '')).toLowerCase()
    const hitBrand = brandFilter.length ? brandFilter.includes(brand) : true
    const text = `${m.name || ''} ${m.id}`.toLowerCase()
    const hitSearch = q ? text.includes(q.toLowerCase()) : true
    return hitBrand && hitSearch
  }), [models, brandFilter, q])

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.concat([id]))
  }

  const handleAddProvider = () => {
    const id = 'or-' + Date.now()
    addProvider({
      id,
      name: `OpenRouter Slot ${providers.length + 1}`,
      enabled: true,
      type: 'openai-compat',
      params: { system: '', baseURL: 'https://openrouter.ai/api/v1', path: '/chat/completions', model: '', temperature: 0.7, top_p: 1, max_tokens: 1024, apiKey: '' }
    })
  }

  const handleImportConfirm = () => {
    if (selectedIds.length === 0) { setOpenImport(false); return }
    selectedIds.forEach((mid, idx) => {
      const id = 'or-' + Date.now() + '-' + idx
      addProvider({
        id,
        name: `OpenRouter: ${mid}`,
        enabled: true,
        type: 'openai-compat',
        params: { system: '', baseURL: 'https://openrouter.ai/api/v1', path: '/chat/completions', model: mid, temperature: 0.7, top_p: 1, max_tokens: 1024, apiKey: bulkKey || '' }
      })
    })
    setOpenImport(false)
    setSelectedIds([])
    setBulkKey('')
  }

  const run = async (onlyId) => {
    const selected = onlyId ? providers.filter(p => p.id === onlyId) : enabledProviders
    if (!prompt || selected.length === 0) return
    setRunning(true)
    try {
      const { data } = await axios.post('/api/compare', { prompt, system, providers: selected })
      const map = Object.fromEntries(results.map(r => [r.id, r]))
      const merged = data.map(d => ({ ...map[d.id], ...d }))
      setResults(merged)
    } catch (e) {
      console.error(e)
      alert('请求失败')
    } finally {
      setRunning(false)
    }
  }

  const toggleProvider = (id) => {
    setProviders(providers.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p))
  }

  const runStream = async () => {
    const selected = enabledProviders
    if (!prompt || selected.length === 0) return
    setRunning(true)
    // 初始化空结果
    setResults(selected.map(p => ({ id: p.id, name: p.name, ok: false, output: '', usage: null, timings: null })))
    try {
      const resp = await fetch('/api/compare/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system, providers: selected })
      })
      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          let evt
          try { evt = JSON.parse(line) } catch { continue }
          if (!evt || !evt.id) continue
          setResults(prev => prev.map(r => {
            if (r.id !== evt.id) return r
            if (evt.type === 'start') return { ...r, timings: { start: evt.t, end: null, durationMs: 0 } }
            if (evt.type === 'delta') {
              const start = r.timings?.start || Date.now()
              const end = Date.now()
              return { ...r, output: (r.output || '') + (evt.delta || ''), timings: { start, end, durationMs: end - start } }
            }
            if (evt.type === 'usage') return { ...r, usage: evt.usage }
            if (evt.type === 'done') return { ...r, ok: true, output: evt.output ?? r.output, timings: evt.timings }
            if (evt.type === 'error') return { ...r, ok: false, error: evt.error, timings: evt.timings }
            return r
          }))
        }
      }
    } catch (e) {
      console.error(e)
      alert('流式请求失败')
    } finally {
      setRunning(false)
    }
  }

  const updateParam = (id, key, value) => {
    setProviders(providers.map(p => p.id === id ? { ...p, params: { ...p.params, [key]: value } } : p))
  }

  const runStream2 = async () => {
    const selected = enabledProviders
    if (!prompt || selected.length === 0) return
    setRunning(true)
    setResults(selected.map(p => ({ id: p.id, name: p.name, ok: false, output: '', usage: null, timings: null })))
    try {
      const resp = await fetch('/api/compare/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, system, providers: selected }) })
      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          let evt
          try { evt = JSON.parse(line) } catch { continue }
          if (!evt || !evt.id) continue
          setResults(prev => prev.map(r => {
            if (r.id !== evt.id) return r
            if (evt.type === 'start') return { ...r, timings: { start: evt.t, end: null, durationMs: 0 } }
            if (evt.type === 'delta') return { ...r, output: (r.output || '') + (evt.delta || ''), timings: r.timings ? { ...r.timings, end: now(), durationMs: now() - (r.timings.start || now()) } : r.timings }
            if (evt.type === 'usage') return { ...r, usage: evt.usage }
            if (evt.type === 'done') return { ...r, ok: true, output: evt.output ?? r.output, timings: evt.timings }
            if (evt.type === 'error') return { ...r, ok: false, error: evt.error, timings: evt.timings }
            return r
          }))
        }
      }
    } catch (e) {
      console.error(e)
      alert('流式请求失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Box>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1 }}>ModelBridge</Typography>
          <SettingsIcon color="action" />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="对比实验" />
          <Tab label="提供商配置（含 API Key）" />
          <Tab label="应用" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Box sx={{ mb: 2 }}>
              <TextField fullWidth multiline minRows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="输入统一提示词..." />
              <TextField fullWidth multiline minRows={2} value={system} onChange={e => setSystem(e.target.value)} placeholder="可选：系统指令" sx={{ mt: 1 }} />
              <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                <Chip label={streaming ? '流式输出: 开' : '流式输出: 关'} onClick={() => setStreaming(s => !s)} />
                <Button variant="contained" disabled={running} onClick={() => streaming ? runStream2() : run()}>运行</Button>
              </Stack>
            </Box>

            <Grid container spacing={2}>
              {results.map(r => (
                <Grid key={r.id} item xs={12} md={6}>
                  <ProviderCard r={r} onRetry={(id) => run(id)} />
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              顶部为“全局 System Prompt”（默认应用于全部提供商），如单个提供商设置了自己的 System 将覆盖全局。
            </Alert>

            <TextField fullWidth label="全局 System Prompt" placeholder="为全部提供商设置的系统指令，可被单个提供商覆盖" value={system} onChange={e => setSystem(e.target.value)} sx={{ mb: 2 }} multiline minRows={2} />

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={handleAddProvider}>添加提供商</Button>
              <Button variant="contained" onClick={() => setOpenImport(true)}>从 OpenRouter 导入模型</Button>
              <Button variant="contained" color="success" onClick={() => { saveProviders(); alert('已保存提供商配置'); }}>保存配置</Button>
            </Stack>

            <Dialog open={openImport} onClose={() => setOpenImport(false)} maxWidth="md" fullWidth>
              <DialogTitle>从 OpenRouter 导入模型</DialogTitle>
              <DialogContent>
                <TextField fullWidth size="small" label="搜索模型" value={q} onChange={e => setQ(e.target.value)} sx={{ mb: 1 }} />
                <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                  {brandSet.map(b => (
                    <Chip key={b} label={b} color={brandFilter.includes(b) ? 'primary' : 'default'} onClick={() => setBrandFilter(prev => prev.includes(b) ? prev.filter(x => x !== b) : prev.concat([b]))} size="small" />
                  ))}
                  {brandFilter.length > 0 && <Button size="small" onClick={() => setBrandFilter([])}>清空品牌筛选</Button>}
                </Stack>
                <Box sx={{ maxHeight: 420, overflow: 'auto', border: '1px solid #eee', borderRadius: 1, p: 1 }}>
                  {filteredModels.map(m => (
                    <FormControlLabel key={m.id} control={<Checkbox checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} />} label={`${m.name || m.id} (${m.id})`} />
                  ))}
                  {filteredModels.length === 0 && <Typography variant="body2">没有匹配的模型</Typography>}
                </Box>
                <Divider sx={{ my: 1 }} />
                <TextField fullWidth label="OpenRouter API Key（可选，应用到新卡片）" type="password" value={bulkKey} onChange={e => setBulkKey(e.target.value)} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setOpenImport(false)}>取消</Button>
                <Button variant="contained" onClick={handleImportConfirm}>导入所选模型</Button>
              </DialogActions>
            </Dialog>

            <Grid container spacing={2}>
              {providers.map(p => (
                <Grid item xs={12} md={6} key={p.id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip label={p.enabled ? '启用' : '禁用'} color={p.enabled ? 'success' : 'default'} onClick={() => toggleProvider(p.id)} />
                          <Typography variant="subtitle1">{p.name}</Typography>
                        </Stack>
                        <IconButton size="small" onClick={() => removeProvider(p.id)} title="删除"><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                      <Grid container spacing={1} sx={{ mt: 1 }}>
                        {/* 必选/常用：API Key、System、Model 置顶展示 */}
                        <Grid item xs={12}><TextField fullWidth label="API Key（仅随请求使用）" type="password" value={p.params.apiKey || ''} onChange={e => updateParam(p.id, 'apiKey', e.target.value)} /></Grid>
                        <Grid item xs={12}><TextField fullWidth label="System（覆盖全局）" value={p.params.system || ''} onChange={e => updateParam(p.id, 'system', e.target.value)} multiline minRows={2} /></Grid>
                        <Grid item xs={12}><TextField fullWidth label="模型" value={p.params.model || ''} onChange={e => updateParam(p.id, 'model', e.target.value)} /></Grid>

                        {/* 高级设置（可选，默认值即可） */}
                        <Grid item xs={12}><Divider textAlign="left">高级设置</Divider></Grid>
                        <Grid item xs={12}><TextField fullWidth label="Base URL" value={p.params.baseURL || ''} onChange={e => updateParam(p.id, 'baseURL', e.target.value)} placeholder={p.type==='openai-compat' ? 'https://api.openai.com/v1' : ''} /></Grid>
                        {p.params.path !== undefined && <Grid item xs={12}><TextField fullWidth label="Path" value={p.params.path || ''} onChange={e => updateParam(p.id, 'path', e.target.value)} placeholder="/chat/completions" /></Grid>}
                        <Grid item xs={6}><TextField fullWidth type="number" label="temperature" value={p.params.temperature ?? ''} onChange={e => updateParam(p.id, 'temperature', Number(e.target.value))} /></Grid>
                        <Grid item xs={6}><TextField fullWidth type="number" label="top_p" value={p.params.top_p ?? ''} onChange={e => updateParam(p.id, 'top_p', Number(e.target.value))} /></Grid>
                        <Grid item xs={12}><TextField fullWidth type="number" label="max_tokens" value={p.params.max_tokens ?? ''} onChange={e => updateParam(p.id, 'max_tokens', Number(e.target.value))} /></Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {tab === 2 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>应用流程：A 识别图片 → B 风水分析 → C 生成参考图。可在下方临时输入 Google API Key，仅随请求使用。</Alert>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1">图片来源</Typography>
                    <Select fullWidth size="small" value={imageSourceType} onChange={(e)=>{
                      const v = e.target.value
                      setImageSourceType(v)
                      if (v==='url') { setImageDataUrl('') }
                      if (v==='upload') { setImageUrl('') }
                    }} displayEmpty sx={{ mb: 1 }}>
                      <MenuItem value="url">公网图片URL</MenuItem>
                      <MenuItem value="upload">本地上传</MenuItem>
                    </Select>
                    {imageSourceType === 'upload' ? (
                      <Box sx={{ border: '1px dashed #ccc', borderRadius: 1, p: 2, textAlign: 'center' }}
                           onDragOver={(e)=>{ e.preventDefault() }}
                           onDrop={(e)=>{ e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => setImageDataUrl(reader.result); reader.readAsDataURL(f); }}>
                        <IconButton component="label">
                          <CloudUploadIcon />
                          <input hidden type="file" accept="image/*" onChange={(e)=>{
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const reader = new FileReader();
                            reader.onload = () => setImageDataUrl(reader.result);
                            reader.readAsDataURL(f);
                          }} />
                        </IconButton>
                        {imageDataUrl && (
                          <Box sx={{ mt: 1 }}>
                            <img src={imageDataUrl} alt="预览" style={{ maxWidth: '100%', borderRadius: 8 }} />
                            <Button sx={{ mt: 1 }} onClick={()=>setImageDataUrl('')}>清除本地图片</Button>
                          </Box>
                        )}
                      </Box>
                    ) : (
                      <>
                        <TextField fullWidth label="公网图片 URL" placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
                        <Divider sx={{ my: 1 }} />
                        <Alert severity="info">A 步将使用上面的 URL。API Key 请在“提供商配置”页设置。</Alert>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1">步骤 A：图片识别（结构化要素）</Typography>
                    <TextField fullWidth label="A 的 System（可选）" multiline minRows={2} value={aSystem} onChange={e => setASystem(e.target.value)} sx={{ mt: 1 }} />
                    {/* A 的 Prompt 显示与编辑 */}
                    <Typography variant="caption" sx={{ mt: 1 }}>A 的 Prompt（预览）</Typography>
                    <Box sx={{ fontFamily: 'monospace', p:1, border: '1px dashed #ddd', borderRadius: 1 }}>{aPrompt}</Box>
                    <TextField fullWidth multiline minRows={2} label="编辑 A 的 Prompt" value={aPrompt} onChange={e => setAPrompt(e.target.value)} sx={{ mt: 1 }} />
                    <Select fullWidth size="small" value={providerAId} onChange={e => setProviderAId(e.target.value)} displayEmpty sx={{ mt: 1 }}>
                      <MenuItem value=""><em>选择提供商（如 doubao-seed-1-6）</em></MenuItem>
                      {providers.map(p => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
                    </Select>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button variant="contained" disabled={running || !(imageSourceType === 'url' ? imageUrl : imageDataUrl) || !providerAId} onClick={runA}>运行 A</Button>
                    </Stack>
                    <TextField fullWidth multiline minRows={6} label="A 输出（JSON/文本）" value={aOutput} onChange={e => setAOutput(e.target.value)} sx={{ mt: 1 }} />
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1">步骤 B：风水分析与物品清单</Typography>
                    <TextField fullWidth label="B 的 System（可选）" multiline minRows={2} value={bSystem} onChange={e => setBSystem(e.target.value)} sx={{ mt: 1 }} />
                    {/* B 的 Prompt 显示与编辑（由 A 输出拼装） */}
                    <Typography variant="caption" sx={{ mt: 1 }}>B 的 Prompt（预览）</Typography>
                    <Box sx={{ fontFamily: 'monospace', p:1, border: '1px dashed #ddd', borderRadius: 1 }}>{bPrompt}</Box>
                    <TextField fullWidth multiline minRows={2} label="编辑 B 的 Prompt" value={bPrompt} onChange={e => { setBPrompt(e.target.value); setBPromptEdited(true) }} sx={{ mt: 1 }} />
                    <Select fullWidth size="small" value={providerBId} onChange={e => setProviderBId(e.target.value)} displayEmpty sx={{ mt: 1 }}>
                      <MenuItem value=""><em>选择提供商（如 doubao-seed-1-6）</em></MenuItem>
                      {providers.map(p => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
                    </Select>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button variant="contained" disabled={running} onClick={runB}>运行 B</Button>
                      <Button variant="outlined" disabled={running} onClick={runABC}>一键运行 A→B→C</Button>
                    </Stack>
                    <TextField fullWidth multiline minRows={6} label="B 输出（JSON）" value={bOutput} onChange={e => setBOutput(e.target.value)} sx={{ mt: 1 }} />
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1">步骤 C：生成参考图（Google Imagen）</Typography>
                    <TextField fullWidth label="风格/材质提示（可选）" value={styleHints} onChange={e => { setStyleHints(e.target.value); if (!cPromptEdited) { /* 触发默认拼装 */ } }} />
                    {/* C 的 Prompt 显示与编辑 */}
                    <Typography variant="caption" sx={{ mt: 1 }}>C 的 Prompt（预览）</Typography>
                    <Box sx={{ fontFamily: 'monospace', p:1, border: '1px dashed #ddd', borderRadius: 1 }}>{cPrompt}</Box>
                    {cImageUrl ? (
                      <Box sx={{ mt: 1 }}>
                        <img src={cImageUrl} alt="参考图" style={{ maxWidth: '100%', borderRadius: 8 }} />
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Button href={cImageUrl} download target="_blank">下载图片</Button>
                        </Stack>
                      </Box>
                    ) : (
-                      <TextField fullWidth multiline minRows={6} label="C 输出（提示）" value={cPrompt} onChange={e => setCPrompt(e.target.value)} sx={{ mt: 1 }} />
+                      <TextField fullWidth multiline minRows={6} label="编辑 C 的 Prompt" value={cPrompt} onChange={e => { setCPrompt(e.target.value); setCPromptEdited(true) }} sx={{ mt: 1 }} />
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )}
      </Container>
    </Box>
  )
}
