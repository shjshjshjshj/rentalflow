import { t } from "./i18n/index.ts";
import type { CompletionType, ProductFieldType, TriggerType, WorkflowOutcome, WorkflowStep } from "./model";

type ItemTemplate = { title: string; type: CompletionType; config?: Record<string, unknown> };
type StepTemplate = { trigger: TriggerType; name: string; items: ItemTemplate[]; outcomes: WorkflowOutcome[] };
export type IndustryTemplate = {
  id: "car" | "stay" | "bike" | "gear";
  label: string;
  description: string;
  category: string;
  groupExample: string;
  productExample: string;
  identifierExample: string;
  fields: Array<{ key: string; name: string; type: ProductFieldType; required: boolean; options?: string[] }>;
  steps: StepTemplate[];
};

// 업종 템플릿은 관리자가 지금 고른 언어로 만들어지고, 저장되는 순간부터는 사용자 데이터다.
// 그래서 모듈 로드 시점이 아니라 조회 시점에 사전을 읽는다.
export function industryTemplates(): IndustryTemplate[] {
  const approval: WorkflowOutcome[] = [
    { label: t("builder.outcome.approved"), action: "continue" },
    { label: t("builder.outcome.supplement"), action: "hold_booking" },
    { label: t("builder.outcome.rejected"), action: "cancel_booking" },
  ];
  const inspection: WorkflowOutcome[] = [
    { label: t("builder.outcome.normal"), action: "make_available" },
    { label: t("builder.outcome.issue"), action: "create_issue" },
  ];
  const complete: WorkflowOutcome[] = [{ label: t("builder.defaultOutcome"), action: "continue" }];
  return [
    {
      id: "car", label: t("template.car.label"), description: t("template.car.description"), category: t("template.car.category"), groupExample: t("template.car.groupExample"), productExample: t("template.car.productExample"), identifierExample: t("template.car.identifierExample"),
      fields: [
        { key: "powertrain", name: t("template.car.field.powertrain"), type: "select", required: true, options: [t("template.car.field.powertrain.option.gasoline"), t("template.car.field.powertrain.option.diesel"), t("template.car.field.powertrain.option.hybrid"), t("template.car.field.powertrain.option.electric")] },
        { key: "color", name: t("template.car.field.color"), type: "text", required: false },
        { key: "model_year", name: t("template.car.field.model_year"), type: "number", required: false },
      ],
      steps: [
        { trigger: "booking_confirmed", name: t("template.car.step.documents"), items: [{ title: t("template.car.item.driver"), type: "check" }, { title: t("template.car.item.licensePhoto"), type: "photo" }, { title: t("template.car.item.requests"), type: "note" }], outcomes: approval },
        { trigger: "rental_minus_2h", name: t("template.car.step.prepare"), items: [{ title: t("template.car.item.exteriorPhoto"), type: "photo" }, { title: t("template.car.item.mileage"), type: "number" }, { title: t("template.car.item.fuel"), type: "select", config: { options: [t("template.car.item.fuel.option.full"), t("template.car.item.fuel.option.threeQuarter"), t("template.car.item.fuel.option.half"), t("template.car.item.fuel.option.low")] } }], outcomes: complete },
        { trigger: "return_minus_2h", name: t("template.car.step.inspect"), items: [{ title: t("template.car.item.returnMileage"), type: "number" }, { title: t("template.car.item.returnPhoto"), type: "photo" }, { title: t("template.car.item.notes"), type: "note" }], outcomes: inspection },
      ],
    },
    {
      id: "stay", label: t("template.stay.label"), description: t("template.stay.description"), category: t("template.stay.category"), groupExample: t("template.stay.groupExample"), productExample: t("template.stay.productExample"), identifierExample: t("template.stay.identifierExample"),
      fields: [{ key: "capacity", name: t("template.stay.field.capacity"), type: "number", required: true }, { key: "floor", name: t("template.stay.field.floor"), type: "text", required: false }, { key: "room_type", name: t("template.stay.field.room_type"), type: "select", required: false, options: [t("template.stay.field.room_type.option.room"), t("template.stay.field.room_type.option.studio"), t("template.stay.field.room_type.option.meeting")] }],
      steps: [
        { trigger: "booking_confirmed", name: t("template.stay.step.confirm"), items: [{ title: t("template.stay.item.customer"), type: "check" }, { title: t("template.stay.item.payment"), type: "check" }, { title: t("template.stay.item.requests"), type: "note" }], outcomes: approval },
        { trigger: "rental_minus_2h", name: t("template.stay.step.checkin"), items: [{ title: t("template.stay.item.cleaning"), type: "photo" }, { title: t("template.stay.item.amenities"), type: "check" }, { title: t("template.stay.item.access"), type: "note" }], outcomes: complete },
        { trigger: "return_minus_2h", name: t("template.stay.step.checkout"), items: [{ title: t("template.stay.item.statePhoto"), type: "photo" }, { title: t("template.stay.item.lost"), type: "check" }, { title: t("template.stay.item.notes"), type: "note" }], outcomes: inspection },
      ],
    },
    {
      id: "bike", label: t("template.bike.label"), description: t("template.bike.description"), category: t("template.bike.category"), groupExample: t("template.bike.groupExample"), productExample: t("template.bike.productExample"), identifierExample: t("template.bike.identifierExample"),
      fields: [{ key: "engine_cc", name: t("template.bike.field.engine_cc"), type: "number", required: true }, { key: "color", name: t("template.bike.field.color"), type: "text", required: false }],
      steps: [
        { trigger: "booking_confirmed", name: t("template.bike.step.qualify"), items: [{ title: t("template.bike.item.licensePhoto"), type: "photo" }, { title: t("template.bike.item.consent"), type: "check" }, { title: t("template.bike.item.requests"), type: "note" }], outcomes: approval },
        { trigger: "rental_minus_2h", name: t("template.bike.step.prepare"), items: [{ title: t("template.bike.item.bodyPhoto"), type: "photo" }, { title: t("template.bike.item.mileage"), type: "number" }, { title: t("template.bike.item.gear"), type: "check" }], outcomes: complete },
        { trigger: "return_minus_2h", name: t("template.bike.step.inspect"), items: [{ title: t("template.bike.item.returnMileage"), type: "number" }, { title: t("template.bike.item.returnPhoto"), type: "photo" }, { title: t("template.bike.item.notes"), type: "note" }], outcomes: inspection },
      ],
    },
    {
      id: "gear", label: t("template.gear.label"), description: t("template.gear.description"), category: t("template.gear.category"), groupExample: t("template.gear.groupExample"), productExample: t("template.gear.productExample"), identifierExample: t("template.gear.identifierExample"),
      fields: [{ key: "manufacturer", name: t("template.gear.field.manufacturer"), type: "text", required: false }, { key: "model", name: t("template.gear.field.model"), type: "text", required: true }, { key: "components", name: t("template.gear.field.components"), type: "text", required: false }],
      steps: [
        { trigger: "booking_confirmed", name: t("template.gear.step.confirm"), items: [{ title: t("template.gear.item.purpose"), type: "note" }, { title: t("template.gear.item.payment"), type: "check" }], outcomes: approval },
        { trigger: "rental_minus_2h", name: t("template.gear.step.pickup"), items: [{ title: t("template.gear.item.components"), type: "check" }, { title: t("template.gear.item.operation"), type: "photo" }, { title: t("template.gear.item.packaging"), type: "check" }], outcomes: complete },
        { trigger: "return_minus_2h", name: t("template.gear.step.inspect"), items: [{ title: t("template.gear.item.compare"), type: "check" }, { title: t("template.gear.item.returnPhoto"), type: "photo" }, { title: t("template.gear.item.issues"), type: "note" }], outcomes: inspection },
      ],
    },
  ];
}

export function makeTemplateWorkflow(groupId: string, templateId: string): WorkflowStep[] {
  const list = industryTemplates();
  const template = list.find(item => item.id === templateId) || list[0];
  return template.steps.map((step, sortOrder) => {
    const stepId = crypto.randomUUID();
    return {
      id: stepId,
      groupId,
      triggerType: step.trigger,
      name: step.name,
      sortOrder,
      resultMode: step.outcomes.length > 1 ? "branch" : "simple",
      outcomes: structuredClone(step.outcomes),
      items: step.items.map((item, itemOrder) => ({ id: crypto.randomUUID(), stepId, title: item.title, completionType: item.type, required: item.type !== "note", config: item.config || {}, sortOrder: itemOrder })),
    };
  });
}
