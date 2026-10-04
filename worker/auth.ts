// Autenticação simples por senha única (segredo APP_PASSWORD) com cookie assinado via HMAC.
// Trocar a senha invalida automaticamente todas as sessões.

const COOKIE = "afz_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const enc = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(`afazeres:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function passwordMatches(input: string, expected: string) {
  // Compara os digests para ter tempo constante independente do tamanho.
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function createSessionCookie(secret: string, secure: boolean) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(String(exp)));
  const value = `${exp}.${toHex(sig)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function isAuthenticated(cookieHeader: string | null, secret: string) {
  if (!cookieHeader) return false;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return false;
  const [expStr, sig] = match.slice(COOKIE.length + 1).split(".");
  const exp = Number(expStr);
  if (!exp || !sig || !/^[0-9a-f]{64}$/.test(sig) || exp < Date.now() / 1000) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), fromHex(sig), enc.encode(String(exp)));
}

export async function sha256Hex(input: string) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}

/** Compara duas strings hex de mesmo tamanho em tempo constante. */
export function hexEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
