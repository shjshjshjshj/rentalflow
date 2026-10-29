import TestItem from "./WorkflowTestItem";
import { needsCompletedItems } from "./domain";
import { useEffect, useMemo, useState } from "react";
import { isEnabled, setEnabled } from "./notifications";
import { Bell, Bike, Building2, CalendarDays, Camera, CarFront, Check, ChevronLeft, ChevronRight, CircleAlert, FileText, Hash, ListChecks, Package, Play, Plus, RotateCcw, Settings2, Trash2, Workflow } from "lucide-react";
import type { OnboardingSetup, RentalData, WorkflowOutcome, WorkflowStep, WorkflowStepDraft } from "./model";
import { recordLabel, triggerLabel } from "./model";
import { WorkflowBuilder } from "./ProductSettingsPage";
import { industryTemplates, makeTemplateWorkflow, type IndustryTemplate } from "./workflow-templates";
import { t, tp, tt } from "./i18n";

type Props = {
  data: RentalData;
  busy: boolean;
  finish: (setup: OnboardingSetup) => Promise<void>;
  onDone: () => void;
};

const icons = { car: CarFront, stay: Building2, bike: Bike, gear: Package };
const triggerOrder = ["booking_confirmed", "rental_minus_2h", "return_minus_2h", "manual"] as const;
const draftGroupId = "00000000-0000-4000-8000-000000000001";

export default function Onboarding({ data, busy, finish, onDone }: Props) {
  const modeStorageKey = `rentalflow-onboarding-mode:${data.workspaceId}`;
  const [step, setStep] = useState(0);
  const [notify, setNotify] = useState<"idle" | "enabled" | "skipped">(isEnabled() ? "enabled" : "idle");
  const [mode, setMode] = useState<"template" | "custom">(() => localStorage.getItem(modeStorageKey) === "custom" ? "custom" : "template");
  const [templateId, setTemplateId] = useState("car");
  const [categoryName, setCategoryName] = useState(() => t("template.car.category"));
  const [groupName, setGroupName] = useState("");
  const [productName, setProductName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [productFields, setProductFields] = useState<Record<string, string>>({});
  const [showProductDetails, setShowProductDetails] = useState(false);
  const [selectedProductFieldKeys, setSelectedProductFieldKeys] = useState<string[]>([]);
  const [extraProductFields, setExtraProductFields] = useState<Array<{ id: string; name: string; value: string }>>([]);
  const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
  const [workflowTemplate, setWorkflowTemplate] = useState("");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<WorkflowStep | "new" | null>(null);
  const [testing, setTesting] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testOutcome, setTestOutcome] = useState<WorkflowOutcome | null>(null);
  const [testFinished, setTestFinished] = useState(false);
  const templates = industryTemplates();
  const selectedTemplate = templates.find(item => item.id === templateId) || templates[0];
  const selectedTemplateFields = mode === "template" ? selectedTemplate.fields.filter(field => selectedProductFieldKeys.includes(field.key)) : [];
  const extraFieldDefinitions = extraProductFields.filter(field => field.name.trim()).map(field => ({ key: `custom_${field.id.replaceAll("-", "")}`, name: field.name.trim(), type: "text" as const, required: false }));
  const setupFields = showProductDetails ? [...selectedTemplateFields, ...extraFieldDefinitions] : [];
  const setupProductFields = showProductDetails ? { ...Object.fromEntries(selectedTemplateFields.map(field => [field.key, productFields[field.key] || ""])), ...Object.fromEntries(extraProductFields.filter(field => field.name.trim()).map(field => [`custom_${field.id.replaceAll("-", "")}`, field.value.trim()])) } : {};
  const testSteps = [...workflow].sort((a, b) => triggerOrder.indexOf(a.triggerType) - triggerOrder.indexOf(b.triggerType) || a.sortOrder - b.sortOrder);
  const currentTest = testSteps[testIndex];
  const totalSteps = mode === "custom" ? 5 : 6;
  const visibleStep = mode === "custom" && step >= 2 ? step : step + 1;

  const draftData = useMemo<RentalData>(() => ({
    ...data,
    categories: [{ id: "onboarding-category", name: categoryName || t("onboarding.group.previewCategory"), sortOrder: 0 }],
    groups: [{ id: draftGroupId, categoryId: "onboarding-category", name: groupName || t("onboarding.group.previewGroup"), approvalRequired: true, workflowVersion: 1, sortOrder: 0 }],
    products: [{ id: "onboarding-product", groupId: draftGroupId, name: productName || t("onboarding.product.fallbackName"), identifier, status: "available", fields: setupProductFields }],
    workflow,
  }), [categoryName, data, groupName, identifier, productName, setupProductFields, workflow]);

  useEffect(() => { window.scrollTo(0, 0); }, [step, testing]);
  useEffect(() => { localStorage.setItem(modeStorageKey, mode); }, [mode, modeStorageKey]);

  const protect = async (work: () => Promise<void>) => {
    setError("");
    try { await work(); } catch (caught) { setError(caught instanceof Error ? caught.message : "errors.onboardingSetup"); }
  };
  const goBack = () => setStep(current => current === 2 && mode === "custom" ? 0 : Math.max(0, current - 1));
  const resetTest = () => { setTestIndex(0); setTestValues({}); setTestOutcome(null); setTestFinished(false); };
  const restart = () => {
    setWorkflowTemplate("");
    setStep(0); setMode("template"); setTemplateId("car"); setCategoryName(t("template.car.category")); setGroupName(""); setProductName(""); setIdentifier(""); setProductFields({}); setShowProductDetails(false); setSelectedProductFieldKeys([]); setExtraProductFields([]); setWorkflow([]); setError(""); setEditor(null); setTesting(false); resetTest();
  };
  const next = () => {
    if (step === 0) return setStep(mode === "template" ? 1 : 2);
    if (step === 1) return setStep(2);
    if (step === 2) return setStep(3);
    if (step === 3) {
      if (mode === "template" && workflowTemplate !== templateId) {
        setWorkflow(makeTemplateWorkflow(draftGroupId, templateId));
        setWorkflowTemplate(templateId);
      }
      return setStep(4);
    }
    if (step === 4) return setStep(5);
    void protect(async () => {
      await finish({ industry: mode === "template" ? templateId : "custom", categoryName, groupName, productName, identifier, productFields: setupProductFields, workflow: workflow.map(toDraft), fields: setupFields });
      localStorage.removeItem(modeStorageKey);
      onDone();
    });
  };
  const saveDraftStep = async (draft: WorkflowStepDraft) => {
    const current = workflow.find(item => item.id === draft.id);
    const id = draft.id || crypto.randomUUID();
    const value: WorkflowStep = { ...draft, id, sortOrder: current?.sortOrder ?? workflow.filter(item => item.triggerType === draft.triggerType).length, items: draft.items.filter(item => item.title.trim()).map((item, index) => ({ ...item, id: item.id || crypto.randomUUID(), stepId: id, sortOrder: index })) };
    setWorkflow(rows => current ? rows.map(item => item.id === current.id ? value : item) : [...rows, value]);
  };
  const removeDraftStep = async (source: WorkflowStep) => setWorkflow(rows => rows.filter(item => item.id !== source.id));
  const addExtraProductField = () => setExtraProductFields(fields => [...fields, { id: crypto.randomUUID(), name: "", value: "" }]);
  const toggleProductField = (key: string) => setSelectedProductFieldKeys(keys => keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key]);
  const advanceTest = () => {
    setTestValues({}); setTestOutcome(null);
    if (testIndex < testSteps.length - 1) setTestIndex(value => value + 1);
    else setTestFinished(true);
  };
  const handleOutcome = (outcome: WorkflowOutcome) => outcome.action === "continue" ? advanceTest() : setTestOutcome(outcome);
  const missingRequiredProductField = showProductDetails && selectedTemplateFields.some(field => field.required && !productFields[field.key]?.trim());
  const incompleteExtraProductField = showProductDetails && extraProductFields.some(field => !field.name.trim() || !field.value.trim());
  const disabled = busy || (step === 2 && (!categoryName.trim() || !groupName.trim())) || (step === 3 && (!productName.trim() || missingRequiredProductField || incompleteExtraProductField)) || (step === 4 && !workflow.length);
  const actionLabel = step === 0 ? (mode === "template" ? t("onboarding.action.template") : t("onboarding.action.custom")) : step === 1 ? t("onboarding.action.industry") : step === 2 ? t("onboarding.action.group") : step === 3 ? t("onboarding.action.product") : step === 4 ? t("onboarding.action.flow") : t("onboarding.action.finish");

  if (editor) return <WorkflowBuilder data={draftData} groupId={draftGroupId} source={editor === "new" ? undefined : editor} onBack={() => setEditor(null)} onRestart={restart} onSave={saveDraftStep} onDelete={removeDraftStep} onSaved={async () => setEditor(null)} />;

  return <main className="onboarding-shell">
    <header className="onboarding-appbar">
      <button className="onboarding-nav-button" onClick={testing ? () => { setTesting(false); resetTest(); } : goBack} aria-label={t("onboarding.prevAria")} disabled={busy || (step === 0 && !testing)}><ChevronLeft size={22} /></button>
      <strong>{testing ? t("onboarding.testTitle") : t("onboarding.title")}</strong>
      <button className="onboarding-restart" onClick={restart} disabled={busy || step === 0}><RotateCcw size={15} /> {t("onboarding.restart")}</button>
    </header>
    <div className="onboarding-progress" aria-label={t("onboarding.progressAria", { current: visibleStep, total: totalSteps })}><i style={{ width: `${visibleStep / totalSteps * 100}%` }} /></div>
    <section className="onboarding-page">
      <div className="onboarding-step-count">{testing ? t("onboarding.practice") : `${visibleStep} / ${totalSteps}`}</div>
      {step === 0 && <><Title title={t("onboarding.start.title")} copy={t("onboarding.start.copy")} /><div className="choice-list"><button className={mode === "template" ? "selected" : ""} onClick={() => { setMode("template"); setCategoryName(selectedTemplate.category); }}><span><Workflow size={22} /></span><p><strong>{t("onboarding.start.template")}</strong><small>{t("onboarding.start.templateHint")}</small><em>{t("onboarding.start.templateBadge")}</em></p><Check size={20} /></button><button className={mode === "custom" ? "selected" : ""} onClick={() => { setMode("custom"); setWorkflowTemplate(""); setCategoryName(""); setProductFields({}); setShowProductDetails(false); setSelectedProductFieldKeys([]); setExtraProductFields([]); setWorkflow([]); }}><span><Settings2 size={22} /></span><p><strong>{t("onboarding.start.custom")}</strong><small>{t("onboarding.start.customHint")}</small><em>{t("onboarding.start.customBadge")}</em></p><Check size={20} /></button></div></>}
      {step === 1 && <><Title title={t("onboarding.industry.title")} copy={t("onboarding.industry.copy")} /><div className="template-grid">{templates.map(item => { const Icon = icons[item.id]; return <button key={item.id} className={templateId === item.id ? "selected" : ""} onClick={() => { setTemplateId(item.id); setCategoryName(item.category); setGroupName(""); setProductName(""); setIdentifier(""); setProductFields({}); setShowProductDetails(false); setSelectedProductFieldKeys([]); setExtraProductFields([]); }}><span><Icon size={22} /></span><p><strong>{item.label}</strong><small>{item.description}</small></p><Check size={18} /></button>; })}</div></>}
      {step === 2 && <><Title title={<>{t("onboarding.group.title1")}<br />{t("onboarding.group.title2")}</>} copy={t("onboarding.group.copy")} /><div className="onboarding-form"><label><span>{t("onboarding.group.category")}</span><input value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder={mode === "template" ? selectedTemplate.category : t("onboarding.group.categoryPlaceholder")} /><small>{t("onboarding.group.categoryHint")}</small></label><label><span>{t("onboarding.group.group")}</span><input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder={t("onboarding.group.groupPlaceholder", { value: mode === "template" ? selectedTemplate.groupExample : t("onboarding.group.groupExampleCustom") })} /><small>{t("onboarding.group.groupHint")}</small></label><div className="structure-preview"><small>{t("onboarding.group.preview")}</small><strong>{categoryName || t("onboarding.group.previewCategory")} <ChevronRight size={15} /> {groupName || t("onboarding.group.previewGroup")} <ChevronRight size={15} /> {t("onboarding.group.previewItem")}</strong></div></div>{error && <p className="onboarding-error">{tt(error)}</p>}</>}
      {step === 3 && <><Title title={<>{t("onboarding.product.title1")}<br />{t("onboarding.product.title2")}</>} copy={t("onboarding.product.copy")} /><div className="onboarding-context"><span>{groupName}</span> {t("onboarding.product.contextGroup")}</div><div className="onboarding-form compact"><label><span>{t("onboarding.product.name")}</span><input value={productName} onChange={event => setProductName(event.target.value)} placeholder={t("onboarding.product.namePlaceholder", { value: mode === "template" ? selectedTemplate.productExample : t("onboarding.product.nameExample") })} /></label><label><span>{t("onboarding.product.identifier")} <b>{t("common.optional")}</b></span><input value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder={t("onboarding.product.identifierPlaceholder", { value: mode === "template" ? selectedTemplate.identifierExample : t("onboarding.product.identifierExample") })} /><small>{t("onboarding.product.identifierHint")}</small></label><section className={`onboarding-detail-offer${showProductDetails ? " open" : ""}`}><header><p><strong>{t("onboarding.product.detailQuestion")}</strong><small>{showProductDetails ? t("onboarding.product.detailOpenCopy") : mode === "template" ? t("onboarding.product.detailTemplateCopy", { fields: selectedTemplate.fields.map(field => field.name).join(" · ") }) : t("onboarding.product.detailCustomCopy")}</small></p><button type="button" onClick={() => setShowProductDetails(value => !value)}>{showProductDetails ? t("onboarding.product.detailLater") : t("onboarding.product.detailNow")}</button></header>{showProductDetails && <div className="onboarding-product-details">{mode === "template" && <section className="onboarding-field-picker"><div>{selectedTemplate.fields.map(field => <div className="onboarding-detail-field" key={field.key}><label className="onboarding-field-toggle"><input type="checkbox" checked={selectedProductFieldKeys.includes(field.key)} onChange={() => toggleProductField(field.key)} /><span><b>{field.name}</b><small>{field.required ? t("onboarding.product.recommended") : t("common.optional")}</small></span></label>{selectedProductFieldKeys.includes(field.key) && <ProductFieldInput field={field} value={productFields[field.key] || ""} onChange={value => setProductFields(current => ({ ...current, [field.key]: value }))} />}</div>)}</div></section>}{!!extraProductFields.length && <div className="onboarding-extra-fields">{extraProductFields.map((field, index) => <div key={field.id}><label><span>{t("onboarding.product.extraName", { index: index + 1 })}</span><input autoFocus={index === extraProductFields.length - 1} value={field.name} onChange={event => setExtraProductFields(fields => fields.map(item => item.id === field.id ? { ...item, name: event.target.value } : item))} placeholder={t("onboarding.product.extraNamePlaceholder")} /></label><label><span>{t("onboarding.product.extraValue")}</span><input value={field.value} onChange={event => setExtraProductFields(fields => fields.map(item => item.id === field.id ? { ...item, value: event.target.value } : item))} placeholder={t("onboarding.product.extraValuePlaceholder")} /></label><button type="button" aria-label={t("onboarding.product.extraRemoveAria", { index: index + 1 })} onClick={() => setExtraProductFields(fields => fields.filter(item => item.id !== field.id))}><Trash2 size={17} /></button></div>)}</div>}<button type="button" className="onboarding-add-field" onClick={addExtraProductField}><Plus size={17} />{extraProductFields.length ? t("onboarding.product.extraAddOne") : t("onboarding.product.extraAdd")}</button></div>}</section></div></>}
      {step === 4 && (testing ? renderTest() : <><Title title={mode === "custom" ? <>{t("onboarding.flow.titleCustom1")}<br />{t("onboarding.flow.titleCustom2")}</> : <>{t("onboarding.flow.titleTemplate1")}<br />{t("onboarding.flow.titleTemplate2")}</>} copy={mode === "custom" ? t("onboarding.flow.copyCustom") : t("onboarding.flow.copyTemplate")} /><div className="onboarding-workflow-actions">{!!testSteps.length && <button onClick={() => { resetTest(); setTesting(true); }}><Play size={19} /><p><strong>{t("onboarding.flow.try")}</strong><small>{t("onboarding.flow.tryHint")}</small></p><ChevronRight size={18} /></button>}<button onClick={() => setEditor("new")}><Plus size={19} /><p><strong>{testSteps.length ? t("onboarding.flow.addStep") : t("onboarding.flow.firstStep")}</strong><small>{t("onboarding.flow.addStepHint")}</small></p><ChevronRight size={18} /></button></div>{testSteps.length ? <div className="onboarding-workflow-list">{testSteps.map((item, index) => <button key={item.id} onClick={() => setEditor(item)}><b>{index + 1}</b><p><small>{triggerLabel(item.triggerType)}</small><strong>{item.name}</strong><em>{item.items.map(entry => `${entry.title}(${recordLabel(entry.completionType)})`).join(" · ")}</em></p><ChevronRight size={18} /></button>)}</div> : <div className="onboarding-workflow-empty"><ListChecks size={24} /><strong>{t("onboarding.flow.empty")}</strong><small>{t("onboarding.flow.emptyHint")}</small></div>}<p className="onboarding-change-note">{t("onboarding.flow.draftNote")}</p></>)}
      {step === 5 && <><Title title={<>{t("onboarding.ready.title1")}<br />{t("onboarding.ready.title2")}</>} copy={t("onboarding.ready.copy")} /><div className="onboarding-ready-product"><small>{t("onboarding.ready.firstItem")}</small><strong>{categoryName} <ChevronRight size={14} /> {groupName}</strong><span>{productName}</span></div><section className="push-onboarding-card"><span><Bell size={22} /></span><p><strong>{t("onboarding.ready.pushTitle")}</strong><small>{t("onboarding.ready.pushHint")}</small></p>{notify === "enabled" ? <b><Check size={15} /> {t("onboarding.ready.pushOn")}</b> : <button onClick={() => void setEnabled(true, data).then(ok => setNotify(ok ? "enabled" : "skipped"))}>{notify === "skipped" ? t("onboarding.ready.pushRetry") : t("onboarding.ready.pushEnable")}</button>}</section>{notify === "skipped" && <p className="onboarding-change-note">{t("onboarding.ready.pushSkipped")}</p>}<div className="onboarding-benefits"><article><span><CalendarDays size={20} /></span><p><strong>{t("onboarding.ready.benefit1")}</strong><small>{t("onboarding.ready.benefit1Hint")}</small></p></article><article><span><ListChecks size={20} /></span><p><strong>{t("onboarding.ready.benefit2")}</strong><small>{tp("onboarding.ready.benefit2Hint", workflow.length)}</small></p></article><article><span><CircleAlert size={20} /></span><p><strong>{t("onboarding.ready.benefit3")}</strong><small>{t("onboarding.ready.benefit3Hint")}</small></p></article></div>{error && <p className="onboarding-error">{tt(error)}</p>}</>}
    </section>
    {!testing && <footer className="onboarding-floating-action"><button className="onboarding-primary" disabled={disabled} onClick={next}>{busy ? t("onboarding.saving") : actionLabel}{!busy && (step === 5 ? <Check size={19} /> : <ChevronRight size={19} />)}</button></footer>}
  </main>;

  function renderTest() {
    if (testFinished) return <section className="onboarding-test-finished"><span><Check size={28} /></span><h1>{t("onboarding.test.done1")}<br />{t("onboarding.test.done2")}</h1><p>{t("onboarding.test.doneCopy1")}<br />{t("onboarding.test.doneCopy2")}</p><button className="test-use" onClick={() => { setTesting(false); resetTest(); }}><Check size={17} />{t("onboarding.test.use")}</button><button onClick={resetTest}><RotateCcw size={17} />{t("onboarding.test.retry")}</button></section>;
    if (!currentTest) return null;
    if (testOutcome) {
      const result = outcomeCopy(testOutcome);
      return <section className={`onboarding-outcome-result ${result.tone}`}><span>{result.icon}</span><small>{t("onboarding.test.outcomeLabel", { label: testOutcome.label })}</small><h1>{result.title}</h1><p>{result.copy}</p><button onClick={testOutcome.action === "hold_booking" ? () => { setTestOutcome(null); setTestValues({}); } : testOutcome.action === "cancel_booking" || testOutcome.action === "create_issue" ? () => setTestFinished(true) : advanceTest}>{testOutcome.action === "hold_booking" ? t("onboarding.test.recheck") : testOutcome.action === "cancel_booking" || testOutcome.action === "create_issue" ? t("onboarding.test.seeResult") : t("onboarding.test.nextStep")}<ChevronRight size={18} /></button></section>;
    }
    const requiredDone = currentTest.items.every(item => !item.required || Boolean(testValues[item.id]));
    return <><Title title={currentTest.name} copy={t("onboarding.test.screenCopy", { trigger: triggerLabel(currentTest.triggerType) })} /><section className="onboarding-test-card"><header><span>{testIndex + 1} / {testSteps.length}</span><strong>{productName || t("onboarding.test.productFallback")}</strong></header><div>{currentTest.items.map(item => <TestItem key={item.id} item={item} value={testValues[item.id] || ""} onChange={value => setTestValues(current => ({ ...current, [item.id]: value }))} />)}</div><footer><small>{t("onboarding.test.chooseOutcome")}</small>{currentTest.outcomes.map(outcome => <button className={["cancel_booking", "create_issue"].includes(outcome.action) ? "warning" : ""} key={outcome.label} disabled={needsCompletedItems(outcome) && !requiredDone} onClick={() => handleOutcome(outcome)}>{outcome.label}<ChevronRight size={17} /></button>)}</footer></section></>;
  }
}

function Title({ title, copy }: { title: React.ReactNode; copy: string }) { return <div className="onboarding-title"><h1>{title}</h1><p>{copy}</p></div>; }
function ProductFieldInput({ field, value, onChange }: { field: IndustryTemplate["fields"][number]; value: string; onChange: (value: string) => void }) {
  const label = <span>{field.name}{!field.required && <b>{t("common.optional")}</b>}</span>;
  if (field.type === "select") return <label>{label}<select value={value} onChange={event => onChange(event.target.value)}><option value="">{t("common.selectPlaceholder")}</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
  if (field.type === "boolean") return <label className="onboarding-check-field"><input type="checkbox" checked={value === "true"} onChange={event => onChange(String(event.target.checked))} />{label}</label>;
  return <label>{label}<input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} inputMode={field.type === "number" ? "numeric" : undefined} value={value} onChange={event => onChange(event.target.value)} placeholder={field.type === "number" ? t("common.numberPlaceholder") : t("onboarding.product.fieldInputPlaceholder", { name: field.name })} /></label>;
}
function toDraft(step: WorkflowStep): WorkflowStepDraft { return { id: step.id, groupId: step.groupId, triggerType: step.triggerType, name: step.name, resultMode: step.resultMode, outcomes: step.outcomes, items: step.items.map(item => ({ id: item.id, title: item.title, completionType: item.completionType, required: item.required, config: item.config })) }; }
function outcomeCopy(outcome: WorkflowOutcome) {
  if (outcome.action === "hold_booking") return { tone: "hold", icon: <FileText size={27} />, title: t("onboarding.outcome.holdTitle"), copy: t("onboarding.outcome.holdCopy") };
  if (outcome.action === "cancel_booking") return { tone: "cancel", icon: <CircleAlert size={27} />, title: t("onboarding.outcome.cancelTitle"), copy: t("onboarding.outcome.cancelCopy") };
  if (outcome.action === "create_issue") return { tone: "issue", icon: <CircleAlert size={27} />, title: t("onboarding.outcome.issueTitle"), copy: t("onboarding.outcome.issueCopy") };
  return { tone: "success", icon: <Check size={27} />, title: t("onboarding.outcome.successTitle"), copy: t("onboarding.outcome.successCopy") };
}
