import {
  ETSY_AUTH_COOKIE,
  ETSY_OAUTH_COOKIE,
  clearCookie,
  etsyApiHeaders,
  errorResponse,
  getEtsyConfig,
  parseEtsyResponse,
  readCookie,
  sealCookie,
  sessionCookie,
  unsealCookie,
} from "../../vercel/etsyAuth";

interface PendingOAuth {
  state: string;
  verifier: string;
  createdAt: number;
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      const config = getEtsyConfig();
      const url = new URL(request.url);
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const pending = unsealCookie<PendingOAuth>(readCookie(request, ETSY_OAUTH_COOKIE));

      if (!code || !state || !pending || pending.state !== state || Date.now() - pending.createdAt > 10 * 60_000) {
        throw new Error("Etsy authorization expired or could not be verified. Start the connection again.");
      }

      const token = await parseEtsyResponse<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }>(await fetch("https://api.etsy.com/v3/public/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.key,
          redirect_uri: config.redirectUri,
          code,
          code_verifier: pending.verifier,
        }),
      }));

      const userId = token.access_token.split(".")[0];
      if (!/^\d+$/.test(userId)) throw new Error("Etsy returned an invalid user-scoped access token.");
      const shop = await parseEtsyResponse<{ shop_id: number; shop_name: string }>(await fetch(
        `https://api.etsy.com/v3/application/users/${userId}/shops`,
        { headers: etsyApiHeaders(token.access_token) }
      ));

      const authCookie = sealCookie({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        userId,
        shopId: shop.shop_id,
        shopName: shop.shop_name,
      });
      const redirect = new URL(config.redirectUri).origin;
      const headers = new Headers({
        Location: `${redirect}/?etsy=connected`,
        "Cache-Control": "no-store",
      });
      headers.append("Set-Cookie", sessionCookie(ETSY_AUTH_COOKIE, authCookie, 90 * 24 * 60 * 60));
      headers.append("Set-Cookie", clearCookie(ETSY_OAUTH_COOKIE));
      return new Response(null, { status: 302, headers });
    } catch (error) {
      const config = getEtsyConfig();
      const redirect = config.redirectUri ? new URL(config.redirectUri).origin : "/";
      const message = error instanceof Error ? error.message : "Etsy connection failed.";
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${redirect}/?etsy_error=${encodeURIComponent(message)}`,
          "Set-Cookie": clearCookie(ETSY_OAUTH_COOKIE),
          "Cache-Control": "no-store",
        },
      });
    }
  },
};
