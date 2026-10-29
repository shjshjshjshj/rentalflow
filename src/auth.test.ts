import assert from "node:assert/strict";
import { decodeIdToken, isExpired } from "./auth.ts";

const payload = Buffer.from(JSON.stringify({ sub: "u1", email: "a@b.c", name: "서호준" }), "utf8").toString("base64url");
const token = "header." + payload + ".signature";

assert.deepEqual(decodeIdToken(token), { sub: "u1", email: "a@b.c", name: "서호준" }, "ID 토큰 본문을 읽는다");
assert.deepEqual(decodeIdToken("broken"), {}, "형식이 아니면 빈 값");
assert.deepEqual(decodeIdToken(""), {}, "빈 값도 빈 객체");

assert.equal(isExpired({ expiresAt: 1000 }, 2000), true, "지난 토큰은 만료");
assert.equal(isExpired({ expiresAt: 3000 }, 2000), false, "남은 토큰은 유효");
assert.equal(isExpired({ expiresAt: 1000 }, 1000), true, "경계값은 만료로 본다");

console.log("Auth token checks passed");

