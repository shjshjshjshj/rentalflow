import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { RentalData } from "./model";
import { deviceTimeZone, validTimeZone } from "./region";
import { t, tt } from "./i18n";

export default function RegionSettings({ data, onBack, onSave }: { data: RentalData; onBack: () => void; onSave: (zone: string) => Promise<void> }) {
  const [zone, setZone] = useState(data.timeZone ?? deviceTimeZone()), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className="page-stack"><section className="page-intro compact"><button data-page-back className="icon-button" aria-label={t("common.back")} disabled={busy} onClick={onBack}><ChevronLeft /></button><h1>{t("region.title")}</h1></section><form className="integration-card integration-form" onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); try { if (!validTimeZone(zone.trim())) throw new Error("errors.timeZone"); await onSave(zone.trim()); onBack(); } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); } }}>
    <label>{t("region.timeZone")}<input aria-label={t("region.timeZone")} list="time-zones" value={zone} onChange={event => setZone(event.target.value)} required /><datalist id="time-zones">{["Asia/Seoul", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Manila", "Asia/Kuala_Lumpur", "Asia/Singapore", "UTC"].map(value => <option key={value}>{value}</option>)}</datalist></label><button type="button" className="text-button" onClick={() => setZone(deviceTimeZone())}>{t("region.useDevice")}</button><p className="integration-hint">{t("region.timeZoneHint")}</p>
    {error && <p role="alert" className="form-error left">{tt(error)}</p>}<button className="form-primary" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</button>
  </form></div>;
}
