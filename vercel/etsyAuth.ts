import crypto from "node:crypto";

const ETSY_API_BASE = "https://api.etsy.com/v3";
export const ETSY_AUTH_COOKIE = "sg_etsy_auth";
export const ETSY_OAUTH_COOKIE = "sg_etsy_oauth";

export interface EtsyAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  shopId: number;
  shopName: string;
}

interface EtsyConfig {
  key: string;
  secret: string;
  redirectUri: string;
  sessionSecret: string;
}

export function getEtsyConfig(): EtsyConfig {
  return {
    key: process.env.ETSY_API_KEY || "",
    secret: process.env.ETSY_SHARED_SECRET || "",
    redirectUri: process.env.ETSY_REDIRECT_URI || "",
    sessionSecret: process.env.SESSION_SECRET || "",
  };
}

export function isEtsyConfigured(): boolean {
  const config = getEtsyConfig();
  return Boolean(config.key && config.secret && config.redirectUri && config.sessionSecret);
}

function encryptionKey(): Buffer {
  const secret = getEtsyConfig().sessionSecret;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

export function sealCookie(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function unsealCookie<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const [ivPart, tagPart, dataPart] = value.split(".");
    if (!ivPart || !tagPart || !dataPart) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const entry of cookieHeader.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function sessionCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export async function parseEtsyResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    body = { error: text || `Etsy request failed (${response.status}).` };
  }
  if (!response.ok) {
    throw new Error(String(body.error || body.message || `Etsy request failed (${response.status}).`));
  }
  return body as T;
}

export function etsyApiHeaders(accessToken?: string): Headers {
  const config = getEtsyConfig();
  const headers = new Headers({ "x-api-key": `${config.key}:${config.secret}` });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

export async function refreshEtsySession(auth: EtsyAuthSession): Promise<{ auth: EtsyAuthSession; refreshed: boolean }> {
  if (auth.expiresAt > Date.now() + 60_000) return { auth, refreshed: false };

  const config = getEtsyConfig();
  const token = await parseEtsyResponse<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>(await fetch(`${ETSY_API_BASE}/public/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.key,
      refresh_token: auth.refreshToken,
    }),
  }));

  return {
    refreshed: true,
    auth: {
      ...auth,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    },
  };
}

export async function requireEtsySession(request: Request): Promise<{ auth: EtsyAuthSession; setCookie?: string }> {
  if (!isEtsyConfigured()) throw new Error("Etsy API settings are missing in Vercel Environment Variables.");
  const stored = unsealCookie<EtsyAuthSession>(readCookie(request, ETSY_AUTH_COOKIE));
  if (!stored) throw new Error("Connect your Etsy shop first.");
  const current = await refreshEtsySession(stored);
  return {
    auth: current.auth,
    setCookie: current.refreshed
      ? sessionCookie(ETSY_AUTH_COOKIE, sealCookie(current.auth), 90 * 24 * 60 * 60)
      : undefined,
  };
}

export async function etsyRequest<T>(auth: EtsyAuthSession, endpoint: string, init: RequestInit = {}): Promise<T> {
  const headers = etsyApiHeaders(auth.accessToken);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return parseEtsyResponse<T>(await fetch(`${ETSY_API_BASE}/application${endpoint}`, {
    ...init,
    headers,
  }));
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  const status = message.includes("Connect your Etsy") ? 401 : 400;
  return jsonResponse({ error: message }, status);
}

export function dataUrlToFile(dataUrl: string, fallbackName: string): { blob: Blob; name: string; mime: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error(`Invalid generated file: ${fallbackName}`);
  const mime = match[1];
  const extension = mime.includes("png") ? "png" : mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";
  return {
    blob: new Blob([Buffer.from(match[2], "base64")], { type: mime }),
    name: `${fallbackName}.${extension}`,
    mime,
  };
}
