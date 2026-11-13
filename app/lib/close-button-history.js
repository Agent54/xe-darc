// Share history reveal timing between open and recently closed tab buttons.
export function closeButtonHistory (node, options) {
    let timer = null

    function leave () {
        clearTimeout(timer)
        timer = null
        options.onChange?.(false)
    }

    function enter () {
        leave()
        if (options.cardVisible) {
            timer = setTimeout(() => {
                timer = null
                options.onChange?.(true)
            }, 300)
        } else {
            options.onChange?.(true)
        }
    }

    node.addEventListener('mouseenter', enter)
    node.addEventListener('mouseleave', leave)
    return {
        update (next) { options = next },
        destroy () {
            clearTimeout(timer)
            node.removeEventListener('mouseenter', enter)
            node.removeEventListener('mouseleave', leave)
        }
    }
}
