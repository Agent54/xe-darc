import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { detectUrl } from '../app/lib/utils.js'
import { resolveNewTabInput } from '../app/lib/new-tab-input.js'

Deno.test('URL detection adds HTTP to domains, www hosts and localhost', () => {
    const cases = [
        ['google.com', 'http://google.com/'],
        ['  www.google.com  ', 'http://www.google.com/'],
        ['WWW.google.com:8080/path?q=hello#section', 'http://www.google.com:8080/path?q=hello#section'],
        ['sub.example.co.uk/path', 'http://sub.example.co.uk/path'],
        ['example.com.', 'http://example.com./'],
        ['bücher.de', 'http://xn--bcher-kva.de/'],
        ['localhost:3000/path', 'http://localhost:3000/path'],
    ]
    for (const [input, expected] of cases) assert.equal(detectUrl(input), expected, input)
})

Deno.test('URL detection handles IPv4 addresses with ports and paths', () => {
    for (const host of ['0.0.0.0', '127.0.0.1', '192.168.1.1', '255.255.255.255']) {
        assert.equal(detectUrl(host), `http://${host}/`)
        assert.equal(detectUrl(`${host}:8080/path?q=1#top`), `http://${host}:8080/path?q=1#top`)
    }
})

Deno.test('URL detection brackets bare IPv6 and preserves bracketed ports', () => {
    const cases = [
        ['::1', 'http://[::1]/'],
        ['2001:db8::1/path?q=1#top', 'http://[2001:db8::1]/path?q=1#top'],
        ['fe80::1', 'http://[fe80::1]/'],
        ['2001:db8:0:0:0:0:0:1', 'http://[2001:db8::1]/'],
        ['::ffff:192.168.1.1', 'http://[::ffff:c0a8:101]/'],
        ['[::1]:8080/path', 'http://[::1]:8080/path'],
    ]
    for (const [input, expected] of cases) assert.equal(detectUrl(input), expected, input)
})

Deno.test('URL detection preserves explicit URLs and schemes', () => {
    for (const input of ['https://google.com/path?q=1#top', 'http://127.0.0.1:8080/', 'http://[::1]:8080/', 'about:blank', 'file:///path/file.html', 'mailto:jan@example.com']) {
        assert.equal(detectUrl(input), new URL(input).href, input)
    }
})

Deno.test('URL detection leaves queries and malformed addresses for search', () => {
    for (const input of ['', '  ', 'google', 'google com', 'find google.com', 'k google.com', 'user@example.com', 'example..com', '-example.com', 'example-.com', 'example.c', 'example.com:99999', '256.1.1.1', '192.168.1.999', '127.1', '1.2.3', 'fe80::gggg', '2001:db8:::1', '[::1', '[::1]:99999', 'https://', 'google.com\\path']) {
        assert.equal(detectUrl(input), null, input)
    }
})

const source = Deno.readTextFileSync(new URL('../app/components/NewTab.svelte', import.meta.url))
const submit = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handleSubmit')

function submitInput(inputValue, settings = {}) {
    const navigations = []
    let prevented = false
    const handler = new Function('inputValue', 'resolveNewTabInput', 'data', 'tab', `${source.slice(submit.start, submit.end)}; return handleSubmit`)(
        inputValue, input => resolveNewTabInput(input, { getItem: key => settings[key] }), { navigate: (...args) => navigations.push(args) }, { id: 'new-tab' },
    )
    handler({ preventDefault() { prevented = true } })
    assert.equal(prevented, true)
    return navigations
}

Deno.test('new tab submission navigates detected addresses and keeps search settings', () => {
    for (const input of ['google.com', 'www.google.com', '192.168.1.1', '2001:db8::1', '[::1]:8080', 'https://example.com']) {
        assert.deepEqual(submitInput(input), [['new-tab', detectUrl(input)]])
    }
    assert.deepEqual(submitInput('  '), [])
    const search = (input, settings) => new URL(submitInput(input, settings)[0][1])
    assert.equal(search('hello world').origin, 'https://www.google.com')
    assert.equal(search('hello world').searchParams.get('q'), 'hello world')
    assert.equal(search('k google.com').origin, 'https://kagi.com')
    assert.equal(search('k google.com').searchParams.get('q'), 'google.com')
    assert.equal(search('hello world', { defaultSearchEngine: 'kagi' }).origin, 'https://kagi.com')
    assert.equal(search('hello world', { defaultSearchEngine: 'custom', customSearchUrl: 'https://search.example/?q=' }).searchParams.get('q'), 'hello world')
    assert.equal(search('hello world', { defaultSearchEngine: 'custom', customSearchUrl: 'invalid' }).origin, 'https://www.google.com')
})

Deno.test('clipboard input uses the same URL and search classification as the new-tab page', () => {
    const settings = { getItem: () => null }
    assert.equal(resolveNewTabInput(' \n ', settings), null)
    for (const text of ['google.com', 'localhost:3000', '::1', 'about:blank']) {
        assert.deepEqual(resolveNewTabInput(`  ${text}  `, settings), { text, url: detectUrl(text), isSearch: false })
    }
    for (const text of ['hello world', 'google', 'example..com', 'k google.com']) {
        const input = resolveNewTabInput(text, settings)
        assert.equal(input.isSearch, true)
        assert.equal(input.url, submitInput(text)[0][1])
    }
})
