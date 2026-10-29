import { Check, Camera, ListChecks, Hash, FileText } from "lucide-react";
import type { WorkflowStep } from "./model";
import { t } from "./i18n";

export default function TestItem({ item, value, onChange }: { item: WorkflowStep["items"][number]; value: string; onChange: (value: string) => void }) {
  if (item.completionType === "check") return <button className={value ? "checked" : ""} onClick={() => onChange(value ? "" : t("record.check"))}><i>{value && <Check size={16} />}</i><p><strong>{item.title}</strong><small>{item.required ? t("test.required") : t("common.optional")}</small></p></button>;
  if (item.completionType === "photo") return <label className="test-input-row"><i><Camera size={15}/></i><p><strong>{item.title}</strong><input aria-label={item.title} type="file" accept="image/*" onChange={event => onChange(event.target.files?.[0]?.name || "")}/><small>{value || t("onboarding.test.keepPhoto")}</small></p></label>;
  if (item.completionType === "select") return <label className="test-input-row"><i><ListChecks size={15} /></i><p><strong>{item.title}</strong><select value={value} onChange={event => onChange(event.target.value)}><option value="">{t("common.selectPlaceholder")}</option>{((item.config.options as string[] | undefined) || [t("test.defaultOption")]).map(option => <option key={option}>{option}</option>)}</select></p></label>;
  const Icon = item.completionType === "number" ? Hash : FileText;
  return <label className="test-input-row"><i><Icon size={15} /></i><p><strong>{item.title}</strong><input type={item.completionType === "number" ? "number" : "text"} value={value} onChange={event => onChange(event.target.value)} placeholder={item.completionType === "number" ? t("common.numberPlaceholder") : t("common.enterValue")} /></p></label>;
}
