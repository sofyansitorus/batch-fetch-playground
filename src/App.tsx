import type { ChangeEvent, FormEvent } from 'react'
import { useMemo, useRef, useState } from 'react'
import batchFetch from '@sofyansitorus/batch-fetch'
import { faker } from '@faker-js/faker'
import './App.css'
import type {
  EndpointKey,
  EndpointTemplate,
  FormStateData,
  FormStateDataParsed,
  RequestRecord,
  RequestSummary,
} from './types'

const stringifyPayload = (payload: unknown): string => {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return ''
  }
}

const processPayload = (
  payload: Record<string, string> | (() => string),
): string => {
  if ('function' === typeof payload) {
    return payload()
  }

  if ('object' === typeof payload) {
    return stringifyPayload(payload)
  }

  return ''
}

const endpointTemplates: Record<EndpointKey, EndpointTemplate> = {
  fastResponse: {
    label: 'Fast Response',
    makeUrl: () =>
      'https://api.mockfly.dev/mocks/e1614434-8d9a-4e34-a6e9-d0d195b62912/fast',
    method: 'POST',
    tip: 'Fast response is useful to demonstrate how batch-fetch handles multiple identical calls and resolves each independently.',
    initialPayload: () =>
      stringifyPayload({
        timestamp: new Date().toISOString(),
        email: faker.internet.email(),
        fullName: faker.person.fullName(),
      }),
  },
  delayedResponse: {
    label: 'Delayed Response (5s)',
    makeUrl: () =>
      'https://api.mockfly.dev/mocks/e1614434-8d9a-4e34-a6e9-d0d195b62912/delayed',
    method: 'POST',
    tip: 'Delayed response will have a 5-second delay. It is useful to demonstrate canceling certain request items without interrupting others.',
    initialPayload: () =>
      stringifyPayload({
        timestamp: new Date().toISOString(),
        email: faker.internet.email(),
        fullName: faker.person.fullName(),
      }),
  },
}

const initialSummary: RequestSummary = {
  total: 0,
  pending: 0,
  success: 0,
  canceled: 0,
  error: 0,
}

const defaultEndpointKey: EndpointKey = 'fastResponse'
const defaultFormStateData: FormStateData = {
  endpointKey: defaultEndpointKey,
  duplicateCount: 3,
  payload: processPayload(endpointTemplates[defaultEndpointKey].initialPayload),
}

const stripTrailingCommasFromJson = (input: string): string => {
  let output = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (escaped) {
      output += char
      escaped = false
      continue
    }

    if (char === '\\') {
      output += char
      escaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      output += char
      continue
    }

    if (!inString && char === ',') {
      let cursor = i + 1
      while (cursor < input.length && /\s/.test(input[cursor])) {
        cursor += 1
      }

      if (input[cursor] === '}' || input[cursor] === ']') {
        continue
      }
    }

    output += char
  }

  return output
}

function App() {
  const [formStateData, setFormStateData] =
    useState<FormStateData>(defaultFormStateData)
  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [globalError, setGlobalError] = useState('')
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  const requestSeqRef = useRef(0)
  const timeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )

  const activeTemplate = useMemo(
    () => endpointTemplates[formStateData.endpointKey],
    [formStateData.endpointKey],
  )

  const updateFormStateData = <K extends keyof FormStateData>(
    key: K,
    value: FormStateData[K],
  ) => {
    setFormStateData((prev) => ({ ...prev, [key]: value }))
  }

  const updateEndpointKey = (event: ChangeEvent<HTMLSelectElement>) => {
    const newEndpointKey = event.target.value as EndpointKey
    updateFormStateData('endpointKey', newEndpointKey)
    updateFormStateData(
      'payload',
      processPayload(endpointTemplates[newEndpointKey].initialPayload),
    )
  }

  const updateDuplicateCount = (event: ChangeEvent<HTMLInputElement>) => {
    updateFormStateData(
      'duplicateCount',
      Number(event.target.value || defaultFormStateData.duplicateCount),
    )
  }

  const updatePayload = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateFormStateData('payload', event.target.value)
  }

  const updateRequest = (id: string, partial: Partial<RequestRecord>) => {
    setRequests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...partial } : item)),
    )
  }

  const readResponsePayload = async (response: Response): Promise<unknown> => {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return response.json()
    }

    return response.text()
  }

  const cancelRequest = (id: string) => {
    const timeoutId = timeoutRef.current.get(id)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutRef.current.delete(id)
      updateRequest(id, {
        status: 'canceled',
        error: 'Canceled before dispatch (delay window).',
      })
      return
    }

    const controller = controllersRef.current.get(id)
    if (controller) {
      controller.abort()
    }
  }

  const clearFinished = () => {
    setRequests((prev) => prev.filter((item) => item.status === 'pending'))
  }

  const resetBatchState = () => {
    timeoutRef.current.forEach((timeoutId) => {
      clearTimeout(timeoutId)
    })
    timeoutRef.current.clear()

    controllersRef.current.forEach((controller) => {
      controller.abort()
    })
    controllersRef.current.clear()

    setRequests([])
  }

  const triggerBatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGlobalError('')
    resetBatchState()

    const count = Number(formStateData.duplicateCount)
    if (!Number.isInteger(count) || count < 1 || count > 8) {
      setGlobalError('Duplicate requests must be an integer between 1 and 8.')
      return
    }

    if (!formStateData.payload.trim()) {
      setGlobalError('Payload is required for this endpoint.')
      if ('POST' === activeTemplate.method) {
        setGlobalError('Request Body is required for this endpoint.')
      } else {
        setGlobalError(
          'Request Query Parameters is required for this endpoint.',
        )
      }
      return
    }

    let parsedPayload: Record<string, string>

    try {
      const sanitizedPayload = stripTrailingCommasFromJson(
        formStateData.payload,
      )
      parsedPayload = JSON.parse(sanitizedPayload) as Record<string, string>
    } catch {
      if ('POST' === activeTemplate.method) {
        setGlobalError('Request Body is required must be a valid JSON.')
      } else {
        setGlobalError('Request Query Parameters must be a valid JSON.')
      }
      return
    }

    const formStateDataParsed: FormStateDataParsed = {
      ...formStateData,
      payload: parsedPayload,
    }

    let url: string

    try {
      url = activeTemplate.makeUrl(formStateDataParsed)
    } catch {
      setGlobalError(
        'Failed to construct request URL. Check your payload format.',
      )
      return
    }

    const baseOptions: RequestInit & { headers: Record<string, string> } = {
      method: activeTemplate.method,
      headers: {
        Accept: 'application/json',
      },
    }

    if ('POST' === activeTemplate.method) {
      baseOptions.headers['Content-Type'] = 'application/json'

      if (activeTemplate.makeBody) {
        baseOptions.body = activeTemplate.makeBody(formStateDataParsed)
      } else {
        try {
          baseOptions.body = JSON.stringify(parsedPayload)
        } catch {
          setGlobalError('Body must be valid JSON for this endpoint.')
          return
        }
      }
    }

    const queued: RequestRecord[] = Array.from(
      { length: count },
      (_, index) => ({
        id: `request-${(requestSeqRef.current += 1)}`,
        index: index + 1,
        endpointLabel: activeTemplate.label,
        url,
        method: baseOptions.method ?? activeTemplate.method,
        optionsPreview: stringifyPayload(baseOptions),
        status: 'pending',
        response: null,
        error: null,
      }),
    )

    setRequests(queued)

    queued.forEach((entity) => {
      const runRequest = async () => {
        const controller = new AbortController()
        controllersRef.current.set(entity.id, controller)
        updateRequest(entity.id, {
          status: 'pending',
        })

        try {
          const response = await batchFetch(url, {
            ...baseOptions,
            signal: controller.signal,
          })
          const payload = await readResponsePayload(response)
          updateRequest(entity.id, {
            status: 'success',
            response: {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              payload,
            },
          })
        } catch (error: unknown) {
          const isAbortError =
            error instanceof DOMException
              ? error.name === 'AbortError'
              : error instanceof Error && error.name === 'AbortError'

          updateRequest(entity.id, {
            status: isAbortError ? 'canceled' : 'error',
            error: isAbortError
              ? 'Request canceled by user.'
              : error instanceof Error
                ? error.message
                : 'Unknown request error.',
          })
        } finally {
          controllersRef.current.delete(entity.id)
        }
      }

      void runRequest()
    })
  }

  const summary = useMemo<RequestSummary>(() => {
    return requests.reduce<RequestSummary>(
      (acc, item) => {
        acc.total += 1
        acc[item.status] += 1
        return acc
      },
      { ...initialSummary },
    )
  }, [requests])

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>Batch Fetch Playground</h1>
        <p className="subtitle">
          Trigger identical calls quickly and inspect how each caller resolves
          independently. Cancel any in-flight caller without affecting others.
        </p>
        <p className="hero-link-row">
          <a
            className="hero-link"
            href="https://github.com/sofyansitorus/batch-fetch"
            target="_blank"
            rel="noreferrer"
          >
            View batch-fetch on GitHub
          </a>
        </p>
      </header>

      <section className="panel form-panel">
        <h2>Request Configurator</h2>
        <p className="tip">{activeTemplate.tip}</p>

        <form onSubmit={triggerBatch} className="request-form">
          <label>
            Endpoint
            <select
              name="endpointKey"
              value={formStateData.endpointKey}
              onChange={updateEndpointKey}
            >
              {Object.entries(endpointTemplates).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Duplicate Requests
            <input
              name="duplicateCount"
              type="number"
              min={1}
              max={8}
              value={formStateData.duplicateCount.toString()}
              onChange={updateDuplicateCount}
            />
          </label>

          <div className="field-separator" aria-hidden="true" />
          <label className="full-width">
            {'GET' === activeTemplate.method
              ? 'Request Query Parameters'
              : 'Request Body'}
            <textarea
              name="payload"
              rows={8}
              onChange={updatePayload}
              value={formStateData.payload}
            />
          </label>
          <div className="field-separator" aria-hidden="true" />

          {globalError && <p className="error-banner">{globalError}</p>}

          <div className="button-row">
            <button type="submit" className="primary">
              Dispatch Batch
            </button>
            <button type="button" className="ghost" onClick={clearFinished}>
              Clear Finished
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Batch Activity</h2>
        <div className="stats-grid">
          <article>
            <strong>{summary.total}</strong>
            <span>Total</span>
          </article>
          <article>
            <strong>{summary.pending}</strong>
            <span>Pending</span>
          </article>
          <article>
            <strong>{summary.success}</strong>
            <span>Success</span>
          </article>
          <article>
            <strong>{summary.canceled}</strong>
            <span>Canceled</span>
          </article>
          <article>
            <strong>{summary.error}</strong>
            <span>Errors</span>
          </article>
        </div>

        <div className="request-list">
          {requests.length === 0 && (
            <p className="empty-state">
              Submit a batch to see each request entity and test cancellation.
            </p>
          )}

          {requests.map((item) => (
            <article className="request-card" key={item.id}>
              <header>
                <h3>
                  #{item.index} {item.endpointLabel}
                </h3>
                <span className={`status-pill ${item.status}`}>
                  {item.status}
                </span>
              </header>

              <p className="meta-line">
                {item.method} {item.url}
              </p>
              <p className="meta-line">
                {item.status === 'pending'
                  ? 'Dispatched: waiting for response...'
                  : 'Finished'}
              </p>

              <details>
                <summary>Request Options</summary>
                <pre>{item.optionsPreview}</pre>
              </details>

              {item.response && (
                <details open>
                  <summary>
                    Response {item.response.status} {item.response.statusText}
                  </summary>
                  <pre>{stringifyPayload(item.response.payload)}</pre>
                </details>
              )}

              {item.error && <p className="error-text">{item.error}</p>}

              <div className="card-actions">
                <button
                  type="button"
                  className="danger"
                  disabled={item.status !== 'pending'}
                  onClick={() => cancelRequest(item.id)}
                >
                  Cancel This Request
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
