import type { RentalData } from "./model";
import { canonicalTimeZone, deviceTimeZone, validTimeZone } from "./region.ts";


// 이 기기 안에서도 사업장은 계정에 귀속된다. 저장 키를 계정별로 나눠 다른 계정의 자료가 섞이지 않게 한다.
const DATABASE = "rentalflow";
const STORE = "workspace";
const LEGACY_KEY = "current";

export const SNAPSHOT_VERSION = 2;

const listFields = ["categories", "groups", "fieldDefinitions", "products", "workflow", "bookings", "stepRuns", "itemRecords", "issues"] as const;

type Snapshot = { version: number; savedAt: string; workspace: RentalData };

/** 계정 하나에 워크스페이스 하나. 로그인 설정이 없는 개발 빌드는 local 로 묶는다. */
function keyFor(ownerId: string) {
  return "owner:" + (ownerId || "local");
}

/**
 * 저장된 값을 검증해 쓸 수 있는 워크스페이스로 돌려준다.
 * 로컬 저장소는 신뢰 경계 안쪽이지만 손상된 값이나 가져온 파일이 들어올 수 있으므로 형태를 확인한다.
 */
export function readSnapshot(raw: unknown): RentalData | null {
  if (!raw || typeof raw !== "object") return null;
  const snapshot = raw as { version?: unknown; workspace?: unknown };
  if (snapshot.version !== 1 && snapshot.version !== SNAPSHOT_VERSION) return null;
  if (!snapshot.workspace || typeof snapshot.workspace !== "object") return null;
  const workspace = snapshot.workspace as Partial<RentalData>;
  if (typeof workspace.workspaceId !== "string" || !workspace.workspaceId) return null;
  if (typeof workspace.workspaceName !== "string") return null;
  if (typeof workspace.onboardingCompleted !== "boolean") return null;
  // 계정 구분 없이 저장하던 값도 읽을 수 있게 비어 있는 것은 허용한다.
  if (workspace.ownerId !== undefined && typeof workspace.ownerId !== "string") return null;
  if (listFields.some(field => !Array.isArray(workspace[field]))) return null;
  for (const field of listFields) {
    const rows = workspace[field]!;
    if (rows.some(row => !row || typeof row !== "object" || typeof row.id !== "string" || !row.id) || new Set(rows.map(row => row.id)).size !== rows.length) return null;
  }
  const next = snapshot.version === 1 ? upgradeWorkspace(workspace as RentalData) : workspace as RentalData;
  if (!validTimeZone(next.timeZone)) return null;
  try {
    const ids = new Set<string>();
    for (const booking of next.bookings) {
      if (!booking || typeof booking.id !== "string" || !booking.id || ids.has(booking.id)) return null;
      if (![booking.startAt, booking.endAt].every(value => typeof value === "string" && Number.isFinite(Date.parse(value))) || Date.parse(booking.endAt) <= Date.parse(booking.startAt)) return null;
      if (booking.price !== undefined && (typeof booking.price !== "number" || !Number.isFinite(booking.price) || booking.price < 0)) return null;
      if (![booking.customerName, booking.customerPhone, booking.referenceCode, booking.productId].every(value => typeof value === "string") || !Array.isArray(booking.workflowSnapshot)) return null;
      if (!["reserved", "checked_out", "returning", "returned", "cancelled"].includes(booking.rentalStatus) || !["not_required", "pending", "needs_supplement", "approved", "rejected"].includes(booking.approvalStatus)) return null;
      ids.add(booking.id);
    }
  } catch { return null; }
  return { ...next, ownerId: workspace.ownerId || "", timeZone: canonicalTimeZone(next.timeZone) };
}

export function upgradeWorkspace(workspace: RentalData): RentalData {
  return { ...workspace, ownerId: workspace.ownerId || "", timeZone: workspace.timeZone ?? deviceTimeZone() };
}

export function buildSnapshot(workspace: RentalData): Snapshot {
  const snapshot = { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), workspace: upgradeWorkspace(workspace) };
  if (!readSnapshot(snapshot)) throw new Error("errors.importInvalid");
  return snapshot;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function read(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function write(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    run(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** 로그인한 계정의 워크스페이스를 읽는다. 없으면 계정 구분 없이 저장하던 값을 한 번만 넘겨받는다. */
export async function loadWorkspace(ownerId: string): Promise<RentalData | null> {
  const db = await openDatabase();
  try {
    const raw = await read(db, keyFor(ownerId));
    const stored = readSnapshot(raw);
    if (raw !== undefined && !stored) throw new Error("errors.storedData");
    if (stored) return { ...stored, ownerId };
    const rawLegacy = await read(db, LEGACY_KEY);
    const legacy = readSnapshot(rawLegacy);
    if (rawLegacy !== undefined && !legacy) throw new Error("errors.storedData");
    if (!legacy) return null;
    const claimed: RentalData = { ...legacy, ownerId };
    await write(db, store => { store.put(buildSnapshot(claimed), keyFor(ownerId)); store.delete(LEGACY_KEY); });
    return claimed;
  } finally {
    db.close();
  }
}

export async function saveWorkspace(workspace: RentalData): Promise<void> {
  const db = await openDatabase();
  try {
    await write(db, store => store.put(buildSnapshot(workspace), keyFor(workspace.ownerId)));
  } finally {
    db.close();
  }
}

export async function clearWorkspace(ownerId: string): Promise<void> {
  const db = await openDatabase();
  try {
    await write(db, store => store.delete(keyFor(ownerId)));
  } finally {
    db.close();
  }
}

