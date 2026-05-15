export type EndpointKey =
  | 'dummyJsonSearch'
  | 'dummyJsonPost'
  | 'jsonPlaceholder'
  | 'fakestore'

export type EndpointTemplate = {
  label: string
  makeUrl: (form: FormStateDataParsed) => string
  makeBody?: (form: FormStateDataParsed) => string
  method: 'GET' | 'POST'
  tip: string
  initialPayload: Record<string, string>
}

export type FormStateData<TPayload = string> = {
  endpointKey: EndpointKey
  duplicateCount: number
  payload: TPayload
  useDispatchDelay: boolean
  dispatchDelayMs: number
}

export type FormStateDataParsed = FormStateData<Record<string, string>>

export type RequestStatus =
  | 'scheduled'
  | 'pending'
  | 'success'
  | 'canceled'
  | 'error'

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
  scheduled: number
  pending: number
  success: number
  canceled: number
  error: number
}
