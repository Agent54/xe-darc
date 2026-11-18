import assert from 'node:assert/strict'
import { appMatchesURL, appRuntime, appTimestamp, arrangeApps, isDockerRunning } from '../app/lib/app-view.js'

Deno.test('unsorted and ungrouped preserve source order without mutating apps', () => {
    const apps = [{ id: 'z', type: 'docker' }, { id: 'a', type: 'pwa' }]
    assert.deepEqual(arrangeApps(apps)[0].apps.map(app => app.id), ['z', 'a'])
    assert.deepEqual(arrangeApps(apps, { sort: 'type' })[0].apps.map(app => app.id), ['z', 'a'])
    assert.deepEqual(apps.map(app => app.id), ['z', 'a'])
})

Deno.test('sort dates newest first and place missing dates last', () => {
    const apps = [
        { id: 'unknown' },
        { id: 'old', lastUsed: '2026-10-20T00:00:00Z', installedAt: 1792454400 },
        { id: 'new', lastUsed: '2026-10-29T00:00:00Z', installedAt: 1793232000000 }
    ]
    for (const sort of ['lastUsed', 'installedAt']) {
        assert.deepEqual(arrangeApps(apps, { sort })[0].apps.map(app => app.id), ['new', 'old', 'unknown'])
    }
    assert.equal(appTimestamp('invalid'), 0)
    assert.equal(appTimestamp(Infinity), 0)
})

Deno.test('group and sort are independent, including categories, types and running state', () => {
    const apps = [
        { id: 'a', category: 'Work', type: 'pwa', lastUsed: 1793232000000, running: false },
        { id: 'b', category: 'Work', type: 'docker', lastUsed: 1793232001000, running: true },
        { id: 'c', type: 'pwa', running: false }
    ]
    const categories = arrangeApps(apps, { group: 'category', sort: 'lastUsed' })
    assert.deepEqual(categories.map(group => group.label), ['Uncategorized', 'Work'])
    assert.deepEqual(categories[1].apps.map(app => app.id), ['b', 'a'])
    assert.deepEqual(arrangeApps(apps, { group: 'type' }).map(group => group.label), ['Docker', 'Webapp'])
    assert.deepEqual(arrangeApps(apps, { group: 'running' }).map(group => group.apps.map(app => app.id)), [['b'], ['a', 'c']])
    assert.deepEqual(arrangeApps(apps, { sort: 'running' })[0].apps.map(app => app.id), ['b', 'a', 'c'])
})

Deno.test('date groups use local calendar boundaries and distinguish missing metadata', () => {
    const now = new Date(2026, 9, 29, 12).getTime()
    const date = days => new Date(2026, 9, 29 - days, 10).getTime()
    const apps = [
        { id: 'old', lastUsed: date(40) },
        { id: 'none' },
        { id: 'month', lastUsed: date(20) },
        { id: 'today', lastUsed: date(0) },
        { id: 'week', lastUsed: date(4) }
    ]
    assert.deepEqual(arrangeApps(apps, { group: 'lastUsed', now }).map(group => group.apps[0].id), ['today', 'week', 'month', 'old', 'none'])
    assert.equal(arrangeApps(apps, { group: 'installedAt', now })[0].label, 'Install time unknown')
})

Deno.test('Docker running state combines all service containers with client hibernation', () => {
    const app = { type: 'docker', containerStates: ['exited', 'running'] }
    assert.equal(appRuntime(app).running, true)
    assert.equal(appRuntime(app, [{ hibernated: true }]).running, false)
    assert.equal(appRuntime(app, [{ hibernated: true }, { hibernated: false }]).running, true)
    assert.equal(appRuntime(app, [{ hibernated: true, closed: true }]).running, true)
    assert.equal(appRuntime({ ...app, containerStates: ['exited'] }, [{ hibernated: false }]).running, false)
    for (const status of ['paused', 'restarting', 'exited', 'not running', '']) {
        assert.equal(isDockerRunning(status), false, status)
    }
    assert.equal(isDockerRunning('Up 2 hours (unhealthy)'), true)
    assert.equal(appRuntime({ type: 'docker', status: 'running(1)' }).running, true)
})

Deno.test('webapps are running only with an awake open client and retain usage from closed clients', () => {
    const app = { type: 'pwa' }
    assert.equal(appRuntime(app).running, false)
    const asleep = appRuntime(app, [{ hibernated: true, lastUsed: 1793232000000 }])
    assert.equal(asleep.running, false)
    assert.match(asleep.runtimeLabel, /Client hibernated/)
    const closed = appRuntime(app, [{ hibernated: false, closed: true, lastUsed: 1793232000000 }])
    assert.equal(closed.running, false)
    assert.equal(closed.lastUsed, 1793232000000)
    assert.equal(appRuntime(app, [{ hibernated: false }]).running, true)
})

Deno.test('client matching respects origins, app paths and all Docker endpoints', () => {
    const app = { url: 'https://example.com/app' }
    assert.equal(appMatchesURL(app, 'https://example.com/app/document?x=1'), true)
    assert.equal(appMatchesURL(app, 'https://example.com/application'), false)
    assert.equal(appMatchesURL(app, 'https://example.com/other'), false)
    assert.equal(appMatchesURL(app, 'https://another.example/app'), false)
    assert.equal(appMatchesURL(app, 'invalid'), false)
    assert.equal(appMatchesURL({ endpoints: [{ url: 'https://service--p8080.app.localhost' }, { url: 'https://service--p9000.app.localhost' }] }, 'https://service--p9000.app.localhost/path'), true)
})
