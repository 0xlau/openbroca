import { readFile } from 'node:fs/promises'

const HISTORY_AUDIO_HOST = 'history'
export const HISTORY_AUDIO_PROTOCOL = 'openbroca-media'

interface HistoryAudioRecordLike {
  audioFilePath?: string
}

interface HistoryAudioRepositoryLike {
  getById(id: string): HistoryAudioRecordLike | undefined
}

export function toHistoryAudioUrl(recordId: string): string {
  return `${HISTORY_AUDIO_PROTOCOL}://${HISTORY_AUDIO_HOST}/${encodeURIComponent(recordId)}`
}

export function createHistoryAudioProtocolHandler(
  historyRepository: HistoryAudioRepositoryLike,
  deps: {
    readFile?: typeof readFile
  } = {}
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const url = new URL(request.url)
    if (url.host !== HISTORY_AUDIO_HOST) {
      return new Response('Not found', { status: 404 })
    }

    const recordId = decodeURIComponent(url.pathname.slice(1))
    if (!recordId) {
      return new Response('Not found', { status: 404 })
    }

    const record = historyRepository.getById(recordId)
    if (!record?.audioFilePath) {
      return new Response('Not found', { status: 404 })
    }

    try {
      const audio = await (deps.readFile ?? readFile)(record.audioFilePath)
      return new Response(audio, {
        status: 200,
        headers: {
          'content-type': 'audio/wav'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }
}
