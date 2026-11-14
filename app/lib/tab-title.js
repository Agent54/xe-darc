export function getTabTitle (tab) {
    return tab?.titleOverride?.trim() || tab?.title?.trim() || tab?.url?.trim() || ''
}

export function getTabDisplayLabel(tab, displayed = tab) {
    const title = getTabTitle(tab)
    return displayed?.id !== tab?.id && displayed ? `${title} · ${getTabTitle(displayed)}` : title
}
