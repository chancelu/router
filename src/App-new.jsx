import React, { useState } from 'react'
import { 
  AppBar, Toolbar, Container, Box, Typography, Tabs, Tab,
  Paper, Chip, TextField, Button
} from '@mui/material'
import PsychologyIcon from '@mui/icons-material/Psychology'
import CompareIcon from '@mui/icons-material/Compare'
import SettingsIcon from '@mui/icons-material/Settings'
import { useStore } from './store'

// 模型应用分析：完整 A→B→C 流程
import FengshuiAnalysisTab from './components/FengshuiAnalysisTab'
// 提供商配置
import ProviderConfigTab from './components/ProviderConfigTab'

function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  )
}

// 文本模型测试（简单版）
function CompareModelsTabLocal() {
  const [input, setInput] = useState('')
  const [outputA, setOutputA] = useState('')
  const [outputB, setOutputB] = useState('')

  const runCompare = () => {
    setOutputA(`模型A响应：\n${input}`)
    setOutputB(`模型B响应：\n${input}`)
  }

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>文本模型测试（示例）</Typography>
      <TextField fullWidth label="输入内容" value={input} onChange={(e)=>setInput(e.target.value)} sx={{ mb: 2 }} />
      <Button variant="contained" onClick={runCompare} sx={{ mb: 2 }}>运行测试</Button>
      <TextField fullWidth multiline minRows={4} label="模型A结果" value={outputA} sx={{ mb: 2 }} />
      <TextField fullWidth multiline minRows={4} label="模型B结果" value={outputB} />
    </Box>
  )
}

export default function App() {
  const { running } = useStore()
  const [tab, setTab] = useState(0)

  const handleTabChange = (event, newValue) => {
    setTab(newValue)
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: '#1976d2' }}>
        <Toolbar>
          <PsychologyIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            AI Router - 模型应用分析
          </Typography>
          {running && (
            <Chip 
              icon={<PsychologyIcon />} 
              label="处理中" 
              color="warning"
              size="small"
            />
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Tabs 
            value={tab} 
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
            variant="fullWidth"
            sx={{ 
              borderBottom: 1, 
              borderColor: 'divider',
              '& .MuiTab-root': {
                fontWeight: 500,
                fontSize: '0.95rem'
              }
            }}
          >
            <Tab 
              icon={<PsychologyIcon />} 
              label="模型应用分析" 
              sx={{ minHeight: 72 }}
            />
            <Tab 
              icon={<CompareIcon />} 
              label="文本模型测试" 
              sx={{ minHeight: 72 }}
            />
            <Tab 
              icon={<SettingsIcon />} 
              label="提供商配置" 
              sx={{ minHeight: 72 }}
            />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <FengshuiAnalysisTab />
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <CompareModelsTabLocal />
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <ProviderConfigTab />
          </TabPanel>
        </Paper>
      </Container>
    </Box>
  )
}