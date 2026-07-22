import {
  ETSY_AUTH_COOKIE,
  EtsyAuthSession,
  errorResponse,
  isEtsyConfigured,
  jsonResponse,
  readCookie,
  refreshEtsySession,
  sealCookie,
  sessionCookie,
  unsealCookie,
} from "../../vercel/etsyAuth.js";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      if (!isEtsyConfigured()) {
        return jsonResponse({
          configured: false,
          connected: false,
          message: "Add ETSY_API_KEY, ETSY_SHARED_SECRET, ETSY_REDIRECT_URI and SESSION_SECRET in Vercel Environment Variables, then redeploy.",
        });
      }

      const stored = unsealCookie<EtsyAuthSession>(readCookie(request, ETSY_AUTH_COOKIE));
      if (!stored) return jsonResponse({ configured: true, connected: false });
      const current = await refreshEtsySession(stored);
      const headers = current.refreshed
        ? { "Set-Cookie": sessionCookie(ETSY_AUTH_COOKIE, sealCookie(current.auth), 90 * 24 * 60 * 60) }
        : undefined;
      return jsonResponse({
        configured: true,
        connected: true,
        shopName: current.auth.shopName,
        shopId: current.auth.shopId,
      }, 200, headers);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
