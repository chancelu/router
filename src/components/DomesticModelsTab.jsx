import React, { useState, useMemo } from 'react'
import { 
  Box, TextField, Button, Grid, Card, CardContent, Typography, 
  Stack, Chip, Alert, Select, MenuItem, FormControl, InputLabel,
  ToggleButton, ToggleButtonGroup, IconButton, Tooltip
} from '@mui/material'
import { useStore } from '../store'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'

const DOMESTIC_PROVIDERS = {
  qianwen: {
    id: 'qianwen',
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-1201'],
    description: '阿里云大语言模型，中文理解能力强'
  },
  doubao: {
    id: 'doubao',
    name: '豆包',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-lite-4k', 'doubao-pro-4k', 'doubao-lite-32k', 'doubao-pro-32k'],
    description: '字节跳动大语言模型，响应速度快'
  }
}

const ProviderCard = ({ provider, result, onRun, onCopy, onRetry }) => {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">{provider.name}</Typography>
          <Stack direction="row" spacing={1}>
            {result?.timings?.durationMs && (
              <Chip size="small" label={`${result.timings.durationMs}ms`} color="info" />
            )}
            {result?.usage?.total_tokens && (
              <Chip size="small" label={`${result.usage.total_tokens} tokens`} color="primary" />
            )}
          </Stack>
        </Stack>
        
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          模型: {provider.params.model}
        </Typography>

        <Box 
          sx={{ 
            minHeight: 200, 
            maxHeight: 300, 
            overflow: 'auto',
            p: 2, 
            bgcolor: 'grey.50',
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: 14,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {result ? (
            result.ok ? (
              result.output || '无输出'
            ) : (
              <Typography color="error">错误: {result.error}</Typography>
            )
          ) : (
            <Typography color="text.secondary">等待运行...</Typography>
          )}
        </Box>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Tooltip title="复制结果">
            <IconButton size="small" onClick={() => onCopy(result?.output || '')} disabled={!result?.output}>
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="重新运行">
            <IconButton size="small" onClick={onRetry} disabled={!result}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default function DomesticModelsTab() {
  const { providers, running, results, setRunning, setResults } = useStore()
  
  const [prompt, setPrompt] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('你是一个智能助手，请用中文回答。')
  const [selectedProvider, setSelectedProvider] = useState('qianwen')
  const [selectedModel, setSelectedModel] = useState('qwen-turbo')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [streamMode, setStreamMode] = useState(true)
  const [apiKey, setApiKey] = useState('')

  // 获取国内模型提供商配置
  const domesticProviders = useMemo(() => {
    return providers.filter(p => 
      p.type === 'openai-compat' && 
      (p.params.baseURL === DOMESTIC_PROVIDERS.qianwen.baseURL || 
       p.params.baseURL === DOMESTIC_PROVIDERS.doubao.baseURL)
    )
  }, [providers])

  // 快速配置国内模型
  const quickSetupProvider = (providerType) => {
    const config = DOMESTIC_PROVIDERS[providerType]
    setSelectedProvider(providerType)
    setSelectedModel(config.models[0])
  }

  // 运行模型测试
  const runTest = async (providerId) => {
    if (!prompt || running) return
    
    setRunning(true)
    const provider = providers.find(p => p.id === providerId)
    if (!provider) {
      alert('请先配置对应的模型提供商')
      setRunning(false)
      return
    }

    try {
      const startTime = Date.now()
      const result = {
        id: providerId,
        name: provider.name,
        ok: false,
        output: '',
        usage: null,
        timings: { start: startTime, end: null, durationMs: 0 }
      }

      // 临时更新API密钥
      const originalApiKey = provider.params.apiKey
      provider.params.apiKey = apiKey || provider.params.apiKey

      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          system: systemPrompt,
          providers: [{ ...provider }]
        })
      })

      const data = await response.json()
      const endTime = Date.now()
      
      if (data[0]) {
        result.ok = data[0].ok
        result.output = data[0].output
        result.usage = data[0].usage
        result.timings = { start: startTime, end: endTime, durationMs: endTime - startTime }
      }

      // 恢复原始API密钥
      provider.params.apiKey = originalApiKey

      setResults(prev => prev.map(r => r.id === providerId ? result : r))
    } catch (error) {
      console.error('运行失败:', error)
      alert('运行失败: ' + error.message)
    } finally {
      setRunning(false)
    }
  }

  // 批量运行所有配置的国内模型
  const runAllTests = async () => {
    if (!prompt || running) return
    
    for (const provider of domesticProviders) {
      await runTest(provider.id)
    }
  }

  // 复制结果
  const copyResult = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('结果已复制到剪贴板')
    })
  }

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        国内模型专区 - 专门适配通义千问和豆包等国内AI模型，提供更好的中文理解和响应速度
      </Alert>

      {/* 快速选择区域 */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>快速选择国内模型</Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Button
              variant={selectedProvider === 'qianwen' ? 'contained' : 'outlined'}
              onClick={() => quickSetupProvider('qianwen')}
              startIcon={<span>🔸</span>}
            >
              通义千问
            </Button>
            <Button
              variant={selectedProvider === 'doubao' ? 'contained' : 'outlined'}
              onClick={() => quickSetupProvider('doubao')}
              startIcon={<span>🔹</span>}
            >
              豆包
            </Button>
          </Stack>
          
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            {DOMESTIC_PROVIDERS[selectedProvider]?.description}
          </Typography>
        </CardContent>
      </Card>

      {/* 配置区域 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="测试Prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="请输入要测试的内容..."
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="系统提示词"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="请输入系统提示词..."
          />
        </Grid>
      </Grid>

      {/* 参数配置 */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>模型参数配置</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>模型</InputLabel>
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  label="模型"
                >
                  {DOMESTIC_PROVIDERS[selectedProvider]?.models.map(model => (
                    <MenuItem key={model} value={model}>{model}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="number"
                label="温度"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                inputProps={{ min: 0, max: 2, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="number"
                label="最大Token数"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                inputProps={{ min: 1, max: 8192 }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="API密钥"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="可选：临时API密钥"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 控制按钮 */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={runAllTests}
          disabled={running || !prompt}
          size="large"
        >
          {running ? '运行中...' : '批量测试所有模型'}
        </Button>
        <ToggleButtonGroup
          value={streamMode}
          exclusive
          onChange={(e, value) => setStreamMode(value)}
        >
          <ToggleButton value={true}>流式</ToggleButton>
          <ToggleButton value={false}>非流式</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* 结果展示 */}
      {results.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>测试结果</Typography>
          <Grid container spacing={2}>
            {domesticProviders.map(provider => {
              const result = results.find(r => r.id === provider.id)
              return (
                <Grid item xs={12} md={6} key={provider.id}>
                  <ProviderCard
                    provider={provider}
                    result={result}
                    onRun={() => runTest(provider.id)}
                    onCopy={copyResult}
                    onRetry={() => runTest(provider.id)}
                  />
                </Grid>
              )
            })}
          </Grid>
        </Box>
      )}
    </Box>
  )
}