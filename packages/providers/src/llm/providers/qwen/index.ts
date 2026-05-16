import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const qwenDescriptor = createOpenAICompatibleDescriptor({
  id: 'qwen',
  displayName: 'Qwen',
  description: 'Alibaba Qwen models through DashScope OpenAI-compatible APIs.',
  icon: providerIcons.qwen,
  defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'qwen-plus', name: 'Qwen Plus' },
    { id: 'qwen-turbo', name: 'Qwen Turbo' },
    { id: 'qwen-max', name: 'Qwen Max' },
    { id: 'qwq-plus', name: 'QwQ Plus' },
    { id: 'qwen-coder-plus', name: 'Qwen Coder Plus' }
  ]
})
