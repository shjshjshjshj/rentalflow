const storageKey = "rentalflow-name";

/** 사용자가 직접 넣은 이름. 비어 있으면 계정 이름이나 기본값을 쓴다. */
export function readName(): string {
  try {
    return localStorage.getItem(storageKey)?.trim() || "";
  } catch {
    return "";
  }
}

export function writeName(name: string) {
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(storageKey, trimmed);
    else localStorage.removeItem(storageKey);
  } catch {
    /* 저장하지 못하면 이번 실행에만 적용된다. */
  }
}

