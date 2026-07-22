export interface EtsyConnectionStatus {
  configured: boolean;
  connected: boolean;
  shopName?: string;
  shopId?: number;
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not prepare image upload."));
    reader.readAsDataURL(blob);
  });
}

async function compressImageForVercel(dataUrl: string): Promise<string> {
  const source = await fetch(dataUrl).then((response) => response.blob());
  if (source.size <= 2_700_000) return dataUrl;

  const imageUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not resize the Etsy image."));
      element.src = imageUrl;
    });
    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the Etsy image canvas.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.9;
    let compressed: Blob | null = null;
    while (quality >= 0.5) {
      compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (compressed && compressed.size <= 2_700_000) break;
      quality -= 0.1;
    }
    if (!compressed) throw new Error("Could not compress the Etsy image.");
    if (compressed.size > 2_700_000) throw new Error("Image remains too large for Vercel after compression.");
    return blobToDataUrl(compressed);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",", 2)[1] || "";
  return Math.ceil(base64.length * 0.75);
}

export async function createEtsyDraft(payload: Record<string, unknown>): Promise<EtsyDraftResult> {
  const input = payload as {
    listing: Record<string, unknown>;
    images?: Array<{ dataUrl: string; label: string }>;
    videos?: Array<{ dataUrl: string; label: string }>;
  };
  const draft = await readApiResponse<{ listingId: number; shopName: string; managerUrl: string }>(await fetch("/api/etsy/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listing: input.listing }),
  }));

  const warnings: string[] = [];
  let uploadedImages = 0;
  let uploadedVideos = 0;

  for (const [index, image] of (input.images || []).slice(0, 20).entries()) {
    try {
      const dataUrl = await compressImageForVercel(image.dataUrl);
      await readApiResponse(await fetch("/api/etsy/listing-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: draft.listingId,
          dataUrl,
          label: image.label,
          rank: index + 1,
        }),
      }));
      uploadedImages += 1;
    } catch (error) {
      warnings.push(`Image ${index + 1}: ${error instanceof Error ? error.message : "upload failed"}`);
    }
  }

  for (const [index, video] of (input.videos || []).slice(0, 2).entries()) {
    try {
      if (estimateDataUrlBytes(video.dataUrl) > 3_000_000) {
        throw new Error("video exceeds the Vercel Function upload limit");
      }
      await readApiResponse(await fetch("/api/etsy/listing-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: draft.listingId, dataUrl: video.dataUrl, rank: index + 1 }),
      }));
      uploadedVideos += 1;
    } catch (error) {
      warnings.push(`Video ${index + 1}: ${error instanceof Error ? error.message : "upload failed"}`);
    }
  }

  return {
    ...draft,
    uploadedImages,
    uploadedVideos,
    warnings,
  };
}
