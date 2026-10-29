import assert from "node:assert/strict";
import { demoData } from "./demo-data.ts";
import { buildSnapshot, readSnapshot, SNAPSHOT_VERSION, upgradeWorkspace } from "./local-store.ts";

const workspace = structuredClone(demoData);

assert.deepEqual(readSnapshot(buildSnapshot(workspace)), upgradeWorkspace(workspace), "저장한 값을 새 필드와 함께 읽는다");
assert.equal(readSnapshot({ version: SNAPSHOT_VERSION + 1, workspace }), null, "모르는 버전은 거부한다");
assert.equal(readSnapshot({ version: SNAPSHOT_VERSION, workspace: { ...workspace, bookings: "x" } }), null, "목록이 깨지면 거부한다");
assert.equal(readSnapshot({ version: SNAPSHOT_VERSION, workspace: { ...workspace, workspaceId: "" } }), null, "사업장 id 가 없으면 거부한다");
assert.equal(readSnapshot({ version: SNAPSHOT_VERSION, workspace: { ...workspace, onboardingCompleted: undefined } }), null, "온보딩 상태가 없으면 거부한다");
assert.equal(readSnapshot(null), null, "값이 없으면 null");
assert.equal(readSnapshot("nope"), null, "객체가 아니면 null");

const snapshot = buildSnapshot(workspace);
assert.equal(typeof snapshot.savedAt, "string");
assert.ok(!Number.isNaN(Date.parse(snapshot.savedAt)), "저장 시각이 유효하다");

console.log("Local snapshot validation checks passed");
