import HomePage from "./HomePage";
import { App as NativeApp } from "@capacitor/app";
import { useEffect, useMemo, useState, useLayoutEffect, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, Bell, CalendarDays, Camera, CarFront, Check, ChevronLeft, ChevronRight, CircleUserRound, ClipboardCheck, Home, ListChecks, Package, Plus, Search, Settings, Trash2, Workflow, X } from "lucide-react";
import { isRunAvailable, needsCompletedItems } from "./domain";
import "./integration.css";
import { dayKey, localInput, toInstant } from "./region";

import CalendarPage from "./CalendarPage";
import { readLocalPhoto, saveLocalPhoto } from "./media-store";
import { deleteLocalData, exportWorkspace, importWorkspace } from "./account";
import { cancelReminders, initializeNotificationTap, syncReminders } from "./notifications";
import { readName, writeName } from "./profile";
import { setCalendarContext, syncCalendar } from "./calendar-sync";
import ConsentGate from "./ConsentGate";
import { authConfigured, deleteAccount, restoreUser, signInWithGoogle, signOut as signOutUser, type AuthUser } from "./auth";
import Onboarding from "./Onboarding";
import BookingDetail from "./BookingDetail";
import ProductEditorPro from "./ProductEditorPro";
import ProductSettingsPage from "./ProductSettingsPage";
import type { Booking, BookingDraft, Issue, Product, ProductDraft, ProductStatus, RentalData, StepRun, WorkflowOutcome } from "./model";
import { approvalLabel, recordLabel, rentalLabel, statusLabel, triggerLabel } from "./model";
import { clearRentalWidget, initializeWidgetNavigation, syncRentalWidget, syncRentalWidgetSetup } from "./widget";
import { useRentalData } from "./use-rental-data";
import { formatPrice, policyHref, scheduleLabel, t, tp, tt } from "./i18n";
import { useLocale } from "./i18n/react";

type Section = "home" | "calendar" | "work" | "inventory" | "settings";
type NavItem = { id: Section; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> };
type OverlayState = { type: "product"; product?: Product } | { type: "booking"; booking?: Booking } | { type: "group" } | { type: "detail"; booking: Booking } | { type: "run"; run: StepRun; returnBookingId?: string } | { type: "issue"; issue: Issue; returnBookingId?: string } | null;
const navItems = (): NavItem[] => [{ id: "home", label: t("nav.home"), icon: Home }, { id: "calendar", label: t("nav.calendar"), icon: CalendarDays }, { id: "work", label: t("nav.work"), icon: ListChecks }, { id: "inventory", label: t("nav.inventory"), icon: Package }, { id: "settings", label: t("nav.settings"), icon: Settings }];

function App() {
  const locale = useLocale();
  const [section, setSection] = useState<Section>(() => new URLSearchParams(location.search).get("account") === "delete" ? "settings" : "home");
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [onboardingActive, setOnboardingActive] = useState(() => new URLSearchParams(location.search).has("onboarding"));
  const [profileName, setProfileName] = useState(readName);
  // 계정이 설정되어 있으면 로그인 게이트를 세운다. 설정이 없으면 기기 전용으로 그대로 동작한다.
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(!authConfigured);
  useEffect(() => { void restoreUser().then(user => { setAuthUser(user); setAuthReady(true); }); }, []);
  // 사업장은 계정에 귀속된다. 설정이 없는 빌드는 한 계정처럼 묶는다.
  const ownerId = authConfigured ? authUser?.id ?? "" : "local";
  const rental = useRentalData(ownerId);
  useLayoutEffect(() => { document.querySelector(".page")?.scrollTo(0, 0); }, [section]);
  useEffect(() => {
    const data = rental.data;
    if (!data || data.ownerId !== ownerId) return;
    // 로그아웃 상태에서는 잠금 화면에 내용을 남기지 않는다.
    if (authConfigured && !authUser) {
      void clearRentalWidget();
      void cancelReminders();
      return;
    }
    // 설정을 끝내기 전에는 보여줄 일정이 없으므로 준비 상태를 알린다.
    if (data.onboardingCompleted && data.termsAccepted && data.privacyAccepted) {
      void syncRentalWidget(data, locale);
      // 앱을 열 때마다 다시 건다. 재부팅으로 사라진 알람도 이때 복구된다.
      void syncReminders(data);
    } else void syncRentalWidgetSetup(locale);
  }, [rental.data, locale, authUser]);
  useEffect(() => {
    const data = rental.data;
    if (!data || data.ownerId !== ownerId) return;
    if (authConfigured && !authUser) return;
    if (!data.onboardingCompleted || !data.termsAccepted || !data.privacyAccepted) return;
    setCalendarContext(data);
    void syncCalendar(data, false).catch(() => {});
    return () => setCalendarContext(null);
  }, [rental.data, ownerId, authUser]);
  useEffect(() => {
    if (!rental.data || rental.data.ownerId !== ownerId) return;
    let dispose: (() => void) | undefined;
    void initializeNotificationTap(bookingId => { const booking = rental.data?.bookings.find(item => item.id === bookingId); if (booking) setOverlay({ type: "detail", booking }); }).then(cleanup => { dispose = cleanup; });
    return () => dispose?.();
  }, [rental.data]);
  useEffect(() => {
    if (!rental.data || rental.data.ownerId !== ownerId) return;
    let cancelled = false, dispose: (() => void) | undefined;
    void initializeWidgetNavigation({
      onBooking: bookingId => { const booking = rental.data?.bookings.find(item => item.id === bookingId); if (booking) setOverlay({ type: "detail", booking }); },
      onNewBooking: () => setOverlay({ type: "booking" }),
      // 헤더/갱신 탭은 앱이 어느 화면에 있든 오늘 일정으로 돌아가 실제로 다시 조회한다.
      onRefresh: () => { setSection("home"); setOverlay(null); void rental.refresh(); },
    }).then(cleanup => { if (cancelled) cleanup(); else dispose = cleanup; });
    return () => { cancelled = true; dispose?.(); };
  }, [rental.data, rental.refresh]);
  useEffect(() => {
    if (!rental.data || rental.data.ownerId !== ownerId) return;
    const needsOnboarding = !rental.data.onboardingCompleted;
    const back = () => {
      if (rental.busy) return;
      if (onboardingActive || needsOnboarding) {
        document.querySelector<HTMLButtonElement>(".workflow-wizard [data-page-back], .onboarding-nav-button:not(:disabled)")?.click();
        return;
      }
      const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
      if (dialog) { dialog.close(); return; }
      if ((overlay?.type === "run" || overlay?.type === "issue") && overlay.returnBookingId) {
        const booking = rental.data?.bookings.find(item => item.id === overlay.returnBookingId);
        setOverlay(booking ? {type:"detail",booking} : null);
      } else if (overlay?.type === "booking" && overlay.booking) setOverlay({type:"detail",booking:overlay.booking});
      else if (overlay) setOverlay(null);
      else if (section === "settings" && document.querySelector<HTMLButtonElement>(".page [data-page-back]")) document.querySelector<HTMLButtonElement>(".page [data-page-back]")!.click();
      else if (section !== "home") setSection("home");
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") back(); };
    window.addEventListener("keydown",key);
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    void NativeApp.addListener("backButton", back).then(listener => {
      if (disposed) void listener.remove(); else remove = () => listener.remove();
    });
    return () => { disposed = true; window.removeEventListener("keydown",key); void remove?.(); };
  }, [overlay, section, rental.data, rental.busy, onboardingActive]);
  if ((authConfigured && !authReady) || (rental.loading && !rental.data)) return <div className="splash"><span><img src="/brand-mark.png" width={42} height={42} alt="" /></span><strong>Rental Flow</strong></div>;
  if (authConfigured && !authUser) return <Login onSignedIn={setAuthUser} />;
  if (!rental.data) return <EmptyState error={rental.error} onRetry={rental.refresh} />;
  const data = rental.data;
  if (data.ownerId !== ownerId) return <div className="splash"><strong>Rental Flow</strong></div>;
  if (!data.termsAccepted || !data.privacyAccepted) return <ConsentGate busy={rental.busy} onAccept={rental.acceptPolicies} />;
  if (onboardingActive || !data.onboardingCompleted) return <Onboarding data={data} busy={rental.busy} finish={rental.finishOnboarding} onDone={() => { history.replaceState(null, "", "/"); setOnboardingActive(false); }} />;
  const userName = profileName || authUser?.name || t("common.admin");
  return <div className="app-frame"><aside className="side-nav" inert={Boolean(overlay)}><Brand /><Navigation active={section} onChange={setSection} /><div className="side-user"><CircleUserRound size={22} /><p><strong>{userName}</strong><small>{t("common.admin")}</small></p></div></aside><div className="app-main" inert={Boolean(overlay)}><header className="app-bar"><div><small>{data.workspaceName}</small><strong>{navItems().find(item => item.id === section)?.label}</strong></div><button className="icon-button" aria-label={t("common.alertsAria")} onClick={() => setSection("work")}><Bell size={21} />{data.issues.some(item => item.status === "open") && <i />}</button></header><main className="page">{rental.error && <div className="global-error">{tt(rental.error)}</div>}{section === "home" && <HomePage userName={userName} onCalendar={() => setSection("calendar")} onProduct={product => setOverlay({ type: "product", product })} data={data} onBooking={() => setOverlay({ type: "booking" })} onOpenBooking={booking => setOverlay({ type: "detail", booking })} onOpenIssue={issue => setOverlay({ type: "issue", issue })} onWork={() => setSection("work")} />}{section === "calendar" && <CalendarPage data={data} onBooking={booking => setOverlay({ type: "detail", booking })} onAdd={() => setOverlay({ type: "booking" })} />}{section === "work" && <WorkPage data={data} onRun={run => setOverlay({ type: "run", run })} onIssue={issue => setOverlay({ type: "issue", issue })} />}{section === "inventory" && <InventoryPage data={data} onProduct={product => setOverlay({ type: "product", product })} onAdd={() => setOverlay({ type: "product" })} onGroup={() => setOverlay({ type: "group" })} />}{section === "settings" && <ProductSettingsPage data={data} onSaveRegion={rental.saveRegion} onRefresh={rental.refresh} onExport={() => exportWorkspace(data)} onImport={async text => { await importWorkspace(text, ownerId); await rental.refresh(); }} signedIn={Boolean(authUser)} profileName={profileName} onSaveName={name => { writeName(name); setProfileName(name.trim()); }} onSignOut={async () => { await signOutUser(); setAuthUser(null); }} onDeleteAccount={async () => { await deleteAccount(); await deleteLocalData(data); await clearRentalWidget(); await cancelReminders(); setAuthUser(null); }} onDeleteData={async () => { await deleteLocalData(data); await clearRentalWidget(); await rental.refresh(); }} />}</main></div><nav className="bottom-nav" inert={Boolean(overlay)}><Navigation active={section} onChange={setSection} /></nav>{overlay?.type === "product" && <ProductEditorPro data={data} product={overlay.product} busy={rental.busy} onClose={() => setOverlay(null)} onSave={rental.putProduct} onDelete={rental.removeProduct} onGroup={() => setOverlay({ type: "group" })} />}{overlay?.type === "detail" && <BookingDetail data={data} booking={data.bookings.find(item => item.id === overlay.booking.id) || overlay.booking} busy={rental.busy} onClose={() => setOverlay(null)} onEdit={() => setOverlay({type:"booking",booking:data.bookings.find(item => item.id === overlay.booking.id) || overlay.booking})} onRun={run => setOverlay({type:"run",run,returnBookingId:overlay.booking.id})} onIssue={issue => setOverlay({type:"issue",issue,returnBookingId:overlay.booking.id})} onEvent={rental.rentalEvent} />}{overlay?.type === "booking" && <BookingEditor data={data} booking={overlay.booking} busy={rental.busy} onClose={() => setOverlay(overlay.booking ? {type:"detail",booking:data.bookings.find(item => item.id === overlay.booking!.id) || overlay.booking} : null)} onSave={rental.putBooking} onCancel={rental.cancelBooking} onEvent={rental.rentalEvent} />}{overlay?.type === "group" && <GroupEditor data={data} busy={rental.busy} onClose={() => setOverlay(null)} onSave={rental.addGroup} />}{overlay?.type === "run" && <WorkflowRuntime data={data} run={overlay.run} busy={rental.busy} onClose={() => { const booking = data.bookings.find(item => item.id === overlay.returnBookingId); setOverlay(booking ? {type:"detail",booking} : null); }} onItem={rental.completeItem} onComplete={rental.completeRun} />}{overlay?.type === "issue" && <IssueRuntime data={data} issue={overlay.issue} busy={rental.busy} onClose={() => { const booking = data.bookings.find(item => item.id === overlay.returnBookingId); setOverlay(booking ? {type:"detail",booking} : null); }} onResolve={rental.resolveIssue} />}</div>;
}

function Brand() { return <div className="brand"><span><img src="/brand-mark.png" width={36} height={36} alt="" /></span><strong>Rental Flow</strong></div>; }
function Navigation({ active, onChange }: { active: Section; onChange: (section: Section) => void }) { return <>{navItems().map(item => { const Icon = item.icon; return <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => onChange(item.id)}><Icon size={21} strokeWidth={active === item.id ? 2.4 : 1.8} /><span>{item.label}</span></button>; })}</>; }

type WorkFilter = "all" | "today" | "issue" | "log";
const workFilters: WorkFilter[] = ["all", "today", "issue", "log"];
const workFilterKeys = { all: "work.filter.all", today: "work.filter.today", issue: "work.filter.issue", log: "work.filter.log" } as const;

function WorkPage({ data, onRun, onIssue }: { data: RentalData; onRun: (run: StepRun) => void; onIssue: (issue: Issue) => void }) {
  const [filter, setFilter] = useState<WorkFilter>("all"), [query, setQuery] = useState("");
  const matches = (bookingId: string | undefined, text: string) => { const booking = data.bookings.find(item => item.id === bookingId); const product = data.products.find(item => item.id === booking?.productId); return [text, booking?.referenceCode, booking?.customerName, product?.name, product?.identifier].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()); };
  const available = data.stepRuns.filter(run => filter === "log" ? run.status === "completed" : isRunAvailable(run, data));
  const rows = available.filter(run => {
    const booking = data.bookings.find(item => item.id === run.bookingId);
    if (!booking || !matches(run.bookingId, run.stepSnapshot.name)) return false;
    if (filter === "issue") return data.issues.some(issue => issue.bookingId === run.bookingId && issue.status === "open");
    if (filter !== "today") return true;
    if (run.triggerType === "booking_confirmed") return true;
    if (run.triggerType === "rental_minus_2h") return isToday(booking.startAt);
    if (run.triggerType === "return_minus_2h") return isToday(booking.endAt);
    return false;
  });
  const issues = ["all", "issue"].includes(filter) ? data.issues.filter(issue => issue.status === "open" && matches(issue.bookingId, issue.type + " " + issue.note)) : [];
  const total = rows.length + issues.length;
  return <div className="page-stack"><section className="page-intro compact"><div><span>{t("work.subtitle")}</span><h1>{filter === "log" ? tp("work.completed", total) : tp("work.pending", total)}</h1></div></section><label className="work-search"><Search size={19}/><input type="search" aria-label={t("work.searchAria")} placeholder={t("work.searchPlaceholder")} value={query} onChange={event => setQuery(event.target.value)}/></label><div className="segmented">{workFilters.map(value => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{t(workFilterKeys[value])}</button>)}</div><section className="work-list">{issues.map(issue => { const product = data.products.find(item => item.id === issue.productId); const booking = data.bookings.find(item => item.id === issue.bookingId); return <button key={issue.id} onClick={() => onIssue(issue)}><span className="work-icon red"><AlertTriangle size={20} /></span><p><small>{booking?.referenceCode || t("work.itemIssue")} · {product?.name}</small><strong>{issue.type}</strong><em>{t("work.followUp")}</em></p><b>{t("work.open")}</b><ChevronRight size={18} /></button>; })}{rows.map(run => { const booking = data.bookings.find(item => item.id === run.bookingId)!; const product = data.products.find(item => item.id === booking.productId); const records = data.itemRecords.filter(item => item.stepRunId === run.id); const required = records.filter(item => item.itemSnapshot.required); const tracked = required.length ? required : records; const done = tracked.filter(item => item.status === "completed").length; return <button key={run.id} onClick={() => onRun(run)}><span className={`work-icon ${bookingTone(booking)}`}><ClipboardCheck size={20} /></span><p><small>{booking.referenceCode} · {product?.name}</small><strong>{run.stepSnapshot.name}</strong><em>{booking.customerName} · {triggerLabel(run.triggerType)}</em></p><b>{done}/{tracked.length}</b><ChevronRight size={18} /></button>; })}{!rows.length && !issues.length && <p className="empty-copy padded">{query ? t("work.noResults") : filter === "log" ? t("work.noCompleted") : t("work.noPending")}</p>}</section></div>;
}

function InventoryPage({ data, onProduct, onAdd, onGroup }: { data: RentalData; onProduct: (product: Product) => void; onAdd: () => void; onGroup: () => void }) { const [query, setQuery] = useState(""); const filtered = useMemo(() => data.products.filter(item => `${item.name}${item.identifier}${data.groups.find(group => group.id === item.groupId)?.name}`.toLowerCase().includes(query.toLowerCase())), [data, query]); return <div className="page-stack inventory-page"><section className="page-intro compact"><div><span>{t("inventory.subtitle")}</span><h1>{tp("inventory.count", data.products.length)}</h1></div></section><div className="inventory-actions"><button className="outline-command" onClick={onGroup}><Workflow size={17} />{t("inventory.manageGroups")}</button><button className="primary-command" onClick={onAdd}><Plus size={18} />{t("inventory.addItem")}</button></div><label className="search-field"><Search size={19} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("inventory.searchPlaceholder")} /></label><div className="inventory-summary"><span><b>{data.products.filter(item => item.status === "available").length}</b> {t("inventory.available")}</span><span><b>{data.products.filter(item => ["reserved", "rented"].includes(item.status)).length}</b> {t("inventory.operating")}</span><span><b>{data.products.filter(item => ["inspection", "unavailable"].includes(item.status)).length}</b> {t("inventory.needsCheck")}</span></div><section className="product-list">{filtered.length ? filtered.map(item => <button key={item.id} onClick={() => onProduct(item)}><span><CarFront size={21} /></span><p><small>{data.categories.find(category => category.id === data.groups.find(group => group.id === item.groupId)?.categoryId)?.name} · {data.groups.find(group => group.id === item.groupId)?.name}</small><strong>{item.name}</strong><em>{item.identifier || t("inventory.noIdentifier")}</em></p><b className={statusTone(item.status)}>{statusLabel(item.status)}</b><ChevronRight size={18} /></button>) : <p className="empty-copy padded">{t("inventory.noMatch")}</p>}</section></div>; }

function BookingEditor({ data, booking, busy, onClose, onSave, onCancel, onEvent }: { data: RentalData; booking?: Booking; busy: boolean; onClose: () => void; onSave: (draft: BookingDraft) => Promise<void>; onCancel: (id: string) => Promise<void>; onEvent: (id: string, event: "check_out" | "return_received") => Promise<void> }) { const start = booking?.startAt || new Date(Date.now() + 3600000).toISOString(), end = booking?.endAt || new Date(Date.now() + 90000000).toISOString(); const [draft, setDraft] = useState<BookingDraft>({ id: booking?.id, productId: booking?.productId || data.products[0]?.id || "", customerName: booking?.customerName || "", customerPhone: booking?.customerPhone || "", startAt: localInput(start), endAt: localInput(end), price: booking?.price, memo: booking?.memo || "", notificationsEnabled: booking?.notificationsEnabled ?? true }); const [error, setError] = useState(""); const submit = async () => { if (!draft.productId || !draft.customerName.trim() || !draft.startAt || !draft.endAt) { setError("errors.bookingForm"); return; } try { await onSave({ ...draft, startAt: booking && draft.startAt === localInput(booking.startAt) ? booking.startAt : toInstant(draft.startAt), endAt: booking && draft.endAt === localInput(booking.endAt) ? booking.endAt : toInstant(draft.endAt) }); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : ""); } }; return <Overlay busy={busy} title={booking ? booking.referenceCode : t("booking.new")} onClose={onClose} footer={<>{error && <p className="form-error left" role="alert">{tt(error)}</p>}<button className="form-primary" disabled={busy || booking?.rentalStatus === "cancelled"} onClick={submit}>{busy ? t("common.saving") : booking ? t("booking.saveChanges") : t("booking.add")}</button></>}><div className="form-stack">{booking && !["cancelled", "returned"].includes(booking.rentalStatus) && <button className="form-primary" disabled={busy || (booking.rentalStatus === "reserved" && !["approved", "not_required"].includes(booking.approvalStatus))} onClick={async () => { if (!confirm(booking.rentalStatus === "reserved" ? t("booking.confirmHandover") : t("booking.confirmCollect"))) return; try { await onEvent(booking.id, booking.rentalStatus === "reserved" ? "check_out" : "return_received"); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : ""); } }}>{booking.rentalStatus === "reserved" ? t("booking.handoverButton") : t("booking.collectButton")}</button>}{booking && <div className="booking-state"><span>{approvalLabel(booking.approvalStatus)}</span><strong>{rentalLabel(booking.rentalStatus)}</strong></div>}<div className="form-section-title"><strong>{t("booking.sectionRental")}</strong><small>{t("common.required")}</small></div><Field label={t("booking.item")}><select disabled={Boolean(booking && booking.rentalStatus !== "reserved")} value={draft.productId} onChange={event => setDraft({ ...draft, productId: event.target.value })}>{data.products.filter(item => item.status !== "unavailable" || item.id === booking?.productId).map(product => <option key={product.id} value={product.id}>{product.name} · {product.identifier || t("inventory.noIdentifier")}</option>)}</select></Field><div className="two-fields"><Field label={t("booking.start")}><input type="datetime-local" disabled={Boolean(booking && booking.rentalStatus !== "reserved")} value={draft.startAt} onChange={event => setDraft({ ...draft, startAt: event.target.value })} /></Field><Field label={t("booking.end")}><input type="datetime-local" disabled={booking?.rentalStatus === "returned" || booking?.rentalStatus === "cancelled"} value={draft.endAt} onChange={event => setDraft({ ...draft, endAt: event.target.value })} /></Field></div><div className="form-section-title"><strong>{t("booking.sectionCustomer")}</strong></div><Field label={t("booking.customerName")}><input value={draft.customerName} onChange={event => setDraft({ ...draft, customerName: event.target.value })} placeholder={t("booking.customerNamePlaceholder")} /></Field><Field label={t("booking.phone")}><input inputMode="tel" value={draft.customerPhone} onChange={event => setDraft({ ...draft, customerPhone: event.target.value })} placeholder={t("booking.phoneInternational")} /></Field><div className="form-section-title"><strong>{t("booking.sectionExtra")}</strong><small>{t("common.optional")}</small></div><p className="integration-hint">{t("region.timeZone")}: {data.timeZone}</p><Field label={t("booking.price")}><input type="number" min="0" inputMode="numeric" value={draft.price ?? ""} onChange={event => setDraft({ ...draft, price: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" /></Field><Field label={t("booking.memo")}><textarea value={draft.memo || ""} onChange={event => setDraft({ ...draft, memo: event.target.value })} placeholder={t("booking.memoPlaceholder")} rows={4} /></Field><label className="notification-choice"><input type="checkbox" checked={draft.notificationsEnabled} onChange={event => setDraft({ ...draft, notificationsEnabled: event.target.checked })} /><span><Bell size={18} /></span><p><strong>{t("booking.notify")}</strong><small>{t("booking.notifyHint")}</small></p></label>{booking && booking.rentalStatus === "reserved" && Date.now() < +new Date(booking.startAt) && <button className="danger-button" disabled={busy} onClick={async () => { if (!confirm(t("booking.confirmCancel"))) return; try { await onCancel(booking.id); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : ""); } }}><X size={17} />{t("booking.cancel")}</button>}</div></Overlay>; }

function GroupEditor({ data, busy, onClose, onSave }: { data: RentalData; busy: boolean; onClose: () => void; onSave: (categoryId: string | null, categoryName: string, groupName: string) => Promise<void> }) { const [newCategory, setNewCategory] = useState(false), [categoryId, setCategoryId] = useState(data.categories[0]?.id || ""), [categoryName, setCategoryName] = useState(""), [groupName, setGroupName] = useState(""), [error, setError] = useState(""); const submit = async () => { if ((!newCategory && !categoryId) || (newCategory && !categoryName.trim()) || !groupName.trim()) { setError("errors.groupForm"); return; } try { await onSave(newCategory ? null : categoryId, categoryName, groupName); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : ""); } }; return <Overlay busy={busy} title={t("group.addTitle")} onClose={onClose}><div className="form-stack"><div className="segmented two">{[false, true].map(value => <button key={String(value)} className={newCategory === value ? "active" : ""} onClick={() => setNewCategory(value)}>{value ? t("group.newCategory") : t("group.existingCategory")}</button>)}</div>{newCategory ? <Field label={t("group.categoryName")}><input value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder={t("group.categoryPlaceholder")} /></Field> : <Field label={t("group.category")}><select value={categoryId} onChange={event => setCategoryId(event.target.value)}>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>}<Field label={t("group.name")}><input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder={t("group.namePlaceholder")} /></Field><div className="info-note">{t("group.note")}</div>{error && <p className="form-error left">{tt(error)}</p>}<button className="form-primary" disabled={busy} onClick={submit}>{busy ? t("common.adding") : t("group.add")}</button></div></Overlay>; }

function IssueRuntime({ data, issue, busy, onClose, onResolve }: { data: RentalData; issue: Issue; busy: boolean; onClose: () => void; onResolve: (issue: Issue, note: string) => Promise<void> }) {
  const product = data.products.find(item => item.id === issue.productId);
  const booking = data.bookings.find(item => item.id === issue.bookingId);
  const [note, setNote] = useState(issue.note || "");
  const [error, setError] = useState("");
  const resolve = async () => { try { await onResolve(issue, note); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : ""); } };
  return <Overlay busy={busy} title={t("issue.title")} onClose={onClose}><div className="form-stack"><div className="runtime-head"><span>{t("issue.open")}</span><h2>{product?.name || t("common.unknownItem")}</h2><p>{booking ? `${booking.referenceCode} · ${booking.customerName}` : t("issue.noBooking")}</p></div><div className="info-note"><strong>{issue.type}</strong><br />{t("issue.note")}</div><Field label={t("issue.field")}><textarea value={note} onChange={event => setNote(event.target.value)} rows={5} placeholder={t("issue.placeholder")} /></Field>{error && <p className="form-error left">{tt(error)}</p>}<button className="form-primary" disabled={busy || !note.trim()} onClick={resolve}>{busy ? t("common.working") : t("issue.resolve")}</button></div></Overlay>;
}

function WorkflowRuntime({ data, run, busy, onClose, onItem, onComplete }: { data: RentalData; run: StepRun; busy: boolean; onClose: () => void; onItem: (id: string, value: unknown) => Promise<void>; onComplete: (id: string, outcome: WorkflowOutcome) => Promise<void> }) { const current = data.stepRuns.find(item => item.id === run.id) || run, booking = data.bookings.find(item => item.id === current.bookingId)!, product = data.products.find(item => item.id === booking.productId), records = data.itemRecords.filter(item => item.stepRunId === current.id).sort((a, b) => a.sortOrder - b.sortOrder); const required = records.filter(item => item.itemSnapshot.required); const tracked = required; const requiredDone = tracked.every(item => item.status === "completed"); const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(records.map(record => [record.id, typeof record.value === "string" || typeof record.value === "number" ? String(record.value) : ""]))), [error, setError] = useState(""); const perform = async (work: () => Promise<void>) => { try { await work(); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : ""); } }; return <Overlay busy={busy} title={current.stepSnapshot.name} onClose={onClose} wide><div className="runtime-head"><span>{triggerLabel(current.triggerType)}</span><h2>{product?.name}</h2><p>{booking.referenceCode} · {booking.customerName}</p></div><div className="runtime-progress"><span>{t("run.requiredTasks")}</span><strong>{tracked.filter(item => item.status === "completed").length}/{tracked.length}</strong></div><div className="checklist">{records.map(record => <div key={record.id} className={record.status === "completed" ? "done" : ""}><span className="check-index">{record.status === "completed" ? <Check size={18} /> : record.sortOrder + 1}</span><div><strong>{record.itemSnapshot.title}</strong><small>{record.itemSnapshot.required ? t("common.required") : t("common.optional")} · {recordLabel(record.itemSnapshot.completionType)}</small>{record.itemSnapshot.completionType === "check" && <button className="item-action" disabled={!isRunAvailable(current, data) || busy || record.status === "completed"} onClick={() => perform(() => onItem(record.id, true))}>{record.status === "completed" ? t("run.done") : t("run.check")}</button>}{["note", "number", "signature"].includes(record.itemSnapshot.completionType) && <div className="inline-input"><input disabled={!isRunAvailable(current, data) || busy} type={record.itemSnapshot.completionType === "number" ? "number" : "text"} value={values[record.id] || ""} onChange={event => setValues({ ...values, [record.id]: event.target.value })} placeholder={record.itemSnapshot.completionType === "signature" ? t("run.signatureName") : t("common.enterValue")} /><button disabled={!isRunAvailable(current, data) || busy || !values[record.id]?.trim()} onClick={() => perform(() => onItem(record.id, values[record.id]))}>{t("common.save")}</button></div>}{record.itemSnapshot.completionType === "select" && <div className="inline-input"><select value={values[record.id] || ""} disabled={!isRunAvailable(current, data) || busy} onChange={event => setValues({ ...values, [record.id]: event.target.value })}><option value="">{t("common.select")}</option>{((record.itemSnapshot.config.options as string[] | undefined) || []).map(option => <option key={option}>{option}</option>)}</select><button disabled={!isRunAvailable(current, data) || busy || !values[record.id]?.trim()} onClick={() => perform(() => onItem(record.id, values[record.id]))}>{t("common.save")}</button></div>}{record.itemSnapshot.completionType === "photo" && <LocalPhoto value={record.value} />}{record.itemSnapshot.completionType === "photo" && <label className="photo-action"><Camera size={16} />{record.status === "completed" ? t("run.replacePhoto") : t("run.takePhoto")}<input type="file" accept="image/*" capture="environment" disabled={!isRunAvailable(current, data) || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void perform(async () => onItem(record.id, { localMediaId: await saveLocalPhoto(file, data.workspaceId), name: file.name })); }} /></label>}</div></div>)}</div>{error && <p className="form-error left">{tt(error)}</p>}<div className="outcome-block"><span>{t("run.outcome")}</span>{current.stepSnapshot.outcomes.map(outcome => <button key={outcome.label} disabled={!isRunAvailable(current, data) || busy || (needsCompletedItems(outcome) && !requiredDone)} className={["cancel_booking", "create_issue"].includes(outcome.action) ? "warning-outcome" : ""} onClick={() => perform(async () => { await onComplete(current.id, outcome); onClose(); })}>{outcome.label}<ChevronRight size={17} /></button>)}</div></Overlay>; }

function Overlay({ title, onClose, wide, children, footer, busy }: { busy: boolean; title: string; onClose: () => void; wide?: boolean; children: ReactNode; footer?: ReactNode }) { return <div className="overlay-layer" role="dialog" aria-modal="true"><button className="overlay-scrim" aria-label={t("common.close")} disabled={busy} onClick={onClose} /><section className={`detail-sheet ${wide ? "wide" : ""}`}><header><button disabled={busy} onClick={onClose} aria-label={t("common.back")}><ChevronLeft size={22} /></button><strong>{title}</strong><button disabled={busy} onClick={onClose} aria-label={t("common.close")}><X size={22} /></button></header><div className="detail-content">{children}</div>{footer && <footer className="detail-footer">{footer}</footer>}</section></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
function EmptyState({ error, onRetry }: { error: string; onRetry: () => void }) { return <main className="empty-page"><AlertTriangle size={28} /><h1>{t("empty.title")}</h1><p>{tt(error)}</p><button onClick={onRetry}>{t("common.retry")}</button></main>; }

function bookingTone(booking: Booking) { if (booking.approvalStatus === "needs_supplement" || booking.rentalStatus === "returning") return "red"; return booking.rentalStatus === "checked_out" ? "green" : "blue"; }
function statusTone(status: ProductStatus) { return status === "available" ? "neutral" : status === "reserved" ? "blue" : status === "rented" ? "green" : "red"; }

function isToday(value: string) { return dayKey(value) === dayKey(); }
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}

function Login({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const login = async () => {
    setBusy(true); setError("");
    try {
      onSignedIn(await signInWithGoogle());
    } catch (caught) {
      const text =
        caught instanceof Error
          ? caught.message
          : typeof caught === "string"
            ? caught
            : caught && typeof caught === "object" && typeof (caught as { message?: unknown }).message === "string"
              ? (caught as { message: string }).message
              : "";
      if (text === "errors.googleCancelled" || text === "GOOGLE_CANCELLED") setError("");
      else if (text.startsWith("errors.")) setError(text);
      else setError("errors.googleFailed");
    } finally {
      setBusy(false);
    }
  };
  return <main className="login-page">
    <section className="login-panel">
      <section className="login-form">
        <div className="login-entry">
          <img src="/brand-mark.png" width={52} height={52} alt="" />
          <svg className="login-visual" viewBox="0 0 204 142" width={204} height={142} aria-hidden="true" focusable="false">
            <rect x=".5" y=".5" width="203" height="141" rx="16" fill="#FAFBF8" stroke="#DCE5DC" />
            <path d="M.5 28.5V16.5A16 16 0 0 1 16.5.5H187.5A16 16 0 0 1 203.5 16.5V28.5Z" fill="#123E32" />
            <path d="M.5 51H203.5M.5 73.5H203.5M.5 96H203.5M.5 118.5H203.5M29.5 28.5V141.5M58.5 28.5V141.5M87.5 28.5V141.5M116.5 28.5V141.5M145.5 28.5V141.5M174.5 28.5V141.5" fill="none" stroke="#DCE5DC" />
            <rect x="31.5" y="34.8" width="83" height="10" rx="5" fill="#123E32" />
            <rect x="118.5" y="57.2" width="83" height="10" rx="5" fill="#B7DD71" />
            <rect x="60.5" y="80.8" width="83" height="8" rx="5" fill="#EAF0E5" />
            <rect x="153" y="100.3" width="14" height="14" rx="4" fill="#123E32" />
            <text x="160" y="110.5" fill="#F5F3EC" fontSize="9" fontWeight="600" textAnchor="middle">16</text>
          </svg>
          <div className="login-copy">
            <h1>{t("login.headline")}</h1>
            <p>{t("login.copy")}</p>
          </div>
        </div>
        <div className="login-actions">
          <button className="google-button" disabled={busy} onClick={login}><b><GoogleMark /></b> {busy ? t("common.working") : t("login.google")}</button>
          {error && <small className="form-error" role="alert">{tt(error)}</small>}
        </div>
        <div className="login-consent">
          <small>{t("login.consentNote")}</small>
          <p className="login-links"><a href={policyHref("terms")}>{t("policy.terms")}</a><span aria-hidden="true">·</span><a href={policyHref("privacy")}>{t("policy.privacy")}</a></p>
        </div>
      </section>
    </section>
  </main>;
}

export default App;


function LocalPhoto({ value }: { value: unknown }) {
  const id = value && typeof value === "object" && "localMediaId" in value ? String(value.localMediaId) : "";
  const [url, setUrl] = useState("");
  const [missing, setMissing] = useState(false); const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = "";
    setUrl(""); setMissing(false);
    if (id) void readLocalPhoto(id).then(blob => {
      if (!active) return;
      if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } else setMissing(true);
    }).catch(() => { if (active) setMissing(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return url ? <>
    <button type="button" className="record-photo-button" onClick={() => setOpen(true)} aria-label={t("run.viewPhoto")}><img className="record-photo" src={url} alt={t("run.photoAlt")} /></button>
    {open && <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={t("run.photoDialog")}><button type="button" className="photo-viewer-scrim" aria-label={t("common.close")} onClick={() => setOpen(false)} /><img src={url} alt={t("run.photoAlt")} /><button type="button" className="photo-viewer-close" aria-label={t("common.close")} onClick={() => setOpen(false)}><X size={22} /></button></div>}
  </> : missing ? <small>{t("run.photoMissing")}</small> : null;
}
