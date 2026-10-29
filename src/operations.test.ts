import assert from 'node:assert/strict';
import { operations, homeAttention } from './operations.ts';
import { bookingViewState } from './domain.ts';
import { demoData } from './demo-data.ts';
import type { Booking } from './model.ts';
const now = new Date('2026-10-19T03:00:00Z');
const booking = { ...demoData.bookings[0], approvalStatus: 'approved' as const, startAt: '2026-10-18T03:00:00Z', endAt: '2026-10-19T02:00:00Z' };
const statuses: Booking['rentalStatus'][] = ['reserved','checked_out','returning','returned','cancelled'];
const bookings = statuses.map((rentalStatus,i) => ({ ...booking, id:String(i), rentalStatus }));
bookings.push({ ...booking, id:'rejected', rentalStatus:'reserved', approvalStatus:'rejected' } as Booking);
bookings.push({ ...booking, id:'exact', rentalStatus:'checked_out', endAt:now.toISOString() });
const result=operations({ ...demoData, bookings },now);
assert.equal(result.reserved.length,1);
assert.equal(result.rented.length,3);
assert.deepEqual(result.overdue.map(b=>b.id),['1','2']);
assert.equal(result.products.length,demoData.products.length);
assert.equal(operations({...demoData,bookings:[],products:[]},now).overdue.length,0);
console.log('Operations excludes closed/rejected bookings; includes returning and respects overdue boundary');

for (const offset of [-1, 0, 1]) {
  const returning = { ...booking, rentalStatus: 'returning' as const, endAt: now.toISOString() };
  const at = new Date(+now + offset);
  const data = { ...demoData, bookings: [returning], issues: [] };
  assert.equal(operations(data, at).rented.length, 1);
  assert.equal(operations(data, at).overdue.length, offset > 0 ? 1 : 0);
  assert.equal(bookingViewState(returning, at), offset > 0 ? 'return_overdue' : 'returning');
  assert.equal(homeAttention(data, at).length, offset > 0 ? 1 : 0);
}

const mixed = {
  ...demoData,
  bookings: [
    { ...booking, id: 'pending', startAt: '2026-10-20T03:00:00Z', rentalStatus: 'reserved', approvalStatus: 'pending' },
    { ...booking, id: 'return-first', rentalStatus: 'returning', endAt: '2026-10-18T02:00:00Z' },
    { ...booking, id: 'pickup-tie', rentalStatus: 'reserved', startAt: '2026-10-18T02:00:00Z' },
    { ...booking, id: 'approval-oldest', rentalStatus: 'reserved', approvalStatus: 'pending', startAt: '2026-10-17T02:00:00Z' },
    { ...booking, id: 'supplement', rentalStatus: 'reserved', approvalStatus: 'needs_supplement', startAt: '2026-10-18T04:00:00Z' },
    { ...booking, id: 'rejected', rentalStatus: 'reserved', approvalStatus: 'rejected' },
    { ...booking, id: 'cancelled', rentalStatus: 'cancelled' },
    { ...booking, id: 'done', rentalStatus: 'returned' },
    { ...booking, id: 'pending-second', startAt: '2026-10-20T02:00:00Z', rentalStatus: 'reserved', approvalStatus: 'needs_supplement' },
  ] as Booking[],
  issues: ['i1', 'i2', 'i3', 'resolved'].map(id => ({ id, productId: booking.productId, type: 'check', note: '', status: id === 'resolved' ? 'resolved' as const : 'open' as const })),
};
const before = structuredClone(mixed);
const tasks = homeAttention(mixed, now);
assert.deepEqual(tasks.map(task => task.kind === 'booking' ? task.booking.id : task.issue.id), [
  'approval-oldest', 'return-first', 'pickup-tie', 'supplement', 'i1', 'i2', 'i3', 'pending', 'pending-second',
], 'overdue first by deadline, stable ties, then issues, then pending in original order');
assert.equal(tasks.length, 9, 'total includes all tasks beyond the three-row preview');
assert.ok(tasks.slice(0, 3).every(task => task.kind === 'booking' && task.state.endsWith('_overdue')));
assert.deepEqual(mixed, before, 'summaries must never change stored data or ordering');
assert.deepEqual(homeAttention({ ...mixed, bookings: [], issues: [] }, now), []);
console.log('Home attention covers returning boundary, urgent ordering, exclusions, total and immutable inputs');
