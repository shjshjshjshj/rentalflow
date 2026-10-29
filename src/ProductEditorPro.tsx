import { ChevronLeft, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { Product, ProductDraft, ProductStatus, RentalData } from "./model";
import { statusLabel } from "./model";
import { t, tt } from "./i18n";

interface Props {
  data: RentalData;
  product?: Product;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ProductDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onGroup: () => void;
}

const statuses: ProductStatus[] = ["available", "reserved", "rented", "inspection", "unavailable"];

export default function ProductEditorPro({ data, product, busy, onClose, onSave, onDelete, onGroup }: Props) {
  const initialGroup = product?.groupId || data.groups[0]?.id || "";
  const [draft, setDraft] = useState<ProductDraft>({ id: product?.id, categoryId: data.groups.find(item => item.id === initialGroup)?.categoryId || "", groupId: initialGroup, name: product?.name || "", identifier: product?.identifier || "", status: product?.status || "available", fields: product?.fields || {} });
  const [error, setError] = useState("");
  const definitions = useMemo(() => data.fieldDefinitions.filter(item => item.groupId === draft.groupId).sort((a, b) => a.sortOrder - b.sortOrder), [data.fieldDefinitions, draft.groupId]);
  const submit = async () => {
    if (!draft.groupId || !draft.name.trim()) return setError("errors.productGroupName");
    const missing = definitions.find(item => item.required && !String(draft.fields?.[item.key] || "").trim());
    if (missing) return setError(`errors.productField|${missing.name}`);
    try { await onSave(draft); onClose(); } catch (caught) { setError((caught as Error).message); }
  };

  return <Sheet busy={busy} title={product ? t("product.detail") : t("product.add")} onClose={onClose}><div className="form-stack">
    <Field label={t("product.group")}><div className="field-with-action"><select value={draft.groupId} onChange={event => { const group = data.groups.find(item => item.id === event.target.value); setDraft({ ...draft, groupId: event.target.value, categoryId: group?.categoryId || "", fields: {} }); }}>{data.groups.map(group => <option key={group.id} value={group.id}>{data.categories.find(item => item.id === group.categoryId)?.name} / {group.name}</option>)}</select><button disabled={busy} onClick={onGroup} aria-label={t("product.addGroupAria")}><Plus size={17} /></button></div></Field>
    <Field label={t("product.name")}><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={t("product.namePlaceholder")} /></Field>
    <Field label={t("product.identifier")}><input value={draft.identifier} onChange={event => setDraft({ ...draft, identifier: event.target.value })} placeholder={t("product.identifierPlaceholder")} /></Field>
    {definitions.length > 0 && <div className="custom-field-divider"><span>{t("product.groupFields")}</span></div>}
    {definitions.map(field => <Field key={field.id} label={`${field.name}${field.required ? " *" : ""}`}>{field.type === "select" ? <select value={draft.fields?.[field.key] || ""} onChange={event => setDraft({ ...draft, fields: { ...draft.fields, [field.key]: event.target.value } })}><option value="">{t("common.select")}</option>{field.config.options?.map(option => <option key={option}>{option}</option>)}</select> : field.type === "boolean" ? <select value={draft.fields?.[field.key] || ""} onChange={event => setDraft({ ...draft, fields: { ...draft.fields, [field.key]: event.target.value } })}><option value="">{t("common.select")}</option><option value="true">{t("common.yes")}</option><option value="false">{t("common.no")}</option></select> : <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={draft.fields?.[field.key] || ""} onChange={event => setDraft({ ...draft, fields: { ...draft.fields, [field.key]: event.target.value } })} />}</Field>)}
    <Field label={t("product.operatingStatus")}><select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as ProductStatus })}>{statuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></Field>
    {error && <p className="form-error left">{tt(error)}</p>}
    <button className="form-primary" disabled={busy} onClick={submit}>{busy ? t("common.saving") : t("common.save")}</button>
    {product && <button className="danger-button" disabled={busy} onClick={async () => { if (!confirm(t("product.confirmDelete"))) return; try { await onDelete(product.id); onClose(); } catch (caught) { setError((caught as Error).message); } }}><Trash2 size={17} />{t("product.delete")}</button>}
  </div></Sheet>;
}

function Sheet({ title, onClose, children, busy }: { busy: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <div className="overlay-layer" role="dialog" aria-modal="true"><button className="overlay-scrim" aria-label={t("common.close")} disabled={busy} onClick={onClose} /><section className="detail-sheet"><header><button disabled={busy} onClick={onClose} aria-label={t("common.back")}><ChevronLeft size={22} /></button><strong>{title}</strong><button disabled={busy} onClick={onClose} aria-label={t("common.close")}><X size={22} /></button></header><div className="detail-content">{children}</div></section></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
