export async function saveLocalPhoto(file: File, workspaceId: string) {
  if (!file.type.startsWith("image/")) throw new Error("errors.imageOnly");
  if (file.size > 10 * 1024 * 1024) throw new Error("errors.photoTooLarge");
  const db = await openDatabase();
  const mediaId = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("photos", "readwrite");
    transaction.objectStore("photos").put({ id: mediaId, workspaceId, name: file.name, type: file.type, blob: file, createdAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  return mediaId;
}

export async function readLocalPhoto(id: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction("photos").objectStore("photos").get(id);
      request.onsuccess = () => resolve(request.result?.blob);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function deleteWorkspacePhotos(workspaceId: string, legacyIds: string[]) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      const cursor = tx.objectStore("photos").openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (item.value.workspaceId === workspaceId || legacyIds.includes(item.value.id)) item.delete();
        item.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rentalflow-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
