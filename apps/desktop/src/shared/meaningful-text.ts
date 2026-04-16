export function hasMeaningfulText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
