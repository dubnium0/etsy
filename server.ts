import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { config as loadEnv } from "dotenv";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(rootDir, ".env.local") });
loadEnv({ path: path.join(rootDir, ".env") });

const app = express();
const port = Number(process.env.PORT || 3000);
const authFile = path.join(rootDir, ".etsy-auth.json");
const apiBase = "https://api.etsy.com/v3";
const oauthStates = new Map<string, { verifier: string; sessionId: string; createdAt: number }>();

interface EtsyAuthRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  shopId: number;
  shopName: string;
  sessionId: string;
}

interface EtsyTaxonomyNode {
  id: number;
  name: string;
  children?: EtsyTaxonomyNode[];
}

let taxonomyCache: Array<{ id: number; name: string; path: string }> | null = null;

app.use(express.json({ limit: "150mb" }));

function getConfig() {
  return {
    key: process.env.ETSY_API_KEY || "",
    secret: process.env.ETSY_SHARED_SECRET || "",
    redirectUri: process.env.ETSY_REDIRECT_URI || "",
  };
}

function isConfigured(): boolean {
  const value = getConfig();
  return Boolean(value.key && value.secret && value.redirectUri);
}

function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.cookie || "";
  return Object.fromEntries(cookieHeader.split(";").map((entry) => {
    const [key, ...value] = entry.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }).filter(([key]) => key));
}

async function readAuth(): Promise<EtsyAuthRecord | null> {
  try {
    return JSON.parse(await fs.readFile(authFile, "utf8")) as EtsyAuthRecord;
  } catch {
    return null;
  }
}

async function writeAuth(auth: EtsyAuthRecord): Promise<void> {
  await fs.writeFile(authFile, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

function apiKeyHeader(): string {
  const { key, secret } = getConfig();
  return `${key}:${secret}`;
}

function sessionMatches(request: Request, auth: EtsyAuthRecord | null): boolean {
  return Boolean(auth && parseCookies(request).sg_etsy_session === auth.sessionId);
}

async function parseEtsyResponse<T>(response: globalThis.Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body.error || body.message || `Etsy API request failed (${response.status}).`);
  }
  return body as T;
}

async function refreshAccessToken(auth: EtsyAuthRecord): Promise<EtsyAuthRecord> {
  if (auth.expiresAt > Date.now() + 60_000) return auth;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getConfig().key,
    refresh_token: auth.refreshToken,
  });
  const tokenResponse = await fetch(`${apiBase}/public/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await parseEtsyResponse<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>(tokenResponse);
  const updated = {
    ...auth,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await writeAuth(updated);
  return updated;
}

async function requireEtsyAuth(request: Request): Promise<EtsyAuthRecord> {
  if (!isConfigured()) throw new Error("Etsy API settings are missing.");
  const auth = await readAuth();
  if (!sessionMatches(request, auth) || !auth) throw new Error("Connect your Etsy shop first.");
  return refreshAccessToken(auth);
}

async function etsyFetch<T>(auth: EtsyAuthRecord, endpoint: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-api-key", apiKeyHeader());
  headers.set("Authorization", `Bearer ${auth.accessToken}`);
  return parseEtsyResponse<T>(await fetch(`${apiBase}/application${endpoint}`, { ...init, headers }));
}

function asDataFile(dataUrl: string, fallbackName: string): { blob: Blob; name: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error(`Invalid generated file: ${fallbackName}`);
  const mime = match[1];
  const extension = mime.includes("png") ? "png" : mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";
  return {
    blob: new Blob([Buffer.from(match[2], "base64")], { type: mime }),
    name: `${fallbackName}.${extension}`,
  };
}

function flattenTaxonomy(nodes: EtsyTaxonomyNode[], parents: string[] = []): Array<{ id: number; name: string; path: string }> {
  return nodes.flatMap((node) => {
    const currentPath = [...parents, node.name];
    const current = { id: node.id, name: node.name, path: currentPath.join(" > ") };
    return [current, ...flattenTaxonomy(node.children || [], currentPath)];
  });
}

app.get("/api/etsy/status", async (request, response) => {
  const auth = await readAuth();
  const configured = isConfigured();
  response.json({
    configured,
    connected: configured && sessionMatches(request, auth),
    shopName: configured && sessionMatches(request, auth) ? auth?.shopName : undefined,
    message: configured ? undefined : "Add ETSY_API_KEY, ETSY_SHARED_SECRET and ETSY_REDIRECT_URI to .env.local.",
  });
});

app.get("/api/etsy/connect", (request, response) => {
  if (!isConfigured()) {
    response.status(503).send("Etsy API settings are missing in .env.local.");
    return;
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const sessionId = crypto.randomBytes(32).toString("base64url");
  oauthStates.set(state, { verifier, sessionId, createdAt: Date.now() });

  response.cookie("sg_etsy_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().redirectUri.startsWith("https://"),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getConfig().key,
    redirect_uri: getConfig().redirectUri,
    scope: "listings_r listings_w shops_r",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  response.redirect(`https://www.etsy.com/oauth/connect?${params}`);
});

app.get("/api/etsy/callback", async (request, response) => {
  try {
    const code = String(request.query.code || "");
    const state = String(request.query.state || "");
    const pending = oauthStates.get(state);
    oauthStates.delete(state);

    if (!code || !pending || Date.now() - pending.createdAt > 10 * 60_000) {
      throw new Error("Etsy authorization expired or could not be verified.");
    }

    const tokenResponse = await fetch(`${apiBase}/public/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: getConfig().key,
        redirect_uri: getConfig().redirectUri,
        code,
        code_verifier: pending.verifier,
      }),
    });
    const token = await parseEtsyResponse<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>(tokenResponse);
    const userId = token.access_token.split(".")[0];
    const shop = await parseEtsyResponse<{ shop_id: number; shop_name: string }>(await fetch(
      `${apiBase}/application/users/${userId}/shops`,
      {
        headers: {
          "x-api-key": apiKeyHeader(),
          "Authorization": `Bearer ${token.access_token}`,
        },
      }
    ));

    await writeAuth({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      userId,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      sessionId: pending.sessionId,
    });
    response.cookie("sg_etsy_session", pending.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: getConfig().redirectUri.startsWith("https://"),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    response.redirect("/?etsy=connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Etsy connection failed.";
    response.redirect(`/?etsy_error=${encodeURIComponent(message)}`);
  }
});

app.get("/api/etsy/taxonomies", async (_request, response, next) => {
  try {
    if (!isConfigured()) throw new Error("Etsy API settings are missing.");
    if (!taxonomyCache) {
      const data = await parseEtsyResponse<{ results: EtsyTaxonomyNode[] }>(await fetch(
        `${apiBase}/application/seller-taxonomy/nodes`,
        { headers: { "x-api-key": apiKeyHeader() } }
      ));
      taxonomyCache = flattenTaxonomy(data.results).sort((a, b) => a.path.localeCompare(b.path));
    }
    response.json({ results: taxonomyCache });
  } catch (error) {
    next(error);
  }
});

app.get("/api/etsy/readiness-states", async (request, response, next) => {
  try {
    const auth = await requireEtsyAuth(request);
    const data = await etsyFetch<{ results: Array<{
      readiness_state_id: number;
      processing_days_display_label: string;
      readiness_state: string;
    }> }>(auth, `/shops/${auth.shopId}/readiness-state-definitions`);
    response.json({
      results: data.results.map((item) => ({
        readinessStateId: item.readiness_state_id,
        label: item.processing_days_display_label || item.readiness_state.replaceAll("_", " "),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/etsy/shipping-profiles", async (request, response, next) => {
  try {
    const auth = await requireEtsyAuth(request);
    const data = await etsyFetch<{ results: Array<{
      shipping_profile_id: number;
      title: string;
    }> }>(auth, `/shops/${auth.shopId}/shipping-profiles`);
    response.json({
      results: data.results.map((item) => ({
        shippingProfileId: item.shipping_profile_id,
        title: item.title || `Shipping profile ${item.shipping_profile_id}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/etsy/drafts", async (request, response, next) => {
  try {
    const auth = await requireEtsyAuth(request);
    const { listing, images = [], videos = [] } = request.body as {
      listing: {
        title: string;
        description: string;
        tags: string[];
        price: string;
        quantity: number;
        taxonomyId: number;
        whoMade: string;
        whenMade: string;
        isSupply: boolean;
        readinessStateId?: number;
        shippingProfileId: number;
      };
      images: Array<{ dataUrl: string; label: string }>;
      videos: Array<{ dataUrl: string; label: string }>;
    };

    if (!listing?.title || !listing.description || !listing.price || !listing.taxonomyId || !listing.shippingProfileId) {
      throw new Error("Title, description, price, Etsy category and shipping profile are required.");
    }
    if (!Array.isArray(listing.tags) || listing.tags.length !== 13) {
      throw new Error("Exactly 13 Etsy tags are required.");
    }
    if (!images.length) throw new Error("At least one completed image is required.");

    const draftBody = new URLSearchParams({
      quantity: String(listing.quantity || 1),
      title: listing.title.slice(0, 140),
      description: listing.description,
      price: listing.price,
      who_made: listing.whoMade,
      when_made: listing.whenMade,
      is_supply: String(Boolean(listing.isSupply)),
      taxonomy_id: String(listing.taxonomyId),
      type: "physical",
      should_auto_renew: "false",
      shipping_profile_id: String(listing.shippingProfileId),
    });
    listing.tags.slice(0, 13).forEach((tag) => draftBody.append("tags[]", tag.slice(0, 20)));
    if (listing.readinessStateId) {
      draftBody.set("readiness_state_id", String(listing.readinessStateId));
    }

    const draft = await etsyFetch<{ listing_id: number }>(auth, `/shops/${auth.shopId}/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: draftBody,
    });

    const warnings: string[] = [];
    let uploadedImages = 0;
    let uploadedVideos = 0;

    for (const [index, image] of images.slice(0, 20).entries()) {
      try {
        const file = asDataFile(image.dataUrl, `listing-image-${index + 1}`);
        const form = new FormData();
        form.append("image", file.blob, file.name);
        form.append("rank", String(index + 1));
        form.append("alt_text", image.label.slice(0, 500));
        await etsyFetch(auth, `/shops/${auth.shopId}/listings/${draft.listing_id}/images`, {
          method: "POST",
          body: form,
        });
        uploadedImages += 1;
      } catch (error) {
        warnings.push(`Image ${index + 1}: ${error instanceof Error ? error.message : "upload failed"}`);
      }
    }

    for (const [index, video] of videos.slice(0, 2).entries()) {
      try {
        const file = asDataFile(video.dataUrl, `listing-video-${index + 1}`);
        if (file.blob.type.includes("webm")) {
          warnings.push(`Video ${index + 1} was skipped because Etsy does not document WebM as a supported listing format.`);
          continue;
        }
        const form = new FormData();
        form.append("video", file.blob, file.name);
        form.append("name", file.name);
        await etsyFetch(auth, `/shops/${auth.shopId}/listings/${draft.listing_id}/videos`, {
          method: "POST",
          body: form,
        });
        uploadedVideos += 1;
      } catch (error) {
        warnings.push(`Video ${index + 1}: ${error instanceof Error ? error.message : "upload failed"}`);
      }
    }

    response.status(201).json({
      listingId: draft.listing_id,
      shopName: auth.shopName,
      uploadedImages,
      uploadedVideos,
      warnings,
      managerUrl: "https://www.etsy.com/your/shops/me/tools/listings",
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  response.status(message.includes("Connect your Etsy") ? 401 : 400).json({ error: message });
});

async function start() {
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(rootDir, "dist")));
    app.get("*", (_request, response) => response.sendFile(path.join(rootDir, "dist", "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: rootDir,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`SalesGenius is running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
