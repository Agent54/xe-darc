self.addEventListener('fetch', (e) => {
    // console.log('sw fetch', e.request)

    if (e.request.url == 'isolated-app://kxhwjzichcfrfquwsmlthx2rhpjc75si7v22zajhnudxktjbvvtqaaac/app/test.js') {
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

