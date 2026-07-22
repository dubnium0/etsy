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
      const body = await request.json() as { listingId?: number; dataUrl?: string; rank?: number };
      if (!body.listingId || !body.dataUrl) throw new Error("Listing ID and video are required.");
      const file = dataUrlToFile(body.dataUrl, `listing-video-${body.rank || 1}`);
      if (file.mime.includes("webm")) throw new Error("Etsy does not document WebM as a supported listing video format.");
      if (file.blob.size > 3_000_000) throw new Error("Video exceeds the Vercel Function upload limit.");
      const form = new FormData();
      form.append("video", file.blob, file.name);
      form.append("name", file.name);
      await etsyRequest(session.auth, `/shops/${session.auth.shopId}/listings/${body.listingId}/videos`, {
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
