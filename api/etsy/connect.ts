import crypto from "node:crypto";
import {
  ETSY_OAUTH_COOKIE,
  errorResponse,
  getEtsyConfig,
  isEtsyConfigured,
  sealCookie,
  sessionCookie,
} from "../../vercel/etsyAuth";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      if (!isEtsyConfigured()) throw new Error("Add Etsy credentials in Vercel Environment Variables and redeploy.");

      const config = getEtsyConfig();
      const state = crypto.randomBytes(24).toString("base64url");
      const verifier = crypto.randomBytes(48).toString("base64url");
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
      const oauthCookie = sealCookie({ state, verifier, createdAt: Date.now() });
      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.key,
        redirect_uri: config.redirectUri,
        scope: "listings_r listings_w shops_r",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: `https://www.etsy.com/oauth/connect?${params}`,
          "Set-Cookie": sessionCookie(ETSY_OAUTH_COOKIE, oauthCookie, 10 * 60),
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
