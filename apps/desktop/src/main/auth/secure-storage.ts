type KeytarModule = {
  setPassword(service: string, account: string, password: string): Promise<void>
  getPassword(service: string, account: string): Promise<string | null>
  deletePassword(service: string, account: string): Promise<boolean>
}

export interface SecureStorage {
  setSecret(key: string, value: string): Promise<void>
  getSecret(key: string): Promise<string | null>
  deleteSecret(key: string): Promise<void>
}

async function loadKeytar(): Promise<KeytarModule> {
  const importModule = new Function('modulePath', 'return import(modulePath)') as (
    modulePath: string
  ) => Promise<unknown>
  const imported = (await importModule('keytar')) as {
    default?: KeytarModule
  } & Partial<KeytarModule>
  const keytar = imported.default ?? imported
  if (
    typeof keytar.setPassword !== 'function' ||
    typeof keytar.getPassword !== 'function' ||
    typeof keytar.deletePassword !== 'function'
  ) {
    throw new Error('keytar is unavailable in this environment')
  }

  return {
    setPassword: keytar.setPassword.bind(keytar),
    getPassword: keytar.getPassword.bind(keytar),
    deletePassword: keytar.deletePassword.bind(keytar)
  }
}

export class KeytarSecureStorage implements SecureStorage {
  constructor(
    private readonly serviceName = 'openbroca.desktop',
    private readonly keytarLoader: () => Promise<KeytarModule> = loadKeytar
  ) {}

  async setSecret(key: string, value: string): Promise<void> {
    const keytar = await this.keytarLoader()
    await keytar.setPassword(this.serviceName, key, value)
  }

  async getSecret(key: string): Promise<string | null> {
    const keytar = await this.keytarLoader()
    return keytar.getPassword(this.serviceName, key)
  }

  async deleteSecret(key: string): Promise<void> {
    const keytar = await this.keytarLoader()
    await keytar.deletePassword(this.serviceName, key)
  }
}

export const secureStorage = new KeytarSecureStorage()
