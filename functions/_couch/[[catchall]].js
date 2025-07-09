const couchUrl = 'https://localfirst.backend.lol'

export const onRequest = async context => {
    const url = new URL(context.request.url)

    function resHeaders(existingHeaders) {
        const newHeaders = new Headers(existingHeaders)
        newHeaders.set(
            'Access-Control-Allow-Origin',
            context.request.headers.get('Origin')
        )
        newHeaders.set(
            'Access-Control-Allow-Methods',
            'GET, POST, PUT, DELETE, OPTIONS'
        )
        newHeaders.set(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization'
        )
        newHeaders.set('Access-Control-Allow-Credentials', 'true')
        newHeaders.set('allow', 'DELETE,GET,HEAD,OPTIONS,POST,PUT')
        return newHeaders
    }

    if (context.request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: resHeaders()
        })
    }

    const headers = new Headers(context.request.headers)
    headers.set(
        'Authorization',
        `Basic ${btoa('localfirst:' + context.env.COUCH_DEMO_PASSWORD)}`
    )

    const response = await fetch(
        couchUrl +
            url.pathname.replace('/_couch', '/') +
            (url.search ? `?${url.search}` : ''),
        {
            method: context.request.method,
            headers,
            body: context.request.body
        }
    )

    return new Response(response.body, {
        status: response.status,
        headers: resHeaders(response.headers)
    })
}
