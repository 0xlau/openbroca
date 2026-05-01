export interface ProviderSettingsOption {
  label: string
  value: string
}

interface ProviderSettingsItemBase {
  key: string
  label: string
  description?: string
  required?: boolean
}

export interface ProviderTextSettingsItem extends ProviderSettingsItemBase {
  type: 'text'
  placeholder?: string
}

export interface ProviderPasswordSettingsItem extends ProviderSettingsItemBase {
  type: 'password'
  placeholder?: string
}

export interface ProviderToggleSettingsItem extends ProviderSettingsItemBase {
  type: 'toggle'
  defaultValue?: boolean
}

export interface ProviderSelectSettingsItem extends ProviderSettingsItemBase {
  type: 'select'
  options: ProviderSettingsOption[]
}

export interface ProviderModelSelectSettingsItem extends ProviderSettingsItemBase {
  type: 'model-select'
  dataSource: 'llm-models'
  allowCustomValue?: boolean
}

/**
 * UI primitive for local ASR providers. Renders the catalog + installed model
 * list with download/select/remove actions; the persisted value is the active
 * `selectedModelId`. Distinct from `model-select` because the data source is
 * the local-models tRPC endpoints rather than a remote `listModels()` query.
 */
export interface ProviderLocalModelSelectSettingsItem extends ProviderSettingsItemBase {
  type: 'local-model-select'
}

export type ProviderSettingsItem =
  | ProviderTextSettingsItem
  | ProviderPasswordSettingsItem
  | ProviderToggleSettingsItem
  | ProviderSelectSettingsItem
  | ProviderModelSelectSettingsItem
  | ProviderLocalModelSelectSettingsItem

export interface ProviderSetupStatus {
  status: 'not-connected' | 'configured' | 'invalid' | 'ready'
  canActivate: boolean
  summary?: string
  blockingReasons: string[]
  fieldErrors?: Record<string, string>
}

export interface ProviderSetupContext {
  connection?: unknown
  settings?: Record<string, unknown>
}
