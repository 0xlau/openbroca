import { describe, expect, it, vi } from 'vitest'
import {
  composeCompleteMiddleware,
  composeGenerateMiddleware,
  generateFromCompletion,
  type CompletionChunk,
  type CompletionGenerateFn,
  type CompletionRequest,
  type CompletionResult,
  type CompletionStreamFn,
  type LLMMiddleware,
} from '../contracts.ts'

const stubRequest: CompletionRequest = {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'hello' }],
}

async function* makeHandler(chunks: Array<CompletionChunk>): AsyncIterable<CompletionChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}

describe('composeCompleteMiddleware', () => {
  it('passes through handler when no middleware provided', async () => {
    const handler: CompletionStreamFn = () => makeHandler([{ delta: 'a' }, { delta: 'b' }])
    const composed = composeCompleteMiddleware([], handler)
    const result: string[] = []
    for await (const chunk of composed(stubRequest)) {
      result.push(chunk.delta)
    }
    expect(result).toEqual(['a', 'b'])
  })

  it('wrapComplete middleware receives before/after hooks', async () => {
    const order: string[] = []
    const middleware: LLMMiddleware = {
      wrapComplete: (next) =>
        async function* (req) {
          order.push('before')
          for await (const chunk of next(req)) {
            yield { ...chunk, delta: chunk.delta.toUpperCase() }
          }
          order.push('after')
        },
    }

    const handler: CompletionStreamFn = () => makeHandler([{ delta: 'hello' }])
    const composed = composeCompleteMiddleware([middleware], handler)
    const chunks: CompletionChunk[] = []
    for await (const chunk of composed(stubRequest)) {
      chunks.push(chunk)
    }

    expect(chunks[0]?.delta).toBe('HELLO')
    expect(order).toEqual(['before', 'after'])
  })

  it('wrapComplete middleware composes outermost-first', async () => {
    const order: string[] = []
    const makeMiddleware = (label: string): LLMMiddleware => ({
      wrapComplete: (next) =>
        async function* (_req) {
          order.push(`${label}:enter`)
          yield* next(stubRequest)
          order.push(`${label}:exit`)
        },
    })

    const handler: CompletionStreamFn = () => makeHandler([{ delta: 'x' }])
    const composed = composeCompleteMiddleware([makeMiddleware('m1'), makeMiddleware('m2')], handler)
    for await (const _ of composed(stubRequest)) {
      // consume
    }

    expect(order).toEqual(['m1:enter', 'm2:enter', 'm2:exit', 'm1:exit'])
  })

  it('wrapComplete can clean up when consumer stops early', async () => {
    const cleanup = vi.fn()
    const middleware: LLMMiddleware = {
      wrapComplete: (next) =>
        async function* (req) {
          try {
            yield* next(req)
          } finally {
            cleanup()
          }
        },
    }

    const handler: CompletionStreamFn = () => makeHandler([
      { delta: 'a' },
      { delta: 'b' },
      { delta: 'c' },
    ])
    const composed = composeCompleteMiddleware([middleware], handler)

    for await (const _ of composed(stubRequest)) {
      break
    }

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('wrapComplete can modify the request', async () => {
    let seenModel = ''
    const middleware: LLMMiddleware = {
      wrapComplete: (next) =>
        async function* (req) {
          seenModel = req.model
          yield* next({ ...req, model: 'overridden' })
        },
    }

    let actualModel = ''
    const handler: CompletionStreamFn = (req) => {
      actualModel = req.model
      return makeHandler([])
    }

    const composed = composeCompleteMiddleware([middleware], handler)
    for await (const _ of composed(stubRequest)) {
      // consume
    }

    expect(seenModel).toBe('gpt-4o')
    expect(actualModel).toBe('overridden')
  })
})

describe('composeGenerateMiddleware', () => {
  it('passes through handler when no middleware provided', async () => {
    const handler: CompletionGenerateFn = async () => ({
      content: 'hello',
      finishReason: 'stop',
    })

    const composed = composeGenerateMiddleware([], handler)

    await expect(composed(stubRequest)).resolves.toEqual({
      content: 'hello',
      finishReason: 'stop',
    })
  })

  it('wrapGenerate modifies generation result', async () => {
    const middleware: LLMMiddleware = {
      wrapGenerate: (next) => async (req) => {
        const result = await next(req)
        return { ...result, content: result.content.toUpperCase() }
      },
    }

    const handler: CompletionGenerateFn = async (req) => ({
      content: req.messages.map((m) => m.content).join(' '),
      finishReason: 'stop',
    })

    const composed = composeGenerateMiddleware([middleware], handler)
    const result = await composed(stubRequest)

    expect(result.content).toBe('HELLO')
  })

  it('wrapGenerate can modify the request', async () => {
    let seenModel = ''
    const middleware: LLMMiddleware = {
      wrapGenerate: (next) => async (req) => {
        seenModel = req.model
        return next({ ...req, model: 'overridden' })
      },
    }

    let actualModel = ''
    const handler: CompletionGenerateFn = async (req) => {
      actualModel = req.model
      return { content: 'ok', finishReason: 'stop' }
    }

    const composed = composeGenerateMiddleware([middleware], handler)
    await composed(stubRequest)

    expect(seenModel).toBe('gpt-4o')
    expect(actualModel).toBe('overridden')
  })

  it('wrapGenerate middleware composes outermost-first', async () => {
    const order: string[] = []
    const makeMiddleware = (label: string): LLMMiddleware => ({
      wrapGenerate: (next) => async (req) => {
        order.push(`${label}:enter`)
        const result = await next(req)
        order.push(`${label}:exit`)
        return result
      },
    })

    const handler: CompletionGenerateFn = async () => ({
      content: 'x',
      finishReason: 'stop',
    })

    const composed = composeGenerateMiddleware([makeMiddleware('m1'), makeMiddleware('m2')], handler)
    await composed(stubRequest)

    expect(order).toEqual(['m1:enter', 'm2:enter', 'm2:exit', 'm1:exit'])
  })
})

describe('generateFromCompletion helper', () => {
  it('aggregates streamed chunks into a single completion', async () => {
    const handler: CompletionStreamFn = () =>
      makeHandler([
        { delta: 'hello ' },
        { delta: 'world', finishReason: 'stop' },
      ])

    const final: CompletionResult = await generateFromCompletion(handler)(stubRequest)

    expect(final).toEqual({ content: 'hello world', finishReason: 'stop' })
  })

  it('keeps the last non-null finish reason', async () => {
    const handler: CompletionStreamFn = () =>
      makeHandler([
        { delta: 'hello', finishReason: null },
        { delta: ' world', finishReason: 'length' },
      ])

    await expect(generateFromCompletion(handler)(stubRequest)).resolves.toEqual({
      content: 'hello world',
      finishReason: 'length',
    })
  })

  it('defaults finish reason to stop when chunks omit it', async () => {
    const handler: CompletionStreamFn = () =>
      makeHandler([
        { delta: 'hello' },
        { delta: ' world' },
      ])

    await expect(generateFromCompletion(handler)(stubRequest)).resolves.toEqual({
      content: 'hello world',
      finishReason: 'stop',
    })
  })

  it('rejects when the stream throws', async () => {
    const handler: CompletionStreamFn = async function* () {
      yield { delta: 'hello' }
      throw new Error('stream failed')
    }

    await expect(generateFromCompletion(handler)(stubRequest)).rejects.toThrow('stream failed')
  })
})
