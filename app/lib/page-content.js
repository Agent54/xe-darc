export function pageContentScript({ textOnly = false, selector } = {}) {
    return `(() => {
        const selector = ${JSON.stringify(selector || '')}
        const node = selector ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue : document.body
        if (!node) { throw new Error('No page content matches the requested XPath') }
        return ${textOnly ? '(node.innerText ?? node.textContent)' : '(selector ? node.outerHTML ?? node.textContent : node.innerHTML)'}
    })()`
}
