export type ModelTier = "economy" | "premium";
export type ShotStyleType = "creative_hero" | "lifestyle_detail" | "ecommerce_product";

export interface ProductShotStrategy {
  type: string;
  prompt: string;
  negativePrompt: string;
  rationale: string;
  assetType: "image" | "video";
}

export interface GeneratedAsset {
  id: string;
  type: "image" | "video";
  url: string;
  prompt: string;
  label: string;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string;
}

export interface TextContent {
  title: string;
  description: string;
  tags: string[];
  salesScore: number;
  scoreReasoning: string;
}

export interface ProductData {
  id: string;
  originalImage: string; // Base64 Data URL
  name: string;
  category: string;
  status: "idle" | "analyzing" | "generating_media" | "generating_images" | "generating_videos" | "generating_text" | "sending_etsy" | "completed";
  analysis?: {
    productName: string;
    physicalDescription: string;
    category: string;
    sellingPoints: string[];
    identityLock?: unknown;
    artDirection?: unknown;
    shotStyle?: ShotStyleType;
    visualStrategy: ProductShotStrategy[];
  };
  assets: GeneratedAsset[];
  textContent?: TextContent;
}

export interface AppState {
  apiKey: string | null;
  products: ProductData[];
  activeProductId: string | null;
  isProcessingBatch: boolean;
  modelTier: ModelTier;
  shotStyle: ShotStyleType;
}
