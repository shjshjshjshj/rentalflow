import RegionSettings from "./RegionSettings";
import CalendarSettings from "./CalendarExport";

import TestItem from "./WorkflowTestItem";
import { needsCompletedItems } from "./domain";
import { Capacitor } from "@capacitor/core";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Bell, CalendarDays, CircleUserRound, Download, GripVertical, Upload, Languages, ListChecks, LogOut, Plus, Play, ShieldCheck, Trash2, Workflow } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CompletionType, ProductFieldDefinition, ProductFieldType, RentalData, TriggerType, WorkflowOutcome, WorkflowStep, WorkflowStepDraft } from "./model";
import { fieldTypeLabel, recordLabel, triggerLabel } from "./model";
import { deleteFieldDefinition, deleteWorkflowStep, reorderWorkflowSteps, saveFieldDefinition, saveWorkflowStep } from "./repository";
import { locales, policyHref, t, tp, tt, type LocalePreference } from "./i18n";
import { isEnabled as notificationsEnabled, sendTest as sendTestReminder, setEnabled as setNotificationsEnabled } from "./notifications";
import { useLocalePreference, setLocale } from "./i18n/react";

interface Props {
  data: RentalData;
  onSaveRegion: (zone: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (text: string) => Promise<void>;
  onDeleteData: () => Promise<void>;
  signedIn: boolean;
  profileName: string;
  onSaveName: (name: string) => void;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

type View = { type: "region" | "calendar" | "root" | "delete" | "language" | "import" | "profile" | "notifications" | "account" | "manage" } | { type: "groups" } | { type: "group"; groupId: string } | { type: "builder"; groupId: string; step?: WorkflowStep } | { type: "preview"; groupId: string } | { type: "field"; groupId: string; field?: ProductFieldDefinition };
const triggerOrder: TriggerType[] = ["booking_confirmed", "rental_minus_2h", "return_minus_2h", "manual"];
const completionTypes: CompletionType[] = ["check", "note", "number", "photo", "select", "signature"];
const fieldTypes: ProductFieldType[] = ["text", "number", "date", "select", "boolean"];

export default function ProductSettingsPage(props: Props) {
  const [view, setView] = useState<View>(() => new URLSearchParams(location.search).get("account") === "delete" ? { type: "delete" } : { type: "root" });
  useEffect(() => { if (new URLSearchParams(location.search).has("account")) { const url = new URL(location.href); url.searchParams.delete("account"); history.replaceState(null, "", url); } }, []);
  const [message, setMessage] = useState("");
  const preference = useLocalePreference();
  useLayoutEffect(() => { document.querySelector(".page")?.scrollTo(0, 0); }, [view]);
  if (view.type === "region") return <RegionSettings data={props.data} onBack={() => setView({ type: "root" })} onSave={props.onSaveRegion} />;
  if (view.type === "calendar") return <CalendarSettings data={props.data} onBack={() => setView({ type: "root" })} />;
  if (view.type === "profile") return <ProfileSettings name={props.profileName} onSave={props.onSaveName} onBack={() => setView({ type: "root" })} />;
  if (view.type === "notifications") return <NotificationSettings data={props.data} onBack={() => setView({ type: "root" })} />;
  if (view.type === "import") return <ImportDataPage onBack={() => setView({ type: "root" })} onImport={props.onImport} />;
  if (view.type === "account") return <AccountDeletePage onBack={() => setView({ type: "manage" })} onDelete={props.onDeleteAccount} />;
  if (view.type === "manage") return <AccountManagePage signedIn={props.signedIn} onBack={() => setView({ type: "root" })} onAccount={() => setView({ type: "account" })} onData={() => setView({ type: "delete" })} />;
  if (view.type === "delete") return <DeleteAccountPage onBack={() => setView({ type: "manage" })} onDelete={props.onDeleteData} />;
  if (view.type === "language") return <LanguageSettings preference={preference} onBack={() => setView({ type: "root" })} />;
  if (view.type === "groups") return <GroupList data={props.data} onBack={() => setView({ type: "root" })} onOpen={groupId => setView({ type: "group", groupId })} />;
  if (view.type === "group") return <GroupDetail data={props.data} groupId={view.groupId} onBack={() => setView({ type: "groups" })} onBuilder={step => setView({ type: "builder", groupId: view.groupId, step })} onPreview={() => setView({ type: "preview", groupId: view.groupId })} onField={field => setView({ type: "field", groupId: view.groupId, field })} onRefresh={props.onRefresh} />;
  if (view.type === "builder") return <WorkflowBuilder data={props.data} groupId={view.groupId} source={view.step} onBack={() => setView({ type: "group", groupId: view.groupId })} onSaved={async () => { await props.onRefresh(); setView({ type: "group", groupId: view.groupId }); }} />;
  if (view.type === "preview") return <WorkflowPreview data={props.data} groupId={view.groupId} onBack={() => setView({ type: "group", groupId: view.groupId })} />;
  if (view.type === "field") return <FieldBuilder data={props.data} groupId={view.groupId} source={view.field} onBack={() => setView({ type: "group", groupId: view.groupId })} onSaved={async () => { await props.onRefresh(); setView({ type: "group", groupId: view.groupId }); }} />;
  const perform = async (work: () => Promise<unknown>, success: string) => { try { setMessage(t("common.working")); await work(); setMessage(success); } catch (error) { setMessage(tt((error as Error).message)); } };
  const localeName = localeLabel;
  return <div className="page-stack"><section className="page-intro compact"><div><span>{t("settings.subtitle")}</span><h1>{props.data.workspaceName}</h1></div></section>
    <dl className="settings-overview">
      <div><dt>{t("settings.totalTasks")}</dt><dd><strong>{props.data.stepRuns.length}</strong><small>{t("settings.totalTasksHint")}</small></dd></div>
      <div><dt>{t("settings.items")}</dt><dd><strong>{props.data.products.length}</strong></dd></div>
      <div><dt>{t("settings.groups")}</dt><dd><strong>{props.data.groups.length}</strong></dd></div>
      <div><dt>{t("settings.license")}</dt><dd><strong className="badge-pro">PRO</strong><small>{t("settings.licenseHint")}</small></dd></div>
    </dl>
    <section className="settings-list">
      <button onClick={() => setView({ type: "region" })}><span><Languages size={21} /></span><p><strong>{t("region.title")}</strong><small>{props.data.timeZone}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => setView({ type: "calendar" })}><span><CalendarDays size={21} /></span><p><strong>{t("calendarSettings.title")}</strong><small>{t("calendarSettings.settingsHint")} · {t("calendarSettings.optional")}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => setView({ type: "groups" })}><span><Workflow size={21} /></span><p><strong>{t("settings.procedures")}</strong><small>{t("settings.proceduresHint")}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => setView({ type: "notifications" })}><span><Bell size={21} /></span><p><strong>{t("settings.notifications")}</strong><small>{t("settings.notificationsHint")}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => setView({ type: "profile" })}><span><CircleUserRound size={21} /></span><p><strong>{t("settings.profile")}</strong><small>{props.profileName || t("settings.profileHint")}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => setView({ type: "language" })}><span><Languages size={21} /></span><p><strong>{t("settings.language")}</strong><small>{localeName(preference)}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => void perform(props.onExport, t("settings.exported"))}><span><Download size={21} /></span><p><strong>{t("settings.export")}</strong><small>{t("settings.exportHint")}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => setView({ type: "import" })}><span><Upload size={21} /></span><p><strong>{t("settings.import")}</strong><small>{t("settings.importHint")}</small></p><ChevronRight size={18} /></button>
      <button onClick={() => window.open(policyHref("terms"), "_blank")}><span><ShieldCheck size={21} /></span><p><strong>{t("policy.terms")}</strong></p><ChevronRight size={18} /></button>
      <button onClick={() => window.open(policyHref("privacy"), "_blank")}><span><ShieldCheck size={21} /></span><p><strong>{t("policy.privacy")}</strong></p><ChevronRight size={18} /></button>
      <button onClick={() => setView({ type: "manage" })}><span><CircleUserRound size={21} /></span><p><strong>{t("settings.account")}</strong><small>{t("settings.accountHint")}</small></p><ChevronRight size={18} /></button>
    </section>
    <p className="settings-note">{t("settings.photosNote")}</p>
    {message && <p role="status" className="settings-message">{message}</p>}
    {props.signedIn && <button className="logout-button" onClick={() => void perform(props.onSignOut, t("settings.loggedOut"))}><LogOut size={18} />{t("settings.logout")}</button>}
  </div>;
}

/** 언어 이름은 그 언어로 적는다. 사용자가 읽지 못하는 문자로 언어를 고르게 하지 않기 위해서다. */
function localeLabel(preference: LocalePreference): string {
  if (preference === "system") return t("language.system");
  return t(`language.${preference}`);
}

function LanguageSettings({ preference, onBack }: { preference: LocalePreference; onBack: () => void }) {
  const options: Array<{ id: LocalePreference; label: string }> = [{ id: "system", label: t("language.system") }, ...locales.map(id => ({ id, label: t(`language.${id}`) }))];
  return <div className="page-stack"><PageHead eyebrow={t("language.eyebrow")} title={t("language.title")} onBack={onBack} /><section className="settings-list">{options.map(option => <button key={option.id} aria-pressed={preference === option.id} onClick={() => setLocale(option.id)}><span><Languages size={21} /></span><p><strong>{option.label}</strong>{option.id === "system" && <small>{t("language.systemHint")}</small>}</p>{preference === option.id && <Check size={18} />}</button>)}</section><p className="settings-note">{t("language.current")}: {localeLabel(preference)}</p></div>;
}

function ProfileSettings({ name, onSave, onBack }: { name: string; onSave: (name: string) => void; onBack: () => void }) {
  const [value, setValue] = useState(name);
  return <div className="page-stack account-settings"><PageHead eyebrow={t("settings.profile")} title={t("profile.title")} onBack={onBack} /><section><p>{t("profile.hint")}</p></section><label className="form-field"><span>{t("profile.label")}</span><input autoFocus value={value} placeholder={t("profile.placeholder")} onChange={event => setValue(event.target.value)} /></label><button className="form-primary" onClick={() => { onSave(value); onBack(); }}>{t("common.save")}</button></div>;
}

function NotificationSettings({ data, onBack }: { data: RentalData; onBack: () => void }) {
  const native = Capacitor.isNativePlatform();
  const [enabled, setEnabled] = useState(notificationsEnabled);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const perform = async (work: () => Promise<void>, success: string) => { setBusy(true); setMessage(""); try { await work(); setMessage(success); } catch (error) { setMessage(tt((error as Error).message)); } finally { setBusy(false); } };
  return <div className="page-stack account-settings"><PageHead eyebrow={t("notify.eyebrow")} title={t("notify.title")} onBack={onBack} /><label className="notification-switch"><span><strong>{t("notify.toggle")}</strong><small>{t("notify.toggleHint")}</small></span><input type="checkbox" role="switch" checked={enabled} disabled={!native || busy} onChange={event => void perform(async () => { setEnabled(await setNotificationsEnabled(event.target.checked, data)); }, event.target.checked ? t("notify.on") : t("notify.off"))} /></label><p>{t("notify.body")}</p>{!native && <p>{t("notify.webOnly")}</p>}{enabled && native && <button className="outline-command" disabled={busy} onClick={() => void perform(sendTestReminder, t("notify.testSent"))}>{t("notify.test")}</button>}{message && <p role="status" className="settings-message">{message}</p>}</div>;
}

/** 삭제는 설정 첫 화면에 두지 않는다. 한 단계 안쪽에서만 고르게 한다. */
function AccountManagePage({ signedIn, onAccount, onData, onBack }: { signedIn: boolean; onAccount: () => void; onData: () => void; onBack: () => void }) {
  return <div className="page-stack"><PageHead eyebrow={t("accountDelete.eyebrow")} title={t("settings.account")} onBack={onBack} /><section className="settings-list">
    {signedIn && <button onClick={onAccount}><span><CircleUserRound size={21} /></span><p><strong>{t("settings.deleteAccount")}</strong><small>{t("accountDelete.heading")}</small></p><ChevronRight size={18} /></button>}
    <button onClick={onData}><span><Trash2 size={21} /></span><p><strong>{t("settings.deleteData")}</strong><small>{t("settings.deleteDataHint")}</small></p><ChevronRight size={18} /></button>
  </section></div>;
}

function AccountDeletePage({ onBack, onDelete }: { onBack: () => void; onDelete: () => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const remove = async () => {
    setBusy(true); setError("");
    try { await onDelete(); }
    catch (thrown) { setError(tt((thrown as Error).message)); }
    finally { setBusy(false); }
  };
  return <div className="page-stack account-settings"><PageHead eyebrow={t("accountDelete.eyebrow")} title={t("accountDelete.title")} onBack={() => { if (!busy) onBack(); }} /><section><h2>{t("accountDelete.heading")}</h2><p>{t("accountDelete.body1")}</p><p>{t("accountDelete.body2")}</p></section><label className="confirmation-row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t("accountDelete.confirm")}</label>{error && <p role="alert" className="form-error left">{error}</p>}<button className="account-delete" disabled={!confirmed || busy} onClick={() => void remove()}>{busy ? t("common.working") : t("accountDelete.action")}</button></div>;
}

function ImportDataPage({ onBack, onImport }: { onBack: () => void; onImport: (text: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try { await onImport(await file.text()); onBack(); }
    catch (thrown) { setError(tt((thrown as Error).message)); }
    finally { setBusy(false); }
  };
  return <div className="page-stack account-settings"><PageHead eyebrow={t("settings.import")} title={t("settings.import")} onBack={() => { if (!busy) onBack(); }} /><section><h2>{t("settings.importHint")}</h2><p>{t("settings.importWarning")}</p></section><label className="confirmation-row"><input type="file" accept="application/json,.json" disabled={busy} onChange={event => void pick(event.target.files?.[0])} />{t("settings.importPick")}</label>{error && <p role="alert" className="form-error left">{error}</p>}</div>;
}

function DeleteAccountPage({ onBack, onDelete }: { onBack: () => void; onDelete: () => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className="page-stack account-settings"><PageHead eyebrow={t("delete.eyebrow")} title={t("delete.title")} onBack={() => { if (!busy) onBack(); }} /><section><h2>{t("delete.heading")}</h2><p>{t("delete.body1")}</p><p>{t("delete.body2")}</p></section><label className="confirmation-row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t("delete.confirm")}</label>{error && <p role="alert" className="form-error left">{tt(error)}</p>}<button className="danger-command" disabled={!confirmed || busy} onClick={async () => { setBusy(true); setError(""); try { await onDelete(); } catch (caught) { setError((caught as Error).message); setBusy(false); } }}>{busy ? t("common.working") : t("delete.button")}</button></div>;
}

function PageHead({ eyebrow, title, onBack, action }: { eyebrow: string; title: string; onBack: () => void; action?: React.ReactNode }) { return <section className="page-intro compact workflow-setting-head"><button data-page-back onClick={onBack} aria-label={t("common.back")}><ChevronLeft size={21} /></button><div><span>{eyebrow}</span><h1>{title}</h1></div>{action}</section>; }

function GroupList({ data, onBack, onOpen }: { data: RentalData; onBack: () => void; onOpen: (id: string) => void }) { return <div className="page-stack"><PageHead eyebrow={t("procedure.eyebrow")} title={t("procedure.title")} onBack={onBack} /><section className="workflow-monitor">{data.groups.map(group => { const steps = data.workflow.filter(item => item.groupId === group.id); return <button className="setting-group-row" key={group.id} onClick={() => onOpen(group.id)}><div><small>{data.categories.find(item => item.id === group.categoryId)?.name}</small><strong>{group.name}</strong><em>{tp("procedure.version", steps.length, { version: group.workflowVersion })}</em></div><ChevronRight size={19} /></button>; })}</section></div>; }

function GroupDetail({ data, groupId, onBack, onBuilder, onPreview, onField, onRefresh }: { data: RentalData; groupId: string; onBack: () => void; onBuilder: (step?: WorkflowStep) => void; onPreview: () => void; onField: (field?: ProductFieldDefinition) => void; onRefresh: () => Promise<void> }) {
  const group = data.groups.find(item => item.id === groupId)!;
  const [open, setOpen] = useState<TriggerType>("booking_confirmed");
  const [dragged, setDragged] = useState<string>();
  const [error, setError] = useState("");
  const move = async (trigger: TriggerType, sourceId: string, targetId: string) => { const rows = data.workflow.filter(item => item.groupId === groupId && item.triggerType === trigger).sort((a, b) => a.sortOrder - b.sortOrder); const from = rows.findIndex(item => item.id === sourceId), to = rows.findIndex(item => item.id === targetId); if (from < 0 || to < 0 || from === to) return; const reordered = [...rows], [item] = reordered.splice(from, 1); reordered.splice(to, 0, item); try { await reorderWorkflowSteps(groupId, trigger, reordered.map(step => step.id)); await onRefresh(); } catch (caught) { setError((caught as Error).message); } };
  const fields = data.fieldDefinitions.filter(item => item.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder);
  return <div className="page-stack"><PageHead eyebrow={t("groupDetail.eyebrow")} title={group.name} onBack={onBack} action={<button className="header-preview" aria-label={t("groupDetail.testAria")} title={t("groupDetail.testTitle")} onClick={onPreview}><Play size={20} /></button>} />
    <div className="group-setting-actions"><button className="primary-command" onClick={() => onBuilder()}><Plus size={18} />{t("groupDetail.newStep")}</button><button className="outline-command" onClick={() => onField()}><Plus size={18} />{t("groupDetail.manageFields")}</button></div>
    <section className="trigger-accordions">{triggerOrder.map(trigger => { const rows = data.workflow.filter(item => item.groupId === groupId && item.triggerType === trigger).sort((a, b) => a.sortOrder - b.sortOrder); return <div key={trigger}><button className="trigger-head" onClick={() => setOpen(trigger)}><p><strong>{triggerLabel(trigger)}</strong><small>{tp("groupDetail.steps", rows.length)}</small></p>{open === trigger ? <ChevronUp size={19} /> : <ChevronDown size={19} />}</button>{open === trigger && <div className="trigger-steps">{rows.length ? rows.map((step, index) => <div key={step.id} draggable onDragStart={() => setDragged(step.id)} onDragOver={event => event.preventDefault()} onDrop={() => dragged && void move(trigger, dragged, step.id)}><GripVertical size={19} /><button onClick={() => onBuilder(step)}><strong>{step.name}</strong><small>{t("groupDetail.stepSummary", { items: step.items.length, outcomes: step.outcomes.length })}</small></button><div><button disabled={index === 0} aria-label={t("groupDetail.moveUp")} onClick={() => index && void move(trigger, step.id, rows[index - 1].id)}><ChevronUp size={17} /></button><button disabled={index === rows.length - 1} aria-label={t("groupDetail.moveDown")} onClick={() => index < rows.length - 1 && void move(trigger, step.id, rows[index + 1].id)}><ChevronDown size={17} /></button></div></div>) : <p className="empty-trigger">{t("groupDetail.noSteps")}</p>}</div>}</div>; })}</section>
    <section className="field-definition-list"><header><div><span>{t("groupDetail.fields")}</span><h2>{tp("groupDetail.fieldsCount", fields.length)}</h2></div><button onClick={() => onField()}><Plus size={17} />{t("groupDetail.add")}</button></header>{fields.length ? fields.map(field => <button key={field.id} onClick={() => onField(field)}><p><strong>{field.name}</strong><small>{fieldTypeLabel(field.type)} · {field.required ? t("common.required") : t("common.optional")}</small></p><ChevronRight size={17} /></button>) : <p>{t("groupDetail.noFields")}</p>}</section>
    {error && <p className="form-error left">{tt(error)}</p>}
  </div>;
}

export function WorkflowBuilder({ data, groupId, source, onBack, onSaved, onSave, onDelete, onRestart }: { data: RentalData; groupId: string; source?: WorkflowStep; onBack: () => void; onSaved: () => Promise<void>; onSave?: (draft: WorkflowStepDraft) => Promise<void>; onDelete?: (step: WorkflowStep) => Promise<void>; onRestart?: () => void }) {
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useLayoutEffect(() => { document.querySelector(".page")?.scrollTo(0, 0); window.scrollTo(0, 0); }, [page]);
  const [draft, setDraft] = useState<WorkflowStepDraft>(() => source ? { id: source.id, groupId, triggerType: source.triggerType, name: source.name, resultMode: source.resultMode, outcomes: source.outcomes, items: source.items.map(item => ({ id: item.id, title: item.title, completionType: item.completionType, required: item.required, config: item.config })) } : { groupId, triggerType: "booking_confirmed", name: "", resultMode: "simple", outcomes: [{ label: t("builder.defaultOutcome"), action: "continue" }], items: [{ id: crypto.randomUUID(), title: "", completionType: "check", required: true, config: {} }] });
  const next = () => setPage(value => Math.min(4, value + 1));
  const setPreset = (preset: "complete" | "approval" | "inspection") => setDraft({ ...draft, resultMode: preset === "complete" ? "simple" : "branch", outcomes: preset === "approval" ? [{ label: t("builder.outcome.approved"), action: "continue" }, { label: t("builder.outcome.supplement"), action: "hold_booking" }, { label: t("builder.outcome.rejected"), action: "cancel_booking" }] : preset === "inspection" ? [{ label: t("builder.outcome.normal"), action: "make_available" }, { label: t("builder.outcome.issue"), action: "create_issue" }] : [{ label: t("builder.defaultOutcome"), action: "continue" }] });
  const save = async () => { setBusy(true); setError(""); try { const value = { ...draft, items: draft.items.filter(item => item.title.trim()) }; await (onSave ? onSave(value) : saveWorkflowStep(value)); await onSaved(); } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); } };
  return <div className="workflow-wizard"><header><button data-page-back aria-label={t("common.back")} onClick={page ? () => setPage(page - 1) : onBack}><ChevronLeft size={21} /></button><div><span>{t("builder.stepProgress", { current: page + 1, total: 5 })}</span><i><b style={{ width: `${(page + 1) * 20}%` }} /></i></div>{onRestart && <button className="wizard-restart" onClick={onRestart}>{t("builder.restart")}</button>}</header><main>
    {page === 0 && <WizardPage eyebrow={t("builder.eyebrow.trigger")} title={t("builder.triggerTitle")} copy={t("builder.triggerCopy")}><div className="wizard-choices">{triggerOrder.map(trigger => <button className={draft.triggerType === trigger ? "selected" : ""} key={trigger} onClick={() => setDraft({ ...draft, triggerType: trigger })}><span><ListChecks size={20} /></span><p><strong>{triggerLabel(trigger)}</strong><small>{trigger === "manual" ? t("builder.manualHint") : t("builder.autoHint")}</small></p>{draft.triggerType === trigger && <Check size={19} />}</button>)}</div><WizardNext onClick={next} /></WizardPage>}
    {page === 1 && <WizardPage eyebrow={t("builder.eyebrow.name")} title={t("builder.nameTitle")} copy={t("builder.nameCopy")}><label className="wizard-input"><span>{t("builder.nameLabel")}</span><input autoFocus value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={t("builder.namePlaceholder")} /></label><WizardNext disabled={!draft.name.trim()} onClick={next} /></WizardPage>}
    {page === 2 && <WizardPage eyebrow={t("builder.eyebrow.items")} title={t("builder.itemTitle")} copy={t("builder.itemCopy")}><div className="wizard-items">{draft.items.map((item, index) => <div key={item.id}><header><b>{index + 1}</b><button onClick={() => setDraft({ ...draft, items: draft.items.filter(row => row.id !== item.id) })} disabled={draft.items.length === 1}><Trash2 size={16} /></button></header><input value={item.title} onChange={event => setDraft({ ...draft, items: draft.items.map(row => row.id === item.id ? { ...row, title: event.target.value } : row) })} placeholder={t("builder.itemPlaceholder")} /><div className="type-options">{completionTypes.map(type => <button className={item.completionType === type ? "selected" : ""} key={type} onClick={() => setDraft({ ...draft, items: draft.items.map(row => row.id === item.id ? { ...row, completionType: type, config: type === "select" ? { options: [t("builder.outcome.normal"), t("builder.option.checkNeeded")] } : {} } : row) })}>{recordLabel(type)}</button>)}</div>{item.completionType === "select" && <label className="item-option-input"><span>{t("builder.optionsLabel")}</span><input value={((item.config.options as string[] | undefined) || []).join(", ")} onChange={event => setDraft({ ...draft, items: draft.items.map(row => row.id === item.id ? { ...row, config: { options: event.target.value.split(",").map(value => value.trim()).filter(Boolean) } } : row) })} placeholder={t("builder.optionsPlaceholder")} /></label>}<label><input type="checkbox" checked={item.required} onChange={event => setDraft({ ...draft, items: draft.items.map(row => row.id === item.id ? { ...row, required: event.target.checked } : row) })} />{t("builder.requiredCheck")}</label></div>)}</div><button className="wizard-add" onClick={() => setDraft({ ...draft, items: [...draft.items, { id: crypto.randomUUID(), title: "", completionType: "check", required: true, config: {} }] })}><Plus size={18} />{t("builder.addItem")}</button><WizardNext disabled={!draft.items.some(item => item.title.trim())} onClick={next} /></WizardPage>}
    {page === 3 && <WizardPage eyebrow={t("builder.eyebrow.outcomes")} title={t("builder.outcomeTitle")} copy={t("builder.outcomeCopy")}><div className="result-presets"><button className={draft.outcomes.length === 1 ? "selected" : ""} onClick={() => setPreset("complete")}><strong>{t("builder.preset.complete")}</strong><small>{t("builder.preset.completeHint")}</small></button><button className={draft.outcomes.some(item => item.action === "hold_booking") ? "selected" : ""} onClick={() => setPreset("approval")}><strong>{t("builder.preset.approval")}</strong><small>{t("builder.preset.approvalHint")}</small></button><button className={draft.outcomes.some(item => item.action === "create_issue") ? "selected" : ""} onClick={() => setPreset("inspection")}><strong>{t("builder.preset.inspection")}</strong><small>{t("builder.preset.inspectionHint")}</small></button></div><WizardNext onClick={next} /></WizardPage>}
    {page === 4 && <WizardPage eyebrow={t("builder.eyebrow.review")} title={t("builder.reviewTitle")} copy={t("builder.reviewCopy")}><div className="wizard-review"><span>{triggerLabel(draft.triggerType)}</span><h2>{draft.name}</h2><strong>{tp("builder.reviewItems", draft.items.filter(item => item.title.trim()).length)}</strong>{draft.items.filter(item => item.title.trim()).map(item => <p key={item.id}><Check size={16} />{item.title}<small>{recordLabel(item.completionType)}</small></p>)}<div>{draft.outcomes.map(item => <b key={item.label}>{item.label}</b>)}</div></div>{error && <p className="form-error left">{tt(error)}</p>}<button className="wizard-primary" disabled={busy} onClick={() => void save()}>{busy ? t("common.saving") : source ? t("builder.apply") : t("builder.create")}</button>{source && <button className="wizard-delete" disabled={busy} onClick={async () => { if (!confirm(t("builder.confirmDelete"))) return; setBusy(true); try { await (onDelete ? onDelete(source) : deleteWorkflowStep(source)); await onSaved(); } catch (caught) { setError((caught as Error).message); setBusy(false); } }}><Trash2 size={16} />{t("builder.delete")}</button>}</WizardPage>}
  </main></div>;
}

function WizardPage({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children: React.ReactNode }) { return <section className="wizard-page"><div className="wizard-title"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{children}</section>; }
function WizardNext({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) { return <button className="wizard-primary" disabled={disabled} onClick={onClick}>{t("common.continue")} <ChevronRight size={19} /></button>; }

function FieldBuilder({ data, groupId, source, onBack, onSaved }: { data: RentalData; groupId: string; source?: ProductFieldDefinition; onBack: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(source?.name || ""), [type, setType] = useState<ProductFieldType>(source?.type || "text"), [required, setRequired] = useState(source?.required || false), [options, setOptions] = useState(source?.config.options?.join(", ") || ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async () => { setBusy(true); try { await saveFieldDefinition({ id: source?.id, groupId, key: source?.key || `field_${Date.now()}`, name, type, required, config: type === "select" ? { options: options.split(",").map(item => item.trim()).filter(Boolean) } : {}, sortOrder: source?.sortOrder ?? data.fieldDefinitions.filter(item => item.groupId === groupId).length }); await onSaved(); } catch (caught) { setError((caught as Error).message); setBusy(false); } };
  return <div className="page-stack account-settings"><PageHead eyebrow={t("field.title")} title={source?.name || t("field.title")} onBack={onBack} /><section className="field-builder"><label><span>{t("field.name")}</span><input value={name} onChange={event => setName(event.target.value)} placeholder={t("field.namePlaceholder")} /></label><div><span>{t("field.type")}</span><div className="field-type-grid">{fieldTypes.map(value => <button className={type === value ? "selected" : ""} key={value} onClick={() => setType(value)}>{fieldTypeLabel(value)}</button>)}</div></div>{type === "select" && <label><span>{t("field.options")}</span><input value={options} onChange={event => setOptions(event.target.value)} placeholder={t("field.optionsPlaceholder")} /><small>{t("field.optionsHint")}</small></label>}<label className="field-required"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />{t("field.required")}</label>{error && <p className="form-error left">{tt(error)}</p>}<button className="form-primary" disabled={busy || !name.trim() || (type === "select" && !options.trim())} onClick={() => void save()}>{busy ? t("common.saving") : t("common.save")}</button>{source && <button className="danger-button" onClick={async () => { if (!confirm(t("field.confirmDelete"))) return; await deleteFieldDefinition(source.id); await onSaved(); }}><Trash2 size={16} />{t("field.delete")}</button>}</section></div>;
}

function WorkflowPreview({ data, groupId, onBack }: { data: RentalData; groupId: string; onBack: () => void }) {
  const group = data.groups.find(item => item.id === groupId)!;
  const [trigger, setTrigger] = useState<TriggerType>("booking_confirmed");
  const [active, setActive] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const steps = useMemo(() => data.workflow.filter(item => item.groupId === groupId && item.triggerType === trigger).sort((a, b) => a.sortOrder - b.sortOrder), [data.workflow, groupId, trigger]);
  const current = steps[active];
  const reset = () => { setActive(0); setValues({}); setResult(""); };
  const advance = () => { setValues({}); setResult(""); setActive(value => value + 1); };
  const messages: Record<string, [string, string]> = {
    hold_booking: [t("preview.holdTitle"), t("preview.holdBody")],
    cancel_booking: [t("preview.cancelTitle"), t("preview.cancelBody")],
    create_issue: [t("preview.issueTitle"), t("preview.issueBody")],
    make_available: [t("preview.availableTitle"), t("preview.availableBody")]
  };
  return <div className="page-stack"><PageHead eyebrow={t("preview.eyebrow")} title={group.name} onBack={onBack}/>
    <div className="preview-trigger-tabs">{triggerOrder.map(item => <button className={trigger === item ? "active" : ""} key={item} onClick={() => { setTrigger(item); reset(); }}>{triggerLabel(item)}</button>)}</div>
    {result ? <section className="workflow-preview-result" role="status"><h2>{messages[result][0]}</h2><p>{messages[result][1]}</p>
      {result === "hold_booking" ? <button className="form-primary" onClick={() => setResult("")}>{t("preview.recheck")}</button>
      : result === "cancel_booking" ? <button className="form-primary" onClick={reset}>{t("preview.otherResult")}</button>
      : <button className="form-primary" onClick={advance}>{t("preview.continue")}</button>}
      <button className="text-button" onClick={onBack}>{t("preview.finish")}</button></section>
    : current ? <section className="workflow-test-card"><header><span>{active + 1} / {steps.length}</span><h2>{current.name}</h2><p>{t("preview.testNote")}</p></header>
      <div>{current.items.map(item => <TestItem key={item.id} item={item} value={values[item.id] || ""} onChange={value => setValues(previous => ({...previous, [item.id]: value}))}/>)}</div>
      <footer>{current.outcomes.map(outcome => <button data-outcome={outcome.action} key={outcome.label} disabled={needsCompletedItems(outcome) && current.items.some(item => item.required && !values[item.id]?.trim())} onClick={() => outcome.action === "continue" ? advance() : setResult(outcome.action)}>{outcome.label}<ChevronRight size={17}/></button>)}</footer></section>
    : <section className="workflow-preview-result"><Check size={28}/><h2>{steps.length ? t("preview.done") : t("preview.none")}</h2><button className="form-primary" onClick={onBack}>{t("preview.backToSettings")}</button>{steps.length > 0 && <button className="text-button" onClick={reset}>{t("preview.retry")}</button>}</section>}
  </div>;
}
