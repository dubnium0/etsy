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
        readiness_state_id: number;
        processing_days_display_label: string;
        readiness_state: string;
      }> }>(session.auth, `/shops/${session.auth.shopId}/readiness-state-definitions`);
      const headers = session.setCookie ? { "Set-Cookie": session.setCookie } : undefined;
      return jsonResponse({
        results: data.results.map((item) => ({
          readinessStateId: item.readiness_state_id,
          label: item.processing_days_display_label || item.readiness_state.replaceAll("_", " "),
        })),
      }, 200, headers);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
