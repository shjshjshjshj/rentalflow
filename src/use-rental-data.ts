import { useCallback, useEffect, useRef, useState } from "react";
import * as local from "./repository";
import { setTimeZone, deviceTimeZone } from "./region";

import type { BookingDraft, Issue, OnboardingSetup, ProductDraft, RentalData, WorkflowOutcome, WorkflowStep, WorkflowStepDraft } from "./model";

/**
 * 이 기기 하나의 워크스페이스를 읽고 쓴다. 서버가 없으므로 조작은 로컬 저장소를 통해서만 바뀌고,
 * 조작이 끝나면 저장된 값을 다시 읽어 화면 상태를 맞춘다.
 */
export function useRentalData(ownerId: string) {
  const [data, setData] = useState<RentalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const requestVersion = useRef(0);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const workspace = await local.loadRentalData(ownerId);
      if (version !== requestVersion.current) return;
      setTimeZone(workspace.timeZone ?? deviceTimeZone());
      setData(workspace);
      setError("");
    } catch (caught) {
      if (version === requestVersion.current) setError(message(caught));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { setData(null); void refresh(); return () => { requestVersion.current++; }; }, [refresh]);

  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) throw new Error("errors.busy");
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      await work();
      await refresh();
    } catch (caught) {
      const text = message(caught);
      setError(text);
      throw new Error(text);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return {
    data, loading, busy, error, refresh,
    saveRegion: (zone: string) => run(() => local.saveRegion(zone)),
    addGroup: (categoryId: string | null, categoryName: string, groupName: string, templateId = "custom") => run(() => local.addGroup(categoryId, categoryName, groupName, templateId)),
    putProduct: (draft: ProductDraft) => run(() => local.saveProduct(draft)),
    removeProduct: (productId: string) => run(() => local.deleteProduct(productId)),
    putWorkflowStep: (draft: WorkflowStepDraft) => run(() => local.saveWorkflowStep(draft)),
    removeWorkflowStep: (step: WorkflowStep) => run(() => local.deleteWorkflowStep(step)),
    putBooking: (draft: BookingDraft) => run(() => local.saveBooking(draft)),
    cancelBooking: (bookingId: string) => run(() => local.cancelBooking(bookingId)),
    rentalEvent: (bookingId: string, event: "check_out" | "return_received") => run(() => local.applyRentalEvent(bookingId, event)),
    completeItem: (recordId: string, value: unknown) => run(() => local.completeItem(recordId, value)),
    completeRun: (runId: string, outcome: WorkflowOutcome) => run(() => local.completeRun(runId, outcome)),
    resolveIssue: (issue: Issue, note: string) => run(() => local.resolveIssue(issue, note)),
    finishOnboarding: (setup: OnboardingSetup) => run(() => local.finishOnboardingSetup(setup)),
    acceptPolicies: () => run(() => local.acceptPolicies()),
  };
}

function message(error: unknown) {
  const text = error instanceof Error ? error.message : "errors.generic";
  return text;
}

