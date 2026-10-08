import { type OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { apiError, responseSchemas } from './api-schemas.js'
import { adminListQuery } from './admin-pagination.js'

const methods = ['get', 'post', 'put', 'patch', 'delete'] as const
const publicPaths = new Set(['/api/auth/login', '/api/auth/register', '/api/admin/auth/login', '/api/customers/lookup', '/api/market/products', '/api/banners', '/api/health/live', '/api/health/ready'])
const domain = (path: string) => {
  if (path.includes('/auth/')) return 'Authentication'
  if (path.includes('/sale-requests')) return 'Sales'
  if (/\/(offers|orders|shipments|cancellations)(\/|$)/.test(path)) return 'Outbound'
  if (path.includes('/quotes')) return 'PurchaseQuotes'
  if (path.includes('/customer-applications') || path.includes('/customers')) return 'Customers'
  if (path.includes('/members') || path.includes('/accounts')) return 'Accounts'
  return path.split('/').filter(part => part && !['api', 'customer', 'admin'].includes(part))[0]?.replace(/^./, letter => letter.toUpperCase()) ?? 'System'
}

export function registerApiDocs(app: OpenAPIHono) {
  const querySchemas = new Map<string, string>()
  app.openAPIRegistry.register('ApiError', apiError)
  for (const [route, schema] of responseSchemas) {
    const [method, path] = route.split(' ')
    const definition = app.openAPIRegistry.definitions.find(entry => entry.type === 'route' && entry.route.method === method && entry.route.path === path)
    if (definition?.type === 'route') definition.route.responses[200] = { description: '처리 성공', content: { 'application/json': { schema } } }
  }
  for (const definition of [...app.openAPIRegistry.definitions]) {
    if (definition.type !== 'route') continue
    const route = definition.route
    if (route.method === 'get' && ['/api/admin/accounts', '/api/admin/customers', '/api/admin/customer-applications'].includes(route.path)) route.request = { ...route.request, query: adminListQuery }
    if (route.request?.query) {
      const name = `${route.path.startsWith('/api/admin/') ? 'Admin' : publicPaths.has(route.path) ? 'Public' : 'Customer'}${domain(route.path)}${route.path.replace(/[^a-zA-Z0-9]/g, '')}Query`
      route.request.query = app.openAPIRegistry.register(name, route.request.query)
      querySchemas.set(route.path, name)
    }
  }
  const document = (origin: string, scope?: 'customer' | 'admin') => {
    const spec = app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: `MRS ${scope === 'admin' ? 'Administrator' : scope === 'customer' ? 'Customer Portal' : 'All'} API`, version: '1.0.0', description: '고객과 관리자는 각 영역의 로그인 API로 발급한 JWT를 사용합니다. 인증 값은 문서에 포함하지 않습니다.' }, servers: [{ url: origin, description: 'Current environment' }] })
    spec.components ??= {}
    spec.components.schemas ??= {}
    spec.components.securitySchemes = {
      ...spec.components.securitySchemes,
      CustomerBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: '고객 로그인으로 발급한 customer audience JWT. 활성 회원·고객사·소속·현재 세션 버전이 필요합니다.' },
      AdminBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: '관리자 로그인으로 발급한 admin audience JWT. 활성 관리자·현재 세션 버전이 필요합니다. 계정 관리는 SYSTEM_ADMIN만 가능합니다.' },
    }
    for (const [path, item] of Object.entries(spec.paths ?? {})) {
      const admin = path.startsWith('/api/admin/')
      if (scope && (scope === 'admin') !== admin && !(scope === 'admin' && path.startsWith('/api/health/'))) { delete spec.paths![path]; continue }
      for (const method of methods) {
        const operation = item?.[method]
        if (!operation) continue
        const name = `${admin ? 'Admin' : publicPaths.has(path) ? 'Public' : 'Customer'}${domain(path)}${method[0]!.toUpperCase()}${method.slice(1)}${path.split('/').filter(part => !['api', 'customer', 'admin'].includes(part)).map(part => part.replace(/[{}-]/g, '').replace(/^./, letter => letter.toUpperCase())).join('')}`
        operation.operationId = name
        operation.tags = [domain(path)]
        const secured = !publicPaths.has(path)
        operation.security = secured ? [{ [admin ? 'AdminBearer' : 'CustomerBearer']: [] }] : []
        if (secured) {
          operation.responses ??= {}
          for (const code of ['401', '403']) operation.responses[code] ??= { description: code === '401' ? '영역별 인증 토큰 필요 또는 폐기된 세션' : admin ? '활성 관리자 및 작업 권한 필요' : '활성 회원·고객사 및 작업 권한 필요' }
        }
        for (const [code, response] of Object.entries(operation.responses ?? {})) if (Number(code) >= 400 && !('$ref' in response)) response.content ??= { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
        operation.description = `${operation.description ?? ''}\n${secured ? admin ? path.includes('/accounts') ? '필수 인증: 활성 SYSTEM_ADMIN, admin audience JWT.' : '필수 인증: 활성 관리자, admin audience JWT.' : '필수 인증: 활성 고객 회원·고객사, customer audience JWT. 작업별 MANAGER 제한은 유지됩니다.' : '공개 API: Bearer 토큰을 요구하지 않습니다.'}`.trim()
        const body = operation.requestBody
        if (body && !('$ref' in body)) for (const [media, content] of Object.entries(body.content)) {
          if (content.schema && !('$ref' in content.schema)) {
            const key = `${name}${media.includes('multipart') ? 'Upload' : 'Request'}`
            spec.components.schemas[key] = content.schema
            content.schema = { $ref: `#/components/schemas/${key}` }
          }
        }
      }
    }
    if (scope) {
      spec.components.securitySchemes = { [scope === 'admin' ? 'AdminBearer' : 'CustomerBearer']: spec.components.securitySchemes[scope === 'admin' ? 'AdminBearer' : 'CustomerBearer']! }
      const used = new Set<string>()
      const collect = (value: unknown): void => {
        if (!value || typeof value !== 'object') return
        for (const [key, entry] of Object.entries(value)) {
          if (key === '$ref' && typeof entry === 'string' && entry.startsWith('#/components/schemas/')) {
            const name = entry.slice('#/components/schemas/'.length)
            if (!used.has(name)) { used.add(name); collect(spec.components?.schemas?.[name]) }
          } else collect(entry)
        }
      }
      collect(spec.paths)
      for (const [path, name] of querySchemas) if (spec.paths?.[path]) collect({ $ref: `#/components/schemas/${name}` })
      spec.components.schemas = Object.fromEntries(Object.entries(spec.components.schemas).filter(([name]) => used.has(name)))
    }
    spec.tags = [...new Set(Object.values(spec.paths ?? {}).flatMap(item => methods.flatMap(method => item?.[method]?.tags ?? [])))].map(name => ({ name }))
    return spec
  }
  for (const scope of ['customer', 'admin'] as const) {
    app.get(`/api/openapi/${scope}.json`, context => { context.header('Cache-Control', 'no-store'); return context.json(document(new URL(context.req.url).origin, scope)) })
    app.get(`/api/docs/${scope}`, Scalar({ url: `/api/openapi/${scope}.json`, pageTitle: `MRS ${scope} API Test`, authentication: { preferredSecurityScheme: scope === 'admin' ? 'AdminBearer' : 'CustomerBearer' }, persistAuth: false }))
  }
  app.get('/api/openapi.json', context => { context.header('Cache-Control', 'no-store'); return context.json(document(new URL(context.req.url).origin)) })
  app.get('/api/docs', Scalar({ pageTitle: 'MRS API Reference', sources: [{ title: '고객 포털 API', url: '/api/openapi/customer.json' }, { title: '관리자 API', url: '/api/openapi/admin.json' }], persistAuth: false }))
}