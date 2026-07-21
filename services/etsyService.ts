export interface EtsyConnectionStatus {
  configured: boolean;
  connected: boolean;
  shopName?: string;
  message?: string;
}

export interface EtsyTaxonomyOption {
  id: number;
  name: string;
  path: string;
}

export interface EtsyReadinessState {
  readinessStateId: number;
  label: string;
}

export interface EtsyDraftInput {
  price: string;
  quantity: number;
  taxonomyId: number;
  whoMade: "i_did" | "collective" | "someone_else";
  whenMade: string;
  isSupply: boolean;
  readinessStateId?: number;
}

export interface EtsyDraftResult {
  listingId: number;
  shopName: string;
  uploadedImages: number;
  uploadedVideos: number;
  warnings: string[];
  managerUrl: string;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || `Etsy request failed (${response.status}).`);
  }
  return body as T;
}

export async function getEtsyStatus(): Promise<EtsyConnectionStatus> {
  return readApiResponse(await fetch("/api/etsy/status"));
}

export function connectEtsy(): void {
  window.location.assign("/api/etsy/connect");
}

export async function getEtsyTaxonomies(): Promise<EtsyTaxonomyOption[]> {
  const result = await readApiResponse<{ results: EtsyTaxonomyOption[] }>(
    await fetch("/api/etsy/taxonomies")
  );
  return result.results;
}

export async function getEtsyReadinessStates(): Promise<EtsyReadinessState[]> {
  const result = await readApiResponse<{ results: EtsyReadinessState[] }>(
    await fetch("/api/etsy/readiness-states")
  );
  return result.results;
}

export async function createEtsyDraft(payload: Record<string, unknown>): Promise<EtsyDraftResult> {
  return readApiResponse(await fetch("/api/etsy/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}
