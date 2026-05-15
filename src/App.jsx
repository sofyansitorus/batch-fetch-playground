import { useMemo, useRef, useState } from 'react'
import batchFetch from '@sofyansitorus/batch-fetch'
import './App.css'

const endpointTemplates = {
  postmanGet: {
    label: 'Postman Echo GET',
    makeUrl: ({ query }) => `https://postman-echo.com/get?${new URLSearchParams({ q: query }).toString()}`,
    method: 'GET',
    supportsBody: false,
    tip: 'Echoes query params, headers, and URL in the JSON response.',
  },
  postmanPost: {
    label: 'Postman Echo POST',
    makeUrl: () => 'https://postman-echo.com/post',
    method: 'POST',
    supportsBody: true,
    tip: 'Echoes your JSON body, headers, and URL in the JSON response.',
  },
  jsonPlaceholder: {
    label: 'JSONPlaceholder POST',
    makeUrl: () => 'https://jsonplaceholder.typicode.com/posts',
    method: 'POST',
    supportsBody: true,
    tip: 'Popular fake REST endpoint for create operations.',
  },
  fakestore: {
    label: 'Fake Store API Product',
    makeUrl: ({ productId }) => `https://fakestoreapi.com/products/${productId}`,
    method: 'GET',
    supportsBody: false,
    tip: 'Public product endpoint useful for GET demos.',
  },
}

const initialForm = {
  endpointKey: 'postmanPost',
  query: 'batch-fetch-demo',
  productId: '1',
  payload: JSON.stringify(
    {
      source: 'batch-fetch-demo',
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ),
  duplicateCount: 3,
  useDispatchDelay: false,
  dispatchDelayMs: 1200,
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [requests, setRequests] = useState([])
  const [globalError, setGlobalError] = useState('')
  const controllersRef = useRef(new Map())
  const requestSeqRef = useRef(0)
  const timeoutRef = useRef(new Map())

  const activeTemplate = useMemo(
    () => endpointTemplates[form.endpointKey],
    [form.endpointKey],
  )

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const updateRequest = (id, partial) => {
    setRequests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...partial } : item)),
    )
  }

  const readResponsePayload = async (response) => {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return await response.json()
    }

    return await response.text()
  }

  const cancelRequest = (id) => {
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

  const triggerBatch = (event) => {
    event.preventDefault()
    setGlobalError('')
    resetBatchState()

    let parsedBody = null
    if (activeTemplate.supportsBody) {
      try {
        parsedBody = JSON.parse(form.payload)
      } catch {
        setGlobalError('Body must be valid JSON for this endpoint.')
        return
      }
    }

    const count = Number(form.duplicateCount)
    if (!Number.isInteger(count) || count < 1 || count > 8) {
      setGlobalError('Duplicate requests must be an integer between 1 and 8.')
      return
    }

    const delayMs = Number(form.dispatchDelayMs)
    const useDelay = Boolean(form.useDispatchDelay)
    if (useDelay && (!Number.isInteger(delayMs) || delayMs < 100 || delayMs > 10000)) {
      setGlobalError('Dispatch delay must be an integer between 100 and 10000 ms.')
      return
    }

    const url = activeTemplate.makeUrl(form)
    const baseOptions = {
      method: activeTemplate.method,
      headers: {
        Accept: 'application/json',
      },
    }

    if (activeTemplate.supportsBody) {
      baseOptions.headers['Content-Type'] = 'application/json'
      baseOptions.body = JSON.stringify(parsedBody)
    }

    const queued = Array.from({ length: count }, (_, index) => ({
      id: `request-${(requestSeqRef.current += 1)}`,
      index: index + 1,
      endpointLabel: activeTemplate.label,
      url,
      method: baseOptions.method,
      optionsPreview: JSON.stringify(baseOptions, null, 2),
      status: useDelay ? 'scheduled' : 'pending',
      response: null,
      error: null,
    }))

    setRequests((prev) => [...queued, ...prev])

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
      } catch (error) {
        const canceled = error?.name === 'AbortError'
        updateRequest(entity.id, {
          status: canceled ? 'canceled' : 'error',
          error: canceled
            ? 'Request canceled by user.'
            : error?.message || 'Unknown request error.',
        })
      } finally {
        controllersRef.current.delete(entity.id)
      }
      }

      if (useDelay) {
        const timeoutId = setTimeout(() => {
          timeoutRef.current.delete(entity.id)
          runRequest()
        }, delayMs)
        timeoutRef.current.set(entity.id, timeoutId)
      } else {
        runRequest()
      }
    })
  }

  const summary = useMemo(() => {
    return requests.reduce(
      (acc, item) => {
        acc.total += 1
        acc[item.status] += 1
        return acc
      },
      {
        total: 0,
        scheduled: 0,
        pending: 0,
        success: 0,
        canceled: 0,
        error: 0,
      },
    )
  }, [requests])

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Single-Page Demo</p>
        <h1>Batch Fetch Playground</h1>
        <p className="subtitle">
          Trigger identical calls quickly and inspect how each caller resolves independently.
          Cancel any in-flight caller without affecting others.
        </p>
      </header>

      <section className="panel form-panel">
        <h2>Request Configurator</h2>
        <p className="tip">{activeTemplate.tip}</p>

        <form onSubmit={triggerBatch} className="request-form">
          <label>
            Endpoint
            <select
              value={form.endpointKey}
              onChange={(event) => updateForm('endpointKey', event.target.value)}
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
              type="number"
              min={1}
              max={8}
              value={form.duplicateCount}
              onChange={(event) =>
                updateForm('duplicateCount', Number(event.target.value || 1))
              }
            />
          </label>

          <label>
            Query Value (for Postman GET)
            <input
              value={form.query}
              onChange={(event) => updateForm('query', event.target.value)}
            />
          </label>

          <label>
            Product Id (for Fake Store)
            <input
              type="number"
              min={1}
              max={20}
              value={form.productId}
              onChange={(event) => updateForm('productId', event.target.value)}
            />
          </label>

          {activeTemplate.supportsBody && (
            <label className="full-width">
              JSON Body
              <textarea
                value={form.payload}
                rows={8}
                onChange={(event) => updateForm('payload', event.target.value)}
              />
            </label>
          )}

          <label>
            <span>Delay Before Dispatch</span>
            <div className="inline-toggle">
              <input
                type="checkbox"
                checked={form.useDispatchDelay}
                onChange={(event) => updateForm('useDispatchDelay', event.target.checked)}
              />
              <span>Enable delay</span>
            </div>
          </label>

          <label>
            Delay (ms)
            <input
              type="number"
              min={100}
              max={10000}
              step={100}
              disabled={!form.useDispatchDelay}
              value={form.dispatchDelayMs}
              onChange={(event) =>
                updateForm('dispatchDelayMs', Number(event.target.value || 0))
              }
            />
          </label>

          {form.useDispatchDelay && (
            <p className="hint-banner full-width">
              Hint: Delay is useful to demonstrate canceling certain request items before
              they are dispatched to the network.
            </p>
          )}

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
            <strong>{summary.scheduled}</strong>
            <span>Scheduled</span>
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
                <span className={`status-pill ${item.status}`}>{item.status}</span>
              </header>

              <p className="meta-line">
                {item.method} {item.url}
              </p>
              <p className="meta-line">
                {item.status === 'scheduled'
                  ? 'Scheduled: waiting for dispatch delay...'
                  : item.status === 'pending'
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
                  <pre>{JSON.stringify(item.response.payload, null, 2)}</pre>
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
