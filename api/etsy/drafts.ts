import {
  errorResponse,
  etsyRequest,
  jsonResponse,
  requireEtsySession,
} from "../../vercel/etsyAuth.js";

interface DraftListingInput {
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
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const session = await requireEtsySession(request);
      const body = await request.json() as { listing?: DraftListingInput };
      const listing = body.listing;
      if (!listing?.title || !listing.description || !listing.price || !listing.taxonomyId || !listing.shippingProfileId) {
        throw new Error("Title, description, price, Etsy category and shipping profile are required.");
      }
      if (!Array.isArray(listing.tags) || listing.tags.length !== 13) {
        throw new Error("Exactly 13 Etsy tags are required.");
      }

      const draftBody = new URLSearchParams({
        quantity: String(Math.max(1, Number(listing.quantity) || 1)),
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
      listing.tags.forEach((tag) => draftBody.append("tags[]", tag.slice(0, 20)));
      if (listing.readinessStateId) draftBody.set("readiness_state_id", String(listing.readinessStateId));

      const draft = await etsyRequest<{ listing_id: number }>(
        session.auth,
        `/shops/${session.auth.shopId}/listings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: draftBody,
        }
      );
      const headers = session.setCookie ? { "Set-Cookie": session.setCookie } : undefined;
      return jsonResponse({
        listingId: draft.listing_id,
        shopName: session.auth.shopName,
        managerUrl: "https://www.etsy.com/your/shops/me/tools/listings",
      }, 201, headers);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
