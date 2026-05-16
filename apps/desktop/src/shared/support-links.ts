export const OPENBROCA_HELP_URL = 'https://github.com/0xlau/openbroca#readme'
export const OPENBROCA_FEEDBACK_URL = 'https://github.com/0xlau/openbroca/issues/new/choose'

export type SupportLinkTarget = 'help' | 'feedback'

export function getSupportLinkUrl(target: SupportLinkTarget): string {
  return target === 'help' ? OPENBROCA_HELP_URL : OPENBROCA_FEEDBACK_URL
}
