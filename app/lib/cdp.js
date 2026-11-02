import { getComposeAPIOrigin } from './compose-api.js'

export async function cdpFetch(path, options) {
    const origin = await getComposeAPIOrigin()
    return fetch(`${origin}/devtools-api${path}`, options)
}
