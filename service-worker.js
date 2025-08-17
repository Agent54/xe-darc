self.addEventListener('fetch', (e) => {
    // console.log('sw fetch', e.request)

    if (e.request.url == 'isolated-app://q7gwzstrnayerkwkmc37jaj3dtytlmwtg3skjal6bmqkhcedq6mqaaac/app/test.js') {
        const response = new Response(`export default function test() {
    console.log('dynamic loading of js module successful')
}`, {
            status: 200,
            headers: {
                'Content-Type': 'application/javascript'
            }
        })
        return e.respondWith(response)
    }
    // add corse header connect-src 

    // const headers = new Headers(e.request.headers)
    // headers.set("content-security-policy",
    //     `base-uri 'none';default-src 'self';object-src 'none';frame-src 'self' https: blob: data:;connect-src 'self' https: wss: blob: data: ws://localhost:5193;script-src 'self' 'wasm-unsafe-eval';img-src 'self' https: blob: data:;media-src 'self' https: blob: data:;font-src 'self' blob: data:;style-src 'self' 'unsafe-inline';require-trusted-types-for 'script';frame-ancestors 'self';`)

    // e.request.headers = headers

    e.respondWith(fetch(e.request))
})

// console.log('sw loaded')

// isolated-app://q7gwzstrnayerkwkmc37jaj3dtytlmwtg3skjal6bmqkhcedq6mqaaac

