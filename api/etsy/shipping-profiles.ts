import {
  errorResponse,
  etsyRequest,
  jsonResponse,
  requireEtsySession,
} from "../../vercel/etsyAuth.js";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      const session = await requireEtsySession(request);
      const data = await etsyRequest<{ results: Array<{
        shipping_profile_id: number;
        title: string;
      }> }>(session.auth, `/shops/${session.auth.shopId}/shipping-profiles`);
      const headers = session.setCookie ? { "Set-Cookie": session.setCookie } : undefined;
      return jsonResponse({
        results: data.results.map((item) => ({
          shippingProfileId: item.shipping_profile_id,
          title: item.title || `Shipping profile ${item.shipping_profile_id}`,
        })),
      }, 200, headers);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
