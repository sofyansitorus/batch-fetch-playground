export type EndpointKey = 'fastResponse' | 'delayedResponse'

export type EndpointTemplate = {
  label: string
  makeUrl: (form: FormStateDataParsed) => string
  makeBody?: (form: FormStateDataParsed) => string
  method: 'GET' | 'POST'
  tip: string
  initialPayload: Record<string, string> | (() => string)
}

export type FormStateData<TPayload = string> = {
  endpointKey: EndpointKey
  duplicateCount: number
  payload: TPayload
}

export type FormStateDataParsed = FormStateData<Record<string, string>>

export type RequestStatus = 'pending' | 'success' | 'canceled' | 'error'

export type RequestResponse = {
  ok: boolean
  status: number
  statusText: string
  payload: unknown
}

export type RequestRecord = {
  id: string
  index: number
  endpointLabel: string
  url: string
  method: string
  optionsPreview: string
  status: RequestStatus
  response: RequestResponse | null
  error: string | null
}

export type RequestSummary = {
  total: number
  pending: number
  success: number
  canceled: number
  error: number
}
