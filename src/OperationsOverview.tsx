import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { Booking, Product, RentalData } from './model';
import { rentalLabel, statusLabel } from './model';
import { operations } from './operations';
import { t, formatDateTime } from './i18n';
import './operations.css';

export default function OperationsOverview({ data, onBooking, onProduct }: { data: RentalData; onBooking: (booking: Booking) => void; onProduct: (product: Product) => void }) {
  const [selected, setSelected] = useState<'reserved' | 'rented' | 'overdue' | 'products'>('reserved');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const summary = operations(data, now);
  return <section className="operations-overview" aria-label={t('operations.title')}>
    <details className="operations-disclosure">
    <summary><h2><span><strong>{t('operations.title')}</strong><small>{t('home.browseOperations')}</small></span><ChevronDown size={19} aria-hidden="true" /></h2></summary>
    <div className="operations-body">
    <div className="operations-filters">{(['reserved', 'rented', 'overdue', 'products'] as const).map(key => <button key={key} data-category={key} data-empty={summary[key].length ? undefined : 'true'} aria-pressed={selected === key} onClick={() => setSelected(key)}><span>{t(`operations.${key}`)}</span><strong>{summary[key].length}</strong></button>)}</div>
    <div className="operations-list" aria-live="polite">
      {selected === 'products' ? summary.products.map(product => <button key={product.id} onClick={() => onProduct(product)}><span><strong>{product.name}</strong><small>{product.identifier}</small><em>{statusLabel(product.status)}</em></span><ChevronRight size={17} aria-hidden="true" /></button>) : summary[selected].map(booking => <button key={booking.id} onClick={() => onBooking(booking)}><span><strong>{data.products.find(p => p.id === booking.productId)?.name || t('common.unknownItem')}</strong><small>{booking.referenceCode} · {booking.customerName}</small><small>{formatDateTime(selected === 'reserved' ? booking.startAt : booking.endAt)} · {rentalLabel(booking.rentalStatus)}</small></span><ChevronRight size={17} aria-hidden="true" /></button>)}
      {!summary[selected].length && <p className="empty-copy">{t('operations.empty')}</p>}
    </div>
    <details className="operations-help"><summary><Info size={15} aria-hidden="true" />{t('home.countingRules')}</summary><p>{t(selected === 'products' ? 'operations.productHint' : 'operations.bookingHint')}</p></details>
    </div>
    </details>
  </section>;
}
