import { bookingViewState } from './domain.ts';
import type { RentalData } from './model.ts';

export function homeAttention(data: RentalData, now = new Date()) {
  const actionableStates = new Set(['pending_approval', 'needs_supplement', 'approval_overdue', 'supplement_overdue', 'pickup_overdue', 'return_overdue']);
  const active = operations(data, now);
  const activeIds = new Set([...active.reserved, ...active.rented].map(booking => booking.id));
  const entries = data.bookings
    .filter(booking => activeIds.has(booking.id))
    .map(booking => ({ booking, state: bookingViewState(booking, now) }))
    .filter(entry => actionableStates.has(entry.state));
  const deadline = (entry: (typeof entries)[number]) => Date.parse(entry.state === 'return_overdue' ? entry.booking.endAt : entry.booking.startAt);
  const overdue = entries.filter(entry => entry.state.endsWith('_overdue')).sort((a, b) => deadline(a) - deadline(b));
  const pending = entries.filter(entry => !entry.state.endsWith('_overdue'));
  return [
    ...overdue.map(entry => ({ kind: 'booking' as const, ...entry })),
    ...data.issues.filter(issue => issue.status === 'open').map(issue => ({ kind: 'issue' as const, issue })),
    ...pending.map(entry => ({ kind: 'booking' as const, ...entry })),
  ];
}

export function operations(data: RentalData, now = new Date()) {
  const active = data.bookings.filter(b => !['cancelled', 'returned'].includes(b.rentalStatus) && b.approvalStatus !== 'rejected');
  const rented = active.filter(b => ['checked_out', 'returning'].includes(b.rentalStatus));
  return {
    reserved: active.filter(b => b.rentalStatus === 'reserved').sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    rented,
    overdue: rented.filter(b => Date.parse(b.endAt) < +now).sort((a, b) => Date.parse(a.endAt) - Date.parse(b.endAt)),
    products: data.products,
  };
}
