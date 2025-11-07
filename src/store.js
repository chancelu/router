import { create } from 'zustand'

const PRESETS_KEY = 'airooter_presets'

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]') } catch { return [] }
}
function savePresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

const PROVIDERS_KEY = 'airooter_providers'
function loadProviders() {
  try { return JSON.parse(localStorage.getItem(PROVIDERS_KEY) || 'null') } catch { return null }
}
function saveProvidersLS(list) {
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(list))
}

export const useStore = create((set, get) => ({
  prompt: '',
  system: '', // 全局 System Prompt（配置页顶部）
  running: false,
  providers: loadProviders() || [
    { id: 'or-slot-1', name: 'OpenRouter Slot 1', enabled: true, type: 'openai-compat', params: { system: '', baseURL: 'https://openrouter.ai/api/v1', path: '/chat/completions', model: '', temperature: 0.7, top_p: 1, max_tokens: 1024, apiKey: '' } },
    { id: 'or-slot-2', name: 'OpenRouter Slot 2', enabled: true, type: 'openai-compat', params: { system: '', baseURL: 'https://openrouter.ai/api/v1', path: '/chat/completions', model: '', temperature: 0.7, top_p: 1, max_tokens: 1024, apiKey: '' } }
  ],
  results: [],
  presets: loadPresets(),

  setPrompt: (prompt) => set({ prompt }),
  setSystem: (system) => set({ system }),
  setProviders: (providers) => set({ providers }),
  setRunning: (running) => set({ running }),
  setResults: (results) => set({ results }),

  // 预设管理
  savePreset: (name) => {
    const { providers, system, presets } = get()
    const next = presets.filter(p => p.name !== name).concat([{ name, system, providers }])
    savePresets(next)
    set({ presets: next })
  },
  applyPreset: (name) => {
    const p = get().presets.find(x => x.name === name)
    if (!p) return
    set({ system: p.system ?? '', providers: p.providers ?? [] })
  },
  deletePreset: (name) => {
    const next = get().presets.filter(p => p.name !== name)
    savePresets(next)
    set({ presets: next })
  },

  // 提供商增删
  addProvider: (provider) => {
    const { providers } = get()
    const next = providers.concat([provider])
    saveProvidersLS(next)
    set({ providers: next })
  },
  removeProvider: (id) => {
    const { providers } = get()
    const next = providers.filter(p => p.id !== id)
    saveProvidersLS(next)
    set({ providers: next })
  },
  saveProviders: () => {
    const { providers } = get()
    saveProvidersLS(providers)
  }
}))
