import {
  errorResponse,
  etsyApiHeaders,
  isEtsyConfigured,
  jsonResponse,
  parseEtsyResponse,
} from "../../vercel/etsyAuth";

interface TaxonomyNode {
  id: number;
  name: string;
  children?: TaxonomyNode[];
}

function flattenTaxonomy(nodes: TaxonomyNode[], parents: string[] = []): Array<{ id: number; name: string; path: string }> {
  return nodes.flatMap((node) => {
    const currentPath = [...parents, node.name];
    return [
      { id: node.id, name: node.name, path: currentPath.join(" > ") },
      ...flattenTaxonomy(node.children || [], currentPath),
    ];
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      if (!isEtsyConfigured()) throw new Error("Etsy API settings are missing in Vercel Environment Variables.");
      const data = await parseEtsyResponse<{ results: TaxonomyNode[] }>(await fetch(
        "https://api.etsy.com/v3/application/seller-taxonomy/nodes",
        { headers: etsyApiHeaders() }
      ));
      const results = flattenTaxonomy(data.results).sort((a, b) => a.path.localeCompare(b.path));
      return jsonResponse({ results }, 200, { "Cache-Control": "public, s-maxage=86400" });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
