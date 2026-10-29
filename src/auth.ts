import { Capacitor, registerPlugin } from "@capacitor/core";

// Android only. 네이티브 계정 선택기에서 받은 Google ID 토큰을 Firebase 세션으로 바꾼다.
const GoogleAuth = registerPlugin<{ signIn(options: { serverClientId: string }): Promise<{ idToken: string }> }>("GoogleAuth");

export type AuthUser = { id: string; name: string; email: string };

// Vite 밖(Node 테스트)에서는 import.meta.env 가 없으므로 안전하게 읽는다.
const apiKey = (import.meta as { env?: Record<string, string> }).env?.VITE_FIREBASE_API_KEY;
const googleWebClientId = (import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_WEB_CLIENT_ID;
const storageKey = "rentalflow-auth";

/** 설정이 없으면 로그인 없이 기기 전용으로 동작한다(개발 중이거나 콘솔 설정 전). */
export const authConfigured = Boolean(apiKey);

type Session = { refreshToken: string; idToken: string; expiresAt: number; user: AuthUser };

/** JWT 본문만 읽는다. 신원의 근거는 Firebase 응답이고, 여기서는 표시할 이름만 꺼낸다. */
export function decodeIdToken(idToken: string): { sub?: string; name?: string; email?: string } {
  const payload = idToken.split(".")[1];
  if (!payload) return {};
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

export function isExpired(session: { expiresAt: number }, now = Date.now()): boolean {
  return session.expiresAt <= now;
}

function readSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(storageKey, JSON.stringify(session));
    else localStorage.removeItem(storageKey);
  } catch {
    /* 저장하지 못해도 이번 실행에는 적용한다. */
  }
}

function userFrom(idToken: string, fallbackId: string): AuthUser {
  const claims = decodeIdToken(idToken);
  const email = claims.email || "";
  return { id: claims.sub || fallbackId, name: (claims.name || "").trim() || email.split("@")[0] || "", email };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message || "errors.loginFailed");
  return payload as T;
}

type SignInResponse = { idToken: string; refreshToken: string; expiresIn: string; localId: string };
type RefreshResponse = { id_token: string; refresh_token: string; expires_in: string; user_id: string };

/** 만료된 세션을 새 토큰으로 바꾼다. 실패하면 세션을 비우고 null. */
async function refreshSession(session: Session): Promise<Session | null> {
  try {
    const result = await post<RefreshResponse>("https://securetoken.googleapis.com/v1/token?key=" + apiKey, { grant_type: "refresh_token", refresh_token: session.refreshToken });
    const next: Session = { refreshToken: result.refresh_token, idToken: result.id_token, expiresAt: Date.now() + Number(result.expires_in) * 1000, user: userFrom(result.id_token, result.user_id) };
    writeSession(next);
    return next;
  } catch {
    writeSession(null);
    return null;
  }
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (!apiKey || !googleWebClientId) throw new Error("errors.loginUnavailable");
  const { idToken } = await GoogleAuth.signIn({ serverClientId: googleWebClientId });
  // OAuth 제공업체 토큰은 signInWithIdp 로 교환한다. postBody 는 폼 인코딩 문자열이다.
  const result = await post<SignInResponse>("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + apiKey, { postBody: "id_token=" + encodeURIComponent(idToken) + "&providerId=google.com", requestUri: "http://localhost", returnSecureToken: true });
  const user = userFrom(result.idToken, result.localId);
  writeSession({ refreshToken: result.refreshToken, idToken: result.idToken, expiresAt: Date.now() + Number(result.expiresIn) * 1000, user });
  return user;
}

/** 저장된 세션으로 로그인 상태를 되살린다. 만료됐으면 토큰을 갱신하고, 실패하면 로그아웃 상태로 둔다. */
export async function restoreUser(): Promise<AuthUser | null> {
  if (!apiKey) return null;
  const session = readSession();
  if (!session?.refreshToken) return null;
  if (!isExpired(session)) return session.user;
  const refreshed = await refreshSession(session);
  return refreshed ? refreshed.user : null;
}

export async function signOut() {
  writeSession(null);
}

/**
 * 로그인 계정 자체를 지운다. Play 는 계정을 만드는 앱에 삭제 수단을 요구한다.
 * 기기에 저장한 사업장 자료는 여기서 지우지 않고, 화면에서 함께 지운다.
 */
export async function deleteAccount() {
  if (!apiKey) throw new Error("errors.loginUnavailable");
  let session = readSession();
  if (!session?.refreshToken) throw new Error("errors.relogin");
  if (isExpired(session)) {
    session = await refreshSession(session);
    if (!session) throw new Error("errors.relogin");
  }
  await post("https://identitytoolkit.googleapis.com/v1/accounts:delete?key=" + apiKey, { idToken: session.idToken });
  writeSession(null);
}
