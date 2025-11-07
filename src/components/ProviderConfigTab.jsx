import React, { useState } from 'react'
import {
  Box, Typography, TextField, Button, Grid, Card, CardContent, Chip,
  IconButton, Stack, Divider, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Checkbox, FormControlLabel, Select, MenuItem, Tooltip,
  Accordion, AccordionSummary, AccordionDetails
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useStore } from '../store'


  // 预设模板（基于国内模型与 OpenRouter 的常用配置）
  const PRESETS = {
    'doubao-chat': {
      name: '豆包（文本）',
      type: 'openai-compat',
      params: { baseURL: 'https://ark.cn-beijing.volces.com/api/v3', path: '/chat/completions', model: 'doubao-pro-32k', temperature: 0.7, top_p: 1 }
    },
    'doubao-image': {
      name: '豆包（图像生成）',
      type: 'openai-compat',
      params: { baseURL: 'https://ark.cn-beijing.volces.com/api/v3', path: '/images/generations', model: 'doubao-seedream-4-0-250828' }
    },
    'doubao-vision': {
      name: '豆包（图像理解 Vision）',
      type: 'openai-compat',
      params: { baseURL: 'https://ark.cn-beijing.volces.com/api/v3', path: '/chat/completions', model: 'doubao-seed-1-6' }
    },
    'qianwen-chat': {
      name: '通义千问（文本）',
      type: 'openai-compat',
      params: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', path: '/chat/completions', model: 'qwen-turbo', temperature: 0.7, top_p: 1 }
    },
    'openrouter-chat': {
      name: 'OpenRouter（文本）',
      type: 'openai-compat',
      params: { baseURL: 'https://openrouter.ai/api/v1', path: '/chat/completions', model: 'gpt-4o-mini', temperature: 0.7, top_p: 1 }
    }
  }

  export default function ProviderConfigTab() {
    const { 
      system, providers, setSystem, setProviders, addProvider, removeProvider, saveProviders
    } = useStore()
    
    const [openImport, setOpenImport] = useState(false)
    const [models, setModels] = useState([])
    const [q, setQ] = useState('')
    const [brandSet, setBrandSet] = useState([])
    const [brandFilter, setBrandFilter] = useState([])
    const [selectedIds, setSelectedIds] = useState([])
    const [bulkKey, setBulkKey] = useState('')
    const [saveStatus, setSaveStatus] = useState('')

    const updateParam = (id, key, value) => {
      setProviders(providers.map(p => p.id === id ? { ...p, params: { ...p.params, [key]: value } } : p))
    }

    const toggleProvider = (id) => {
      setProviders(providers.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p))
    }

    const handleAddProvider = () => {
      const id = 'or-' + Date.now()
      addProvider({
        id,
        name: `OpenRouter Slot ${providers.length + 1}`,
        enabled: true,
        type: 'openai-compat',
        params: { 
          system: '', 
          baseURL: 'https://openrouter.ai/api/v1', 
          path: '/chat/completions', 
          model: '', 
          temperature: 0.7, 
          top_p: 1, 
          max_tokens: 1024, 
          apiKey: '' 
        }
      })
    }

    const handleSaveAll = () => {
      try {
        saveProviders()
        setSaveStatus('配置已保存成功！')
        setTimeout(() => setSaveStatus(''), 3000)
      } catch (error) {
        setSaveStatus('保存失败：' + error.message)
        setTimeout(() => setSaveStatus(''), 3000)
      }
    }

    const handleImportConfirm = () => {
      if (selectedIds.length === 0) { 
        setOpenImport(false) 
        return 
      }
      selectedIds.forEach((mid, idx) => {
        const id = 'or-' + Date.now() + '-' + idx
        addProvider({
          id,
          name: `OpenRouter: ${mid}`,
          enabled: true,
          type: 'openai-compat',
          params: { 
            system: '', 
            baseURL: 'https://openrouter.ai/api/v1', 
            path: '/chat/completions', 
            model: mid, 
            temperature: 0.7, 
            top_p: 1, 
            max_tokens: 1024, 
            apiKey: bulkKey || '' 
          }
        })
      })
      setOpenImport(false)
      setSelectedIds([])
      setBulkKey('')
    }

    

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.concat([id]))
  }

  const filteredModels = models.filter(m => {
    const brand = (m.provider || (m.id.split('/')[0] || '')).toLowerCase()
    const hitBrand = brandFilter.length ? brandFilter.includes(brand) : true
    const text = `${m.name || ''} ${m.id}`.toLowerCase()
    const hitSearch = q ? text.includes(q.toLowerCase()) : true
    return hitBrand && hitSearch
  })

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        顶部为"全局 System Prompt"（默认应用于全部提供商），如单个提供商设置了自己的 System 将覆盖全局。
      </Alert>

      <Box sx={{ mb: 3 }}>
        <TextField 
          fullWidth 
          label="全局 System Prompt" 
          placeholder="为全部提供商设置的系统指令，可被单个提供商覆盖" 
          value={system} 
          onChange={e => setSystem(e.target.value)} 
          multiline 
          minRows={2} 
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Button variant="outlined" onClick={handleAddProvider}>
          添加提供商
        </Button>
        <Button variant="contained" onClick={() => setOpenImport(true)}>
          从 OpenRouter 导入模型
        </Button>
        <Button 
          variant="contained" 
          color="success" 
          onClick={handleSaveAll}
          startIcon={<SettingsIcon />}
        >
          保存所有配置
        </Button>
        {saveStatus && (
          <Typography 
            variant="body2" 
            color={saveStatus.includes('成功') ? 'success.main' : 'error.main'}
          >
            {saveStatus}
          </Typography>
        )}
      </Box>

      <Dialog open={openImport} onClose={() => setOpenImport(false)} maxWidth="md" fullWidth>
        <DialogTitle>从 OpenRouter 导入模型</DialogTitle>
        <DialogContent>
          <TextField fullWidth size="small" label="搜索模型" value={q} onChange={e => setQ(e.target.value)} sx={{ mb: 1 }} />
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
            {brandSet.map(b => (
              <Chip 
                key={b} 
                label={b} 
                color={brandFilter.includes(b) ? 'primary' : 'default'} 
                onClick={() => setBrandFilter(prev => prev.includes(b) ? prev.filter(x => x !== b) : prev.concat([b]))} 
                size="small" 
              />
            ))}
            {brandFilter.length > 0 && <Button size="small" onClick={() => setBrandFilter([])}>清空品牌筛选</Button>}
          </Stack>
          <Box sx={{ maxHeight: 420, overflow: 'auto', border: '1px solid #eee', borderRadius: 1, p: 1 }}>
            {filteredModels.map(m => (
              <FormControlLabel 
                key={m.id} 
                control={<Checkbox checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} />} 
                label={`${m.name || m.id} (${m.id})`} 
              />
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
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={p.enabled ? '启用' : '禁用'} color={p.enabled ? 'success' : 'default'} onClick={() => toggleProvider(p.id)} />
                  <Typography variant="subtitle1">{p.name}</Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Card variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle1">{p.name}</Typography>
                      <IconButton size="small" onClick={() => removeProvider(p.id)} title="删除">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>

                    {/* 预设与就绪状态 */}
                    <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1 }} alignItems="center">
                      <Select size="small" displayEmpty value="" onChange={(e) => applyPresetLocal(p.id, e.target.value, providers, setProviders)} sx={{ minWidth: 200 }}>
                        <MenuItem value=""><em>选择预设（豆包/千问/OpenRouter/Gemini）</em></MenuItem>
                        <MenuItem value="doubao-chat">豆包（文本）</MenuItem>
                        <MenuItem value="doubao-image">豆包（图像生成）</MenuItem>
                        <MenuItem value="qianwen-chat">通义千问（文本）</MenuItem>
                        <MenuItem value="openrouter-chat">OpenRouter（文本）</MenuItem>
                        <MenuItem value="gemini-vision">Gemini（图像理解）</MenuItem>
                      </Select>
                      {(() => { const r = getReadiness(p); return (
                        <Chip size="small" color={r.ok ? 'success' : 'warning'} label={r.ok ? '可运行' : `待填：${r.missing.join('、')}`} />
                      )})()}
                    </Stack>

                    <Grid container spacing={1} sx={{ mt: 1 }}>
                      {/* 必选/常用：API Key、System、Model 置顶展示 */}
                      <Grid item xs={12}><TextField fullWidth label="API Key（仅随请求使用）" type="password" value={p.params.apiKey || ''} onChange={e => updateParam(p.id, 'apiKey', e.target.value)} /></Grid>
                      <Grid item xs={12}><TextField fullWidth label="System（覆盖全局）" value={p.params.system || ''} onChange={e => updateParam(p.id, 'system', e.target.value)} multiline minRows={2} /></Grid>
                      <Grid item xs={12}><TextField fullWidth label="模型" value={p.params.model || ''} onChange={e => updateParam(p.id, 'model', e.target.value)} /></Grid>

                      {/* 高级设置（可选，默认值即可） */}
                      <Grid item xs={12}><Divider textAlign="left">高级设置</Divider></Grid>
                      <Grid item xs={12}><TextField fullWidth label="Base URL" value={p.params.baseURL || ''} onChange={e => updateParam(p.id, 'baseURL', e.target.value)} placeholder={p.type==='openai-compat' ? 'https://api.openai.com/v1' : ''} /></Grid>
                      {p.params.path !== undefined && p.params.path !== '/images/generations' && (
                        <Grid item xs={12}><TextField fullWidth label="Path" value={p.params.path || ''} onChange={e => updateParam(p.id, 'path', e.target.value)} placeholder="/chat/completions" /></Grid>
                      )}
                      <Grid item xs={6}><TextField fullWidth type="number" label="temperature" value={p.params.temperature ?? ''} onChange={e => updateParam(p.id, 'temperature', Number(e.target.value))} /></Grid>
                      <Grid item xs={6}><TextField fullWidth type="number" label="top_p" value={p.params.top_p ?? ''} onChange={e => updateParam(p.id, 'top_p', Number(e.target.value))} /></Grid>
                      <Grid item xs={12}><TextField fullWidth type="number" label="max_tokens" value={p.params.max_tokens ?? ''} onChange={e => updateParam(p.id, 'max_tokens', Number(e.target.value))} /></Grid>
                    </Grid>

                    {/* 说明：简化你需要填的内容 */}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      必填：API Key 与 模型。预设已填好 Base URL 与 Path；豆包图像生成会使用 "/images/generations"，无需修改 Path。
                    </Typography>
                  </CardContent>
                </Card>
              </AccordionDetails>
            </Accordion>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

const applyPresetLocal = (providerId, presetKey, providers, setProviders) => {
  const cfg = PRESETS[presetKey]
  if (!cfg) return
  setProviders(providers.map(p => p.id === providerId ? {
    ...p,
    name: cfg.name || p.name,
    type: cfg.type || p.type,
    params: { ...p.params, ...cfg.params }
  } : p))
}

const getReadiness = (p) => {
  const missing = []
  if (!p?.params?.apiKey) missing.push('API Key')
  if (!p?.params?.model) missing.push('模型')
  return missing.length ? { ok: false, missing } : { ok: true }
}