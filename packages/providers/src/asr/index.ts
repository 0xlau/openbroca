export { ASRProviderRegistry, type AnyASRProvider, type ASRRegistryHooks } from './registry.ts'
export {
  type ASRProvider,
  type ASRProviderDescriptor,
  type ASRCapabilities,
  type CloudASRProvider,
  type DownloadProgress,
  type LocalASRProvider,
  type LocalModelInfo,
  type RecognitionInput,
  type RecognitionOptions,
  type RecognitionResult,
  type StreamingASRProvider,
  type TranscriptionEvent,
  type TranscriptionSegment,
  DEFAULT_ASR_CAPABILITIES,
  recognizeFromTranscribe,
  resolveASRCapabilities
} from './contracts.ts'
export {
  type ProviderConnectionField,
  type ProviderConnectionFieldInput,
  type ProviderConnectionOption,
  type ProviderConnectionType
} from '../shared/connection.ts'
export {
  type ProviderSettingsItem,
  type ProviderSetupContext,
  type ProviderSetupStatus,
  type ProviderSettingsOption,
  type ProviderTextSettingsItem,
  type ProviderPasswordSettingsItem,
  type ProviderToggleSettingsItem,
  type ProviderSelectSettingsItem,
  type ProviderModelSelectSettingsItem
} from '../shared/settings.ts'
