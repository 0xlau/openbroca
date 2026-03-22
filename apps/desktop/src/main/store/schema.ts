export interface StoreSchema {
  providers: Record<string, unknown>
  settings: Record<string, unknown>
  [key: string]: unknown
}
