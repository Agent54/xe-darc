export function getTabTitle (tab) {
    return tab?.titleOverride?.trim() || tab?.title?.trim() || tab?.url?.trim() || ''
}
