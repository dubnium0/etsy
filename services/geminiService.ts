import { GoogleGenAI, Type } from "@google/genai";
import { ProductShotStrategy, ShotStyleType, TextContent } from "../types";

/**
 * Drop-in product photography service.
 *
 * The quality jump comes from four controls:
 * 1. a reusable product identity passport,
 * 2. a fixed commercial shot taxonomy,
 * 3. multi-view references,
 * 4. an optional generate -> audit -> repair loop.
 */

export type ModelTier = "economy" | "premium";
export type AspectRatio = "1:1" | "4:5" | "3:4" | "16:9" | "9:16";
export type ImageSize = "1K" | "2K" | "4K";

export interface ProductIdentityLock {
  objectCount: number;
  silhouette: string;
  proportions: string;
  primaryColors: string[];
  materials: string[];
  surfaceFinish: string;
  distinctiveGeometry: string[];
  immutableDetails: string[];
  allowedToChange: string[];
}

export interface CollectionArtDirection {
  palette: string[];
  backdropMaterials: string[];
  lightingLanguage: string;
  propRules: string;
  visualMood: string;
}

export interface ImageAnalysisResult {
  productName: string;
  physicalDescription: string;
  category: string;
  sellingPoints: string[];
  identityLock: ProductIdentityLock;
  artDirection: CollectionArtDirection;
  visualStrategy: ProductShotStrategy[];
}

export interface GenerateImageOptions {
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  qualityAudit?: boolean;
}

interface ImageRef {
  data: string;
  mimeType: string;
}

interface QualityAudit {
  score: number;
  identityPreserved: boolean;
  commerciallyUsable: boolean;
  problems: string[];
  repairInstruction: string;
}

const MODELS = {
  analysis: ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"],
  economyImage: "gemini-3.1-flash-image",
  premiumImage: "gemini-3-pro-image",
  video: "veo-3.1-fast-generate-preview",
} as const;

const SHOT_TAXONOMIES: Record<ShotStyleType, readonly string[]> = {
  creative_hero: [
    "Signature Hero Shot",
    "Bold Campaign Hero",
    "Hard Shadow Graphic",
    "Soft Reflection Hero",
    "Levitation Concept",
    "Dynamic Splash or Particle",
    "Color Block Editorial",
    "Premium Packshot Hero",
    "Dramatic Low Angle",
    "Monochrome Luxury Scene",
    "Seasonal Campaign Scene",
    "Fantasy Campaign",
    "Material Contrast Hero",
    "Negative Space Ad Layout",
    "Social Media Cover Shot",
  ],
  lifestyle_detail: [
    "Natural Lifestyle Scene",
    "Human Interaction",
    "In-Use Moment",
    "Environmental Wide",
    "Material Macro",
    "Functional Detail",
    "Texture Close Up",
    "Handheld Detail",
    "Shelf or Vanity Moment",
    "Ingredient or Material Spread",
    "Soft Morning Light",
    "Outdoor Context",
    "Giftable Moment",
    "Behind the Scenes Detail",
    "Scale Reference Shot",
  ],
  ecommerce_product: [
    "Clean Front Hero",
    "White Background Front",
    "45 Degree Profile",
    "Side Profile",
    "Back View",
    "Top Down Composition",
    "Scale and Dimensions View",
    "Variant Group Layout",
    "Packaging Included Shot",
    "Feature Callout Blank Space",
    "Marketplace Thumbnail",
    "Detail Crop",
    "Shadow Only Studio",
    "Bundle or Kit Layout",
    "Etsy Listing Main Image",
  ],
} as const;

const VIDEO_TAXONOMY = [
  "Cinematic Turntable Reveal",
  "Slow Push-in With Environmental Motion",
] as const;

const ANALYSIS_SCHEMA: any = {
  type: Type.OBJECT,
  properties: {
    productName: { type: Type.STRING },
    physicalDescription: { type: Type.STRING },
    category: { type: Type.STRING },
    sellingPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      minItems: 3,
      maxItems: 5,
    },
    identityLock: {
      type: Type.OBJECT,
      properties: {
        objectCount: { type: Type.INTEGER },
        silhouette: { type: Type.STRING },
        proportions: { type: Type.STRING },
        primaryColors: { type: Type.ARRAY, items: { type: Type.STRING } },
        materials: { type: Type.ARRAY, items: { type: Type.STRING } },
        surfaceFinish: { type: Type.STRING },
        distinctiveGeometry: { type: Type.ARRAY, items: { type: Type.STRING } },
        immutableDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
        allowedToChange: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        "objectCount", "silhouette", "proportions", "primaryColors", "materials",
        "surfaceFinish", "distinctiveGeometry", "immutableDetails", "allowedToChange",
      ],
    },
    artDirection: {
      type: Type.OBJECT,
      properties: {
        palette: { type: Type.ARRAY, items: { type: Type.STRING } },
        backdropMaterials: { type: Type.ARRAY, items: { type: Type.STRING } },
        lightingLanguage: { type: Type.STRING },
        propRules: { type: Type.STRING },
        visualMood: { type: Type.STRING },
      },
      required: ["palette", "backdropMaterials", "lightingLanguage", "propRules", "visualMood"],
    },
    visualStrategy: {
      type: Type.ARRAY,
      minItems: 17,
      maxItems: 17,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          prompt: { type: Type.STRING },
          negativePrompt: { type: Type.STRING },
          rationale: { type: Type.STRING },
          assetType: { type: Type.STRING, enum: ["image", "video"] },
        },
        required: ["type", "prompt", "negativePrompt", "rationale", "assetType"],
      },
    },
  },
  required: [
    "productName", "physicalDescription", "category", "sellingPoints",
    "identityLock", "artDirection", "visualStrategy",
  ],
};

export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

export function getMimeType(dataUrl: string): string {
  return dataUrl.match(/^data:([^;]+);/)?.[1] || "image/jpeg";
}

export function getBase64Data(value: string): string {
  const comma = value.indexOf(",");
  return comma < 0 ? value : value.slice(comma + 1);
}

function toImageRef(value: string): ImageRef {
  return { data: getBase64Data(value), mimeType: getMimeType(value) };
}

function getErrorStatus(error: any): number | undefined {
  return error?.status ?? error?.response?.status ?? error?.error?.code;
}

function isRetryableError(error: any): boolean {
  const status = getErrorStatus(error);
  const message = String(error?.message || error).toLowerCase();
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 ||
    /high demand|quota|resource_exhausted|unavailable|timeout/.test(message);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  baseDelayMs = 1500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (!isRetryableError(error) || attempt === retries - 1) break;
      const exponential = baseDelayMs * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, exponential + jitter));
    }
  }
  if (getErrorStatus(lastError) === 429) {
    throw new Error("Gemini API quota exhausted. Check billing/rate limits or retry later.");
  }
  throw lastError;
}

async function withAnalysisModelFallback<T>(fn: (model: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const model of MODELS.analysis) {
    try {
      return await withRetry(() => fn(model), 2);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) throw error;
      console.warn(`Gemini model ${model} is unavailable; trying the next analysis model.`);
    }
  }
  throw new Error(
    `Gemini analysis models are temporarily busy. Retry in a few minutes. ${
      lastError instanceof Error ? lastError.message : ""
    }`.trim(),
  );
}

function validateStrategy(result: ImageAnalysisResult): void {
  const images = result.visualStrategy.filter((shot: any) => shot.assetType === "image");
  const videos = result.visualStrategy.filter((shot: any) => shot.assetType === "video");
  if (images.length !== 15 || videos.length !== 2) {
    throw new Error(`Invalid shot list: expected 15 images + 2 videos, received ${images.length} + ${videos.length}.`);
  }
  const responseTypes = result.visualStrategy.map((shot: any) => shot.type);
  const allowedImages = Object.values(SHOT_TAXONOMIES).some((taxonomy) =>
    taxonomy.every((name) => responseTypes.includes(name)),
  );
  const allowedVideos = VIDEO_TAXONOMY.every((name) => responseTypes.includes(name));
  if (!allowedImages || !allowedVideos) {
    throw new Error("The response did not follow the required commercial shot taxonomy.");
  }
}

export async function analyzeProductImage(
  sourceImages: string | string[],
  shotStyle: ShotStyleType = "creative_hero",
): Promise<ImageAnalysisResult> {
  const refs = (Array.isArray(sourceImages) ? sourceImages : [sourceImages]).slice(0, 6).map(toImageRef);
  if (!refs.length) throw new Error("At least one reference image is required.");
  const shotTaxonomy = SHOT_TAXONOMIES[shotStyle];
  const styleLanguage: Record<ShotStyleType, string> = {
    creative_hero: "Creative & Hero Shots: dramatic campaign visuals, bold hero compositions, premium advertising layouts and memorable concept images.",
    lifestyle_detail: "Lifestyle & Detail Shots: believable in-use scenes, human-scale context, tactile details, macro material cues and natural environments.",
    ecommerce_product: "E-commerce Product Shots: clean marketplace-ready product views for Shopify, Amazon and Etsy, including white backgrounds, clear angles and listing thumbnails.",
  };

  const prompt = `You are a senior commercial product photographer and e-commerce art director.

Analyze every supplied view as the SAME physical product. Build a precise identity passport before designing scenes. Never infer hidden handles, caps, seams, openings, accessories, or materials unless supported by a reference. Ignore readable brand copy when naming the product, but preserve the physical geometry occupied by labels, embossing, closures and packaging panels.

Create one cohesive premium collection, not 17 unrelated images. The selected shot library is ${styleLanguage[shotStyle]} The collection must feel editorial, tactile and commercially usable: restrained props, deliberate color palette, realistic contact shadows, believable reflections, high material fidelity, generous negative space and one unmistakable hero product.

Return exactly these 15 image concepts in this exact order and exact type names:
${shotTaxonomy.map((x, i) => `${i + 1}. ${x}`).join("\n")}

Then exactly these 2 video concepts:
${VIDEO_TAXONOMY.map((x, i) => `${i + 16}. ${x}`).join("\n")}

For every prompt:
- restate the identity-critical silhouette, colors, materials and proportions;
- specify composition, surface/backdrop, lighting, lens/camera height and depth of field;
- use at most 1-3 category-relevant supporting props;
- keep the product fully legible and physically plausible;
- do not request visible typography, logos, watermarks or newly invented packaging copy.

Every negativePrompt must reject: extra products, duplicated parts, altered geometry, invented accessories, warped packaging, floating without intended support, illegible text, logo, watermark, blur, plastic-looking material, CGI look, oversaturation, clutter and low resolution.`;

  let semanticError = "";
  for (let pass = 0; pass < 3; pass++) {
    const response = await withAnalysisModelFallback((model) => getClient().models.generateContent({
      model,
      contents: [
        ...refs.map((ref) => ({ inlineData: { data: ref.data, mimeType: ref.mimeType } })),
        { text: semanticError ? `${prompt}\n\nPrevious response error: ${semanticError}. Correct it.` : prompt },
      ],
      config: { responseMimeType: "application/json", responseSchema: ANALYSIS_SCHEMA },
    }));
    try {
      const result = JSON.parse(response.text || "{}") as ImageAnalysisResult;
      validateStrategy(result);
      return result;
    } catch (error: any) {
      semanticError = error?.message || "Invalid JSON";
    }
  }
  throw new Error(`Product analysis failed validation: ${semanticError}`);
}

function identityText(description: string, lock?: ProductIdentityLock): string {
  if (!lock) return description;
  return [
    description,
    `Object count: ${lock.objectCount}`,
    `Silhouette: ${lock.silhouette}`,
    `Proportions: ${lock.proportions}`,
    `Colors: ${lock.primaryColors.join(", ")}`,
    `Materials: ${lock.materials.join(", ")}`,
    `Finish: ${lock.surfaceFinish}`,
    `Geometry: ${lock.distinctiveGeometry.join("; ")}`,
    `Never change: ${lock.immutableDetails.join("; ")}`,
  ].join("\n");
}

function imagePrompt(
  scenePrompt: string,
  negativePrompt: string,
  description: string,
  lock: ProductIdentityLock | undefined,
  tier: ModelTier,
): string {
  return `ROLE: senior product photographer and meticulous retoucher.

REFERENCE AUTHORITY: The supplied product photos are the sole source of truth. Reconstruct the exact same single product; do not redesign it. If scene instructions conflict with a reference, the reference wins.

IDENTITY PASSPORT:
${identityText(description, lock)}

SHOT BRIEF:
${scenePrompt}

COMPOSITION STANDARD:
- premium editorial product photograph with a clear visual hierarchy;
- product occupies roughly 55-75% of the frame unless the brief is a wide environmental shot;
- physically correct scale, perspective, grounding, contact shadow and reflections;
- controlled highlight roll-off with retained texture in bright and dark surfaces;
- restrained set styling using no more than three relevant supporting elements;
- ${tier === "premium" ? "medium-format detail, 2K production finish, refined color separation and magazine-grade retouching" : "clean commercial lighting, crisp focus and natural material response"}.

NON-NEGOTIABLE EXCLUSIONS:
${negativePrompt}. No extra product, duplicate product, extra cap, extra handle, invented seam, changed silhouette, changed proportions, warped edges, melted geometry, fake label copy, typography, logo, signature, border, watermark, clutter, blur, noise, low resolution, illustration, obvious CGI, plastic-looking texture, crushed blacks, clipped highlights or oversaturation.

OUTPUT: one finished photorealistic product photograph only. Do not explain the image.`;
}

function extractInteractionImage(interaction: any): { data: string; mimeType: string } {
  if (interaction?.output_image?.data) {
    return {
      data: interaction.output_image.data,
      mimeType: interaction.output_image.mime_type || "image/png",
    };
  }
  for (const step of interaction?.steps || []) {
    if (step?.type !== "model_output") continue;
    for (const block of step.content || []) {
      if (block?.type === "image" && block.data) {
        return { data: block.data, mimeType: block.mime_type || "image/png" };
      }
    }
  }
  throw new Error("The image model returned no image data.");
}

async function createImage(
  prompt: string,
  refs: ImageRef[],
  tier: ModelTier,
  options: GenerateImageOptions,
): Promise<string> {
  const model = tier === "premium" ? MODELS.premiumImage : MODELS.economyImage;
  const size = options.imageSize || (tier === "premium" ? "2K" : "1K");
  
  const response = await withRetry(() => getClient().models.generateContent({
    model,
    contents: [
      ...refs.map((ref) => ({
        inlineData: {
          data: ref.data,
          mimeType: ref.mimeType,
        },
      })),
      { text: prompt },
    ],
    config: {
      imageConfig: {
        aspectRatio: options.aspectRatio || "1:1",
        imageSize: size,
      },
    } as any,
  }));

  let base64Data: string | undefined;
  let mimeType = "image/png";

  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        base64Data = part.inlineData.data;
        if (part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        break;
      }
    }
  }

  if (!base64Data) {
    throw new Error("The image model returned no inline image data.");
  }

  return `data:${mimeType};base64,${base64Data}`;
}

async function auditImage(
  generated: string,
  references: ImageRef[],
  lock: ProductIdentityLock | undefined,
  scenePrompt: string,
): Promise<QualityAudit> {
  const generatedRef = toImageRef(generated);
  const response = await withAnalysisModelFallback((model) => getClient().models.generateContent({
    model,
    contents: [
      { text: `Act as a strict commercial retouching QA reviewer. The first image is GENERATED; all following images are REFERENCES. Compare physical product identity, not readable branding. Check silhouette, object count, proportions, colors, materials, closures, seams, edge geometry, perspective, contact shadow, clipping, blur and commercial polish. Intended scene: ${scenePrompt}. Identity passport: ${identityText("", lock)}. Score 0-100. A score >= 88 requires both strong identity preservation and marketplace-ready realism.` },
      { inlineData: { data: generatedRef.data, mimeType: generatedRef.mimeType } },
      ...references.map((ref) => ({ inlineData: { data: ref.data, mimeType: ref.mimeType } })),
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          identityPreserved: { type: Type.BOOLEAN },
          commerciallyUsable: { type: Type.BOOLEAN },
          problems: { type: Type.ARRAY, items: { type: Type.STRING } },
          repairInstruction: { type: Type.STRING },
        },
        required: ["score", "identityPreserved", "commerciallyUsable", "problems", "repairInstruction"],
      },
    },
  }));
  return JSON.parse(response.text || "{}") as QualityAudit;
}

export async function generateMarketingImage(
  scenePrompt: string,
  negativePrompt: string,
  referenceImages: string | string[],
  modelTier: ModelTier,
  physicalDescription: string,
  identityLock?: ProductIdentityLock,
  options: GenerateImageOptions = {},
): Promise<string> {
  const refs = (Array.isArray(referenceImages) ? referenceImages : [referenceImages])
    .slice(0, modelTier === "premium" ? 6 : 10)
    .map(toImageRef);
  if (!refs.length) throw new Error("At least one reference image is required.");

  const prompt = imagePrompt(scenePrompt, negativePrompt, physicalDescription, identityLock, modelTier);
  try {
    let output = await createImage(prompt, refs, modelTier, options);
    const shouldAudit = options.qualityAudit ?? modelTier === "premium";
    if (!shouldAudit) return output;

    const audit = await auditImage(output, refs, identityLock, scenePrompt);
    if (audit.score >= 88 && audit.identityPreserved && audit.commerciallyUsable) return output;

    output = await createImage(
      `${prompt}\n\nREPAIR PASS: Reference images 1-${Math.min(refs.length, 5)} are the original product truth; the final reference is the failed generated draft and is supplied only to show the intended composition. The draft failed QA for: ${audit.problems.join("; ")}. ${audit.repairInstruction}. Rebuild from the originals while keeping the intended composition.`,
      [...refs.slice(0, 5), toImageRef(output)],
      modelTier,
      options,
    );
    return output;
  } catch (error) {
    if (modelTier === "premium") {
      console.warn("Premium image generation failed; retrying with economy model.", error);
      return generateMarketingImage(
        scenePrompt, negativePrompt, referenceImages, "economy",
        physicalDescription, identityLock, { ...options, imageSize: "1K", qualityAudit: false },
      );
    }
    throw error;
  }
}

export async function editMarketingImage(
  base64Image: string,
  editInstruction: string,
  identityLock?: ProductIdentityLock,
  options: Pick<GenerateImageOptions, "aspectRatio" | "imageSize"> = {},
): Promise<string> {
  const ref = toImageRef(base64Image);
  const prompt = `Edit only what is requested: ${editInstruction}.
The supplied image is the geometry and identity authority. Preserve product count, silhouette, proportions, colors, material response, closures, seams and perspective. Identity passport: ${identityText("", identityLock)}. Integrate the edit with realistic light, contact shadow and reflections. Do not add typography, logos, labels, watermarks, extra parts or extra products. Return one photorealistic image only.`;
  return createImage(prompt, [ref], "premium", {
    aspectRatio: options.aspectRatio || "1:1",
    imageSize: options.imageSize || "2K",
  });
}

export async function generateVeoVideo(
  prompt: string,
  referenceImage: string,
  negativePrompt = "text, logo, watermark, morphing product, warped geometry, extra parts, flicker, jitter, blur",
): Promise<string> {
  const ref = toImageRef(referenceImage);
  const ai = getClient();
  let operation: any = await withRetry(() => ai.models.generateVideos({
    model: MODELS.video,
    prompt: `${prompt}. One continuous premium commercial product shot. The product remains rigid and identity-consistent in every frame. Subtle physically plausible camera movement, realistic shadows and reflections, no cuts, no overlays, no speech.`,
    image: { imageBytes: ref.data, mimeType: ref.mimeType },
    config: {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio: "1:1",
      durationSeconds: 4,
      negativePrompt,
    },
  } as any));

  const deadline = Date.now() + 8 * 60_000;
  while (!operation.done && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    operation = await withRetry(() => ai.operations.getVideosOperation({ operation } as any));
  }
  if (!operation.done) throw new Error("Video generation timed out after 8 minutes.");

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video?.uri) throw new Error("Video generation completed without a downloadable URI.");
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  const response = await fetch(video.uri, { headers: { "x-goog-api-key": apiKey } });
  if (!response.ok) throw new Error(`Video download failed (${response.status}).`);
  return URL.createObjectURL(await response.blob());
}

export async function generateTextContent(
  productName: string,
  analysis: ImageAnalysisResult,
): Promise<TextContent> {
  const response = await withAnalysisModelFallback((model) => getClient().models.generateContent({
    model,
    contents: `Create accurate, persuasive English e-commerce copy for ${productName}. Use only supported facts from: ${JSON.stringify(analysis)}. Never invent dimensions, ingredients, certifications, compatibility or performance claims. Return a 100-120 character title, a scannable description, exactly 13 tags of at most 20 characters, a 0-100 salesScore and concise scoreReasoning.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          tags: { type: Type.ARRAY, minItems: 13, maxItems: 13, items: { type: Type.STRING } },
          salesScore: { type: Type.INTEGER },
          scoreReasoning: { type: Type.STRING },
        },
        required: ["title", "description", "tags", "salesScore", "scoreReasoning"],
      } as any,
    },
  }));
  const parsed = JSON.parse(response.text || "{}") as TextContent;
  if (parsed.tags.length !== 13 || parsed.tags.some((tag) => tag.length > 20)) {
    throw new Error("Generated tags failed validation.");
  }
  return parsed;
}

/**
 * Creates a real, playable, high-quality 3-second MP4/WebM video blob inside the browser 
 * by drawing a smooth cinematic drift/pan on a Canvas and recording it.
 * This ensures that even when Veo fails, the customer downloads a real 3-second animated video instead of a PNG.
 */
export function createCinematicVideoBlob(imageUrl: string, durationMs: number = 3000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!imageUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 720; // High-quality 720x720 video layout
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Could not acquire 2D canvas context");
        }

        const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
        if (!stream) {
          throw new Error("Canvas Capture Stream feature is not supported in this browser environment.");
        }

        let mimeType = "video/webm";
        if (MediaRecorder.isTypeSupported("video/mp4")) {
          mimeType = "video/mp4";
        } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
          mimeType = "video/webm;codecs=vp9";
        } else if (MediaRecorder.isTypeSupported("video/webm")) {
          mimeType = "video/webm";
        }

        const options = { mimeType };
        const mediaRecorder = new MediaRecorder(stream, options);
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const videoBlob = new Blob(chunks, { type: mimeType });
          resolve(videoBlob);
        };

        mediaRecorder.start();

        const startTime = performance.now();

        const drawFrame = () => {
          const now = performance.now();
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / durationMs, 1);

          // Panning/zooming drift identical to CSS animations
          const scale = 1.08 + (0.10 * progress);
          const dx = -20 * progress;
          const dy = -15 * progress;

          ctx.clearRect(0, 0, size, size);
          ctx.save();
          ctx.translate(size / 2, size / 2);
          ctx.scale(scale, scale);
          ctx.translate(-size / 2 + dx, -size / 2 + dy);

          const imgAspect = img.width / img.height;
          let drawWidth = size;
          let drawHeight = size;
          let xOffset = 0;
          let yOffset = 0;

          if (imgAspect > 1) {
            drawHeight = size / imgAspect;
            yOffset = (size - drawHeight) / 2;
          } else if (imgAspect < 1) {
            drawWidth = size * imgAspect;
            xOffset = (size - drawWidth) / 2;
          }

          ctx.drawImage(img, xOffset, yOffset, drawWidth, drawHeight);
          ctx.restore();

          if (progress < 1) {
            requestAnimationFrame(drawFrame);
          } else {
            mediaRecorder.stop();
          }
        };

        drawFrame();
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(new Error("Failed to load reference image frame."));
    };

    img.src = imageUrl;
  });
}
