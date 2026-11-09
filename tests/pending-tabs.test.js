import assert from 'node:assert/strict'
import { createPendingScheduler, getArchivedTabItems, snoozeHorizon, snoozeTime } from '../app/lib/pending-tabs.js'

Deno.test('snooze presets use durations and local calendar mornings', () => {
    const now = new Date(2026, 10, 9, 23, 45).getTime()
    assert.equal(snoozeTime('1h', now) - now, 3600000)
    assert.equal(snoozeTime('4h', now) - now, 14400000)
    assert.equal(snoozeTime('tomorrow', now), new Date(2026, 10, 10, 9).getTime())
    assert.equal(snoozeTime('week', now), new Date(2026, 10, 16, 9).getTime())
})

Deno.test('archive menus group whole actions and leave separately closed members separate', () => {
    const tab = (id, extra = {}) => ({ id, type: 'tab', title: id, spaceId: 'space', tabGroupId: 'research', ...extra })
    const items = getArchivedTabItems([
        tab('one', { closedBatchId: 'close', tabGroupOrder: 1 }),
        tab('two', { closedBatchId: 'close', tabGroupOrder: 0 }),
        tab('three'), tab('four'),
        tab('five', { pending: { batchId: 'snooze', createdAt: 100 } }),
        tab('six', { pending: { batchId: 'snooze', createdAt: 100 } })
    ], { 'darc:tabgroup_research': { name: 'Research' } })
    assert.equal(items.length, 4)
    assert.deepEqual(items[0].tabs.map(tab => tab.id), ['five', 'six'])
    assert.deepEqual(items.find(item => item.tabs.some(tab => tab.id === 'one')).tabs.map(tab => tab.id), ['two', 'one'])
    assert.equal(items[0].title, 'Research')
})

Deno.test('one scheduler refresh handles overdue, two-hour horizon, sync reschedules and cancellation', async () => {
    let now = 10000000
    const pending = (id, wakeAt) => ({ id, pending: { batchId: id, wakeAt } })
    let records = [pending('overdue', now - 100), pending('soon', now + 100), pending('edge', now + snoozeHorizon), pending('later', now + snoozeHorizon + 1), pending('external', null)]
    const timers = new Map()
    const woke = []
    let nextTimer = 0
    const scheduler = createPendingScheduler({
        now: () => now,
        read: async () => structuredClone(records),
        wake: async tab => { woke.push(tab.id); records = records.filter(record => record.id !== tab.id) },
        setTimer: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id },
        clearTimer: id => timers.delete(id),
        onError: error => { throw error }
    })
    await scheduler.refresh()
    assert.deepEqual(woke, ['overdue'])
    assert.deepEqual([...timers.values()].map(timer => timer.delay), [100, snoozeHorizon])
    const staleCallback = [...timers.values()][0].callback
    records = records.filter(tab => tab.id !== 'edge')
    records[0].pending.wakeAt = now + snoozeHorizon + 500
    await Promise.all([scheduler.refresh(), scheduler.refresh()])
    assert.equal(timers.size, 0)
    now += 100
    staleCallback()
    await scheduler.refresh()
    assert.deepEqual(woke, ['overdue'], 'a stale callback re-reads state instead of waking a rescheduled tab')
    now += snoozeHorizon
    await scheduler.refresh()
    assert.deepEqual(woke, ['overdue', 'later'])
    assert.equal(timers.size, 1)
    scheduler.stop()
    assert.equal(timers.size, 0)
})
