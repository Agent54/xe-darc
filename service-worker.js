self.addEventListener('fetch', (e) => {
    // console.log('sw fetch', e.request)

    if (e.request.url.includes('/app/test.js')) {
        const response = new Response(`export default function test() {
    console.log('dynamic loading of js module successful ${Math.random()}')
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
    //     `base-uri 'none';default-src 'self';object-src 'none';frame-src 'self' https: blob: data:;connect-src 'self' https: wss: blob: data: ws://localhost:5193;script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval';img-src 'self' https: blob: data:;media-src 'self' https: blob: data:;font-src 'self' blob: data:;style-src 'self' 'unsafe-inline';require-trusted-types-for 'script';frame-ancestors 'self';`)

    // e.request.headers = headers

    e.respondWith(fetch(e.request))
})

// console.log('sw loaded')

// Create trusted types policy for service worker eval
// let trustedTypesPolicy
// if (typeof trustedTypes !== 'undefined') {
//   try {
//     trustedTypesPolicy = trustedTypes.createPolicy('default', {
//       createScript: (input) => {
//         // You can add validation here if needed
//         console.log('Service worker creating trusted script:', input)
//         return function () {console.log('trusted script')} // input
//       }
//     })
//   } catch (e) {
//     console.warn('Could not create trusted types policy in service worker:', e)
//   }
// }

// const policy = trustedTypes.createPolicy('my-policy', {
//   createScript: (input) => {
//     // Validate and sanitize the input here
//     // if (isValidScript(input)) {
//       return input
//     // }
//     // throw new Error('Invalid script')
//   }
// })

// // Use the policy to create trusted script content
// const trustedScript = policy.createScript('console.log("Hello")')

// // This will work even with strict CSP
// console.log(trustedScript)
