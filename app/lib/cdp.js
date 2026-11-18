import { composeFetch } from './compose-api.js'

export async function cdpFetch(path, options) {
    return composeFetch(`/devtools-api${path}`, options)
}
