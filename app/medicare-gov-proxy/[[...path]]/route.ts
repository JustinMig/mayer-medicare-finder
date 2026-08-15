import { NextRequest } from 'next/server'

const MEDICARE_ORIGIN = 'https://www.medicare.gov'
const PROXY_PREFIX = '/medicare-gov-proxy'

function isBlockedPath(pathname: string) {
  const normalized = `/${pathname}`.replace(/\/+/g, '/').toLowerCase()
  return (
    normalized.startsWith('/account') ||
    normalized.startsWith('/sso') ||
    normalized.startsWith('/oauth') ||
    normalized.startsWith('/login') ||
    normalized.startsWith('/auth')
  )
}

function rewriteAbsoluteMedicareUrls(value: string) {
  return value
    .replaceAll('https://www.medicare.gov/', `${PROXY_PREFIX}/`)
    .replaceAll('https://www.medicare.gov', PROXY_PREFIX)
}

function rewriteHtml(html: string) {
  let output = rewriteAbsoluteMedicareUrls(html)
    .replace(/(href|src|action)=(['"])\/(?!\/)/gi, `$1=$2${PROXY_PREFIX}/`)

  const bridge = `
<script>
(() => {
  const prefix = ${JSON.stringify(PROXY_PREFIX)};
  const upstream = ${JSON.stringify(MEDICARE_ORIGIN)};
  const proxify = (value) => {
    try {
      if (typeof value !== 'string') return value;
      if (value.startsWith(prefix)) return value;
      if (value.startsWith(upstream)) return prefix + value.slice(upstream.length);
      if (value.startsWith('/')) return prefix + value;
      const u = new URL(value, window.location.href);
      if (u.origin === window.location.origin && !u.pathname.startsWith(prefix)) {
        return prefix + u.pathname + u.search + u.hash;
      }
    } catch (_) {}
    return value;
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string') return nativeFetch(proxify(input), init);
    if (input instanceof Request) {
      const nextUrl = proxify(input.url);
      if (nextUrl !== input.url) input = new Request(nextUrl, input);
    }
    return nativeFetch(input, init);
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return nativeOpen.call(this, method, proxify(String(url)), ...rest);
  };

  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const raw = anchor.getAttribute('href');
    const next = raw ? proxify(raw) : raw;
    if (next && next !== raw) anchor.setAttribute('href', next);
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const raw = form.getAttribute('action');
    const next = raw ? proxify(raw) : raw;
    if (next && next !== raw) form.setAttribute('action', next);
  }, true);
})();
</script>`

  if (/<\/head>/i.test(output)) output = output.replace(/<\/head>/i, `${bridge}</head>`)
  else output = bridge + output
  return output
}

function rewriteCss(css: string) {
  return rewriteAbsoluteMedicareUrls(css)
    .replace(/url\((['"]?)\/(?!\/)/gi, `url($1${PROXY_PREFIX}/`)
}

function rewriteJson(json: string) {
  return rewriteAbsoluteMedicareUrls(json)
}

function blockedResponse() {
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;padding:28px;color:#172033}main{max-width:720px;margin:auto;border:1px solid #d7d9d8;border-radius:14px;padding:24px;background:#fff}h1{font-size:22px}</style></head><body><main><h1>Secure Medicare account pages stay on Medicare.gov</h1><p>This embedded workspace is for the public Medicare.gov Plan Compare experience. Medicare account sign-in is intentionally not proxied through Mayer Insurance Group.</p><p>Use the Plan Finder tab above to continue your comparison.</p></main></body></html>`, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params
  const upstreamPath = path?.length ? path.join('/') : 'plan-compare/'
  if (isBlockedPath(upstreamPath)) return blockedResponse()

  const incoming = new URL(request.url)
  const upstreamUrl = new URL(`/${upstreamPath}`, MEDICARE_ORIGIN)
  upstreamUrl.search = incoming.search

  const headers = new Headers()
  for (const name of ['accept', 'accept-language', 'content-type', 'user-agent']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('referer', `${MEDICARE_ORIGIN}/plan-compare/`)

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  }
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer()

  const upstream = await fetch(upstreamUrl, init)

  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location')
    if (location) {
      const resolved = new URL(location, upstreamUrl)
      if (resolved.origin === MEDICARE_ORIGIN) {
        if (isBlockedPath(resolved.pathname)) return blockedResponse()
        const proxied = `${PROXY_PREFIX}${resolved.pathname}${resolved.search}${resolved.hash}`
        return new Response(null, { status: upstream.status, headers: { Location: proxied, 'Cache-Control': 'no-store' } })
      }
    }
  }

  const responseHeaders = new Headers()
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  responseHeaders.set('Content-Type', contentType)
  responseHeaders.set('Cache-Control', 'private, no-store')
  responseHeaders.set('X-Content-Type-Options', 'nosniff')

  if (request.method === 'HEAD') return new Response(null, { status: upstream.status, headers: responseHeaders })

  if (contentType.includes('text/html')) {
    return new Response(rewriteHtml(await upstream.text()), { status: upstream.status, headers: responseHeaders })
  }
  if (contentType.includes('text/css')) {
    return new Response(rewriteCss(await upstream.text()), { status: upstream.status, headers: responseHeaders })
  }
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return new Response(rewriteJson(await upstream.text()), { status: upstream.status, headers: responseHeaders })
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context)
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context)
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context)
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context)
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context)
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context)
}
