import {
  dataUrlToFile,
  errorResponse,
  etsyRequest,
  jsonResponse,
  requireEtsySession,
} from "../../vercel/etsyAuth";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const session = await requireEtsySession(request);
      const body = await request.json() as { listingId?: number; dataUrl?: string; label?: string; rank?: number };
      if (!body.listingId || !body.dataUrl) throw new Error("Listing ID and image are required.");
      const file = dataUrlToFile(body.dataUrl, `listing-image-${body.rank || 1}`);
      const form = new FormData();
      form.append("image", file.blob, file.name);
      form.append("rank", String(body.rank || 1));
      form.append("alt_text", String(body.label || "Product image").slice(0, 500));
      await etsyRequest(session.auth, `/shops/${session.auth.shopId}/listings/${body.listingId}/images`, {
        method: "POST",
        body: form,
      });
      const headers = session.setCookie ? { "Set-Cookie": session.setCookie } : undefined;
      return jsonResponse({ uploaded: true }, 201, headers);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
