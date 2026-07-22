import { ETSY_AUTH_COOKIE, clearCookie, jsonResponse } from "../../vercel/etsyAuth.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    return jsonResponse({ connected: false }, 200, { "Set-Cookie": clearCookie(ETSY_AUTH_COOKIE) });
  },
};
