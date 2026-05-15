export type EndpointKey =
  | 'dummyJsonSearch'
  | 'dummyJsonPost'
  | 'jsonPlaceholder'
  | 'fakestore'

export type CustomField = {
  name: keyof Pick<FormState, 'query' | 'productId' | 'payload'>
  label: string
  initialValue: string
  type: 'text' | 'number' | 'textarea'
}

export type EndpointTemplate = {
  label: string
  makeUrl: (form: FormState) => string
  method: 'GET' | 'POST'
  supportsBody: boolean
  tip: string
  customFields?: CustomField[]
}

export type FormState = {
  endpointKey: EndpointKey
  query: string
  productId: string
  payload: string
  duplicateCount: number
  useDispatchDelay: boolean
  dispatchDelayMs: number
}

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
