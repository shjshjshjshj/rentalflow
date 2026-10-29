import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { t } from "./i18n";
import { buildSnapshot, clearWorkspace, readSnapshot } from "./local-store";
import { replaceWorkspace } from "./repository";
import { deleteWorkspacePhotos } from "./media-store";
import type { RentalData } from "./model";

/** 내보낸 파일은 저장 스냅샷과 같은 형식이라 가져오기가 그대로 되돌릴 수 있다. */
export async function exportWorkspace(data: RentalData) {
  const json = JSON.stringify(buildSnapshot(data), null, 2);
  const name = "rentalflow-" + new Date().toISOString().slice(0, 10) + ".json";
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({ path: name, directory: Directory.Cache, data: json, encoding: Encoding.UTF8 });
    await Share.share({ title: t("settings.export"), files: [file.uri], dialogTitle: t("settings.shareDialog") });
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 검증에 실패하면 기존 데이터를 건드리지 않는다. 백업이 백업을 망가뜨리면 안 된다. */
export async function importWorkspace(text: string, ownerId: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("errors.importInvalid");
  }
  const workspace = readSnapshot(parsed);
  if (!workspace) throw new Error("errors.importInvalid");
  await replaceWorkspace(workspace, ownerId);
}

/** 이 기기의 모든 것: 저장된 데이터와 그 사업장 사진. */
export async function deleteLocalData(data: RentalData) {
  const ids = data.itemRecords.flatMap(record => record.value && typeof record.value === "object" && "localMediaId" in record.value ? [String(record.value.localMediaId)] : []);
  try {
    await deleteWorkspacePhotos(data.workspaceId, ids);
  } finally {
    await clearWorkspace(data.ownerId);
  }
}

