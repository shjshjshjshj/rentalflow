import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { CalendarDays, ChevronLeft } from "lucide-react";
import type { RentalData } from "./model";
import { calendarEntries, configureCalendar, getCalendarError, getCalendarState, listDeviceCalendars, syncCalendar, type CalendarOption, type CalendarState } from "./calendar-sync";
import { t, tt } from "./i18n";

const EMPTY_STATE: CalendarState = { calendarId: "", enabled: false, permission: false };

export default function CalendarSettings({ data, onBack }: { data: RentalData; onBack: () => void }) {
  const native = Capacitor.getPlatform() === "android";
  const [state, setState] = useState<CalendarState>(EMPTY_STATE);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const eligible = useMemo(() => calendarEntries(data).length, [data]);
  const ownerId = data.ownerId;
  const workspaceId = data.workspaceId;
  const target = selected || state.calendarId;
  const targetCalendar = calendars.find(calendar => calendar.id === target);
  const targetName = targetCalendar?.name ?? state.calendarName ?? "";
  const targetMissing = loaded && Boolean(target) && !targetCalendar;

  useEffect(() => {
    if (!native) return;
    let active = true;
    const stored = getCalendarError(data);
    if (stored) setError(tt(stored));
    void getCalendarState(data).then(next => {
      if (!active) return;
      setState(next);
      setSelected(next.calendarId);
      const latest = getCalendarError(data);
      setError(latest ? tt(latest) : "");
    }).catch(() => { if (active) setError(t("errors.calendarSync")); });
    return () => { active = false; };
  }, [native, ownerId, workspaceId]);

  const fail = (caught: unknown) => {
    const raw = caught instanceof Error
      ? caught.message
      : caught && typeof caught === "object" && "message" in caught
        ? String((caught as { message: unknown }).message)
        : "";
    setError(raw.startsWith("errors.") ? tt(raw) : t("errors.calendarSync"));
  };

  const connect = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const options = await listDeviceCalendars();
      setCalendars(options);
      setLoaded(true);
      setState(current => ({ ...current, permission: true }));
      if (!options.length) setError(t("calendarSettings.noCalendars"));
    } catch (caught) { fail(caught); }
    finally { setBusy(false); }
  };

  const choose = async (calendarId: string) => {
    setSelected(calendarId); setError(""); setMessage("");
    if (!calendarId || calendarId === state.calendarId) return;
    setBusy(true);
    try {
      const next = await configureCalendar(data, calendarId, false);
      setState(next);
      setMessage(t("calendarSettings.targetSaved"));
    } catch (caught) {
      fail(caught);
      setSelected(state.calendarId);
    } finally { setBusy(false); }
  };

  const toggle = async (enabled: boolean) => {
    if (enabled && (!target || targetMissing)) return;
    if (enabled && !state.permission) { setError(t("errors.calendarPermission")); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const next = await configureCalendar(data, target, enabled);
      setState(next);
      setMessage(t(enabled ? "calendarSettings.enabled" : "calendarSettings.disabled"));
    } catch (caught) { fail(caught); }
    finally { setBusy(false); }
  };

  const syncCurrent = async () => {
    if (!target || targetMissing || eligible === 0) return;
    if (!state.permission) { setError(t("errors.calendarPermission")); return; }
    if (!confirm(t("calendarSettings.confirmCurrent").replace("{count}", String(eligible)))) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await syncCalendar(data, true);
      setMessage(t("calendarSettings.syncResult")
        .replace("{inserted}", String(result.inserted))
        .replace("{updated}", String(result.updated))
        .replace("{deleted}", String(result.deleted))
        .replace("{failed}", String(result.failed)));
      if (result.failed > 0) setError(t("errors.calendarSync"));
    } catch (caught) { fail(caught); }
    finally { setBusy(false); }
  };

  return <div className="page-stack account-settings">
    <section className="page-intro compact">
      <button className="icon-button" aria-label={t("common.back")} onClick={onBack}><ChevronLeft size={22} /></button>
      <div><span>{t("calendarSettings.eyebrow")}</span><h1>{t("calendarSettings.title")}</h1></div>
    </section>
    <p className="settings-note">{t("calendarSettings.description")}</p>
    {!native && <p role="status" className="settings-message">{t("calendarSettings.webOnly")}</p>}
    {state.calendarId && !state.permission && <p role="alert" className="form-error">{t("errors.calendarPermission")}</p>}
    <button className="outline-command" disabled={!native || busy} onClick={() => void connect()}><CalendarDays size={18} />{t("calendarSettings.connect")}</button>
    {calendars.length > 0 && <label className="form-field"><span>{t("calendarSettings.destination")}</span><select aria-label={t("calendarSettings.destination")} value={selected} disabled={busy} style={{ minWidth: 0, width: "100%" }} onChange={event => void choose(event.target.value)}><option value="" disabled>{t("calendarSettings.chooseCalendar")}</option>{calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.account ? ` · ${calendar.account}` : ""}</option>)}</select><small>{t("calendarSettings.destinationHint")}</small></label>}
    {targetMissing ? <p role="alert" className="form-error">{t("calendarSettings.unavailableTarget")}</p> : target && <p className="settings-note">{t("calendarSettings.currentTarget").replace("{name}", targetName || t("calendarSettings.chooseCalendar"))}</p>}
    <button className="outline-command" disabled={!native || busy || !target || targetMissing || eligible === 0 || !state.permission} onClick={() => void syncCurrent()}>{t("calendarSettings.current").replace("{count}", String(eligible))}</button>
    <label className="notification-switch"><span><strong>{t("calendarSettings.future")}</strong><small>{t("calendarSettings.offNote")}</small></span><input type="checkbox" role="switch" checked={state.enabled} disabled={!native || busy || (!state.enabled && (!target || targetMissing || !state.permission))} onChange={event => void toggle(event.target.checked)} /></label>
    <p className="settings-note">{t("calendarSettings.syncNote")}</p>
    <p className="settings-note">{t("calendarSettings.calendarChange")}</p>
    <p className="settings-note">{t("calendarSettings.providerSync")}</p>
    {error && <p role="alert" className="settings-message">{error}</p>}
    {message && <p role="status" className="settings-message">{message}</p>}
  </div>;
}
