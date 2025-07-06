self.addEventListener('fetch', (e) => {
    // console.log('sw fetch', e.request)

    if (e.request.url == 'isolated-app://q7gwzstrnayerkwkmc37jaj3dtytlmwtg3skjal6bmqkhcedq6mqaaac/app/test.js') {
        const response = new Response(`export default function test() {
    console.log('test world ')
}`, {
            status: 200,
            headers: {
                'Content-Type': 'application/javascript'
            }
        })
        return e.respondWith(response)
    }
    e.respondWith(fetch(e.request))
})

// console.log('sw loaded')

// isolated-app://q7gwzstrnayerkwkmc37jaj3dtytlmwtg3skjal6bmqkhcedq6mqaaac