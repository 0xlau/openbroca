export interface StoreSchema {
  aboutMe: Record<string, unknown>
  dictionary: Record<string, unknown>
  providers: Record<string, unknown>
  settings: Record<string, unknown>
  [key: string]: unknown
}
