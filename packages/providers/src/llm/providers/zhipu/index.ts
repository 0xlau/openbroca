import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const zhipuDescriptor = createOpenAICompatibleDescriptor({
  id: 'zhipu',
  displayName: 'Zhipu GLM',
  description: 'GLM models through Zhipu OpenAI-compatible APIs.',
  icon: providerIcons.zhipu,
  defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'glm-4-plus', name: 'GLM-4 Plus' },
    { id: 'glm-4-air', name: 'GLM-4 Air' },
    { id: 'glm-4-flash', name: 'GLM-4 Flash' }
  ]
})
