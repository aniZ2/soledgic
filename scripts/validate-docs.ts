#!/usr/bin/env tsx

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { API_ENDPOINT_CATALOG } from '../apps/web/src/app/(marketing)/docs/api/catalog'

function fail(message: string): never {
  throw new Error(message)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const openApiPath = resolve(repoRoot, 'docs/openapi.yaml')
const sdkReadmePath = resolve(repoRoot, 'sdk/typescript/README.md')
const sdkSourcePath = resolve(repoRoot, 'sdk/typescript/src/index.ts')
const sdkExamplePath = resolve(repoRoot, 'sdk/typescript/examples/docs-validation.ts')

if (!existsSync(openApiPath)) fail('docs/openapi.yaml is missing. Run `npm run generate:openapi` first.')
if (!existsSync(sdkReadmePath)) fail('sdk/typescript/README.md is missing.')
if (!existsSync(sdkSourcePath)) fail('sdk/typescript/src/index.ts is missing.')
if (!existsSync(sdkExamplePath)) fail('sdk/typescript/examples/docs-validation.ts is missing.')

const openApi = parse(readFileSync(openApiPath, 'utf8')) as { paths?: Record<string, unknown> }
const openApiPaths = new Set(Object.keys(openApi.paths || {}))

const publicCatalogPaths = API_ENDPOINT_CATALOG
  .filter((endpoint) => endpoint.auth === 'API key' && !endpoint.internal && !endpoint.deprecated)
  .map((endpoint) => endpoint.path)

for (const path of publicCatalogPaths) {
  if (!openApiPaths.has(path)) {
    fail(`OpenAPI is missing public catalog path: ${path}`)
  }
}

for (const path of openApiPaths) {
  if (!publicCatalogPaths.includes(path)) {
    fail(`OpenAPI contains undocumented public path: ${path}`)
  }
}

const sdkReadme = readFileSync(sdkReadmePath, 'utf8')
const sdkSource = readFileSync(sdkSourcePath, 'utf8')

const readmeMethods = Array.from(
  sdkReadme.matchAll(/`([A-Za-z0-9_.]+)\([^`]*\)`/g),
  (match) => match[1],
)
const uniqueReadmeMethods = Array.from(new Set(readmeMethods))

for (const methodName of uniqueReadmeMethods) {
  if (methodName === 'webhooks.verifySignature' || methodName === 'webhooks.parseEvent') {
    if (!sdkSource.includes('readonly webhooks =')) {
      fail(`SDK README references ${methodName}, but the webhooks helper object was not found.`)
    }
    continue
  }

  const methodPattern = new RegExp(`async\\s+${methodName.replace('.', '\\.')}\\s*\\(`)
  if (!methodPattern.test(sdkSource)) {
    fail(`SDK README references method "${methodName}", but it was not found in sdk/typescript/src/index.ts`)
  }
}

console.log(`Validated ${publicCatalogPaths.length} public OpenAPI paths and ${uniqueReadmeMethods.length} documented SDK methods.`)
