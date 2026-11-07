import { detectUrl } from './utils.js'

// Shared by the new-tab page and clipboard menu so both navigate identically.
export function resolveNewTabInput(input, settings = localStorage) {
    const text = input.trim()
    if (!text) return null

    const url = detectUrl(text)
    if (url) return { text, url, isSearch: false }

    const kagiPrefix = text.toLowerCase().startsWith('k ')
    const engine = settings.getItem('defaultSearchEngine') || 'google'
    if (!kagiPrefix && engine === 'custom') {
        const customUrl = settings.getItem('customSearchUrl')
        if (customUrl) {
            try {
                return { text, url: new URL(customUrl + encodeURIComponent(text)).href, isSearch: true }
            } catch {
                // Invalid custom search URLs fall back to Google.
            }
        }
    }

    const searchUrl = new URL(kagiPrefix || engine === 'kagi' ? 'https://kagi.com/search' : 'https://www.google.com/search')
    searchUrl.searchParams.set('q', kagiPrefix ? text.slice(2) : text)
    return { text, url: searchUrl.href, isSearch: true }
}
