self.addEventListener('fetch', (e) => {
    // console.log('sw fetch', e.request.url)
    e.respondWith(fetch(e.request))
})

// console.log('sw loaded')

