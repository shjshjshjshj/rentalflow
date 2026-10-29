import assert from 'node:assert/strict';
import { calendarEntries, calendarWorkspaceKey, configureCalendar, getCalendarState, syncCalendar } from './calendar-sync.ts';
import { demoData } from './demo-data.ts';
import type { Booking } from './model.ts';

const source = { ...demoData.bookings[0], customerName: 'PRIVATE_NAME', customerPhone: 'PRIVATE_PHONE', memo: 'PRIVATE_NOTE', price: 123456,
  startAt: '2026-11-01T02:00:00Z', endAt: '2026-11-02T02:00:00Z', rentalStatus: 'reserved' as const, approvalStatus: 'approved' as const };
const bookings: Booking[] = [source,
  { ...source, id: 'returned', rentalStatus: 'returned' },
  { ...source, id: 'cancelled', rentalStatus: 'cancelled' },
  { ...source, id: 'rejected', approvalStatus: 'rejected' },
  { ...source, id: 'broken', endAt: 'invalid' },
  { ...source, id: 'zero', endAt: source.startAt },
];
const data = { ...demoData, bookings };
const before = structuredClone(data);
const entries = calendarEntries(data);
assert.deepEqual(entries.map(row => row.id), [source.id, 'returned']);
assert.deepEqual(Object.keys(entries[0]).sort(), ['end', 'id', 'start', 'title']);
assert.equal(entries[0].start, Date.parse(source.startAt));
assert.ok(!JSON.stringify(entries).includes('PRIVATE'));
assert.ok(!JSON.stringify(entries).includes('123456'));
assert.deepEqual(data, before);
assert.notEqual(calendarWorkspaceKey({ ownerId: 'a:b', workspaceId: 'c' }), calendarWorkspaceKey({ ownerId: 'a', workspaceId: 'b:c' }));
assert.deepEqual(await getCalendarState(data), { calendarId: '', enabled: false, permission: false });
assert.deepEqual(await configureCalendar(data, '1', true), { calendarId: '', enabled: false, permission: false });
assert.deepEqual(await syncCalendar(data, true), { inserted: 0, updated: 0, deleted: 0, failed: 0 });
console.log('Calendar payload privacy, all-items eligibility, valid instants, workspace isolation and web no-op passed');
