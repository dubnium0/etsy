import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  UploadCloud, 
  Trash2, 
  Play, 
  Square, 
  DownloadCloud, 
  Layers, 
  Eye, 
  Cpu, 
  AlertCircle, 
  CheckCircle,
  FileText,
  BadgeAlert,
  Loader2,
  RefreshCw,
  Clock,
  Images,
  Video
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { ModelTier, ProductData, GeneratedAsset, ShotStyleType } from "./types";
import { TextAnalysis } from "./components/TextAnalysis";
import { AssetGrid } from "./components/AssetGrid";
import { 
  analyzeProductImage, 
  generateMarketingImage, 
  generateTextContent,
  createCinematicVideoBlob
} from "./services/geminiService";

const SHOT_STYLE_OPTIONS: Array<{ value: ShotStyleType; label: string; description: string }> = [
  {
    value: "creative_hero",
    label: "Creative & Hero Shots",
    description: "Campaign-style hero images, bold concepts, dramatic lighting.",
  },
  {
    value: "lifestyle_detail",
    label: "Lifestyle & Detail Shots",
    description: "In-use scenes, close details, material and context shots.",
  },
  {
    value: "ecommerce_product",
    label: "E-commerce Product Shots",
    description: "Clean Etsy/Shopify/Amazon listing views and marketplace angles.",
  },
];

export default function App() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelTier, setModelTier] = useState<ModelTier>("economy");
  const [shotStyle, setShotStyle] = useState<ShotStyleType>("creative_hero");
  const [dragActive, setDragActive] = useState(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronization refs to read fresh values in sequential asynchronous loops
  const productsRef = useRef<ProductData[]>([]);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const isProcessingBatchRef = useRef(isProcessingBatch);
  useEffect(() => {
    isProcessingBatchRef.current = isProcessingBatch;
  }, [isProcessingBatch]);

  const modelTierRef = useRef(modelTier);
  useEffect(() => {
    modelTierRef.current = modelTier;
  }, [modelTier]);

  const shotStyleRef = useRef(shotStyle);
  useEffect(() => {
    shotStyleRef.current = shotStyle;
  }, [shotStyle]);

  // Abort Controller for stopping processing
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Update active product selection fallback
  useEffect(() => {
    if (products.length > 0 && !activeProductId) {
      setActiveProductId(products[0].id);
    } else if (products.length === 0) {
      setActiveProductId(null);
    }
  }, [products, activeProductId]);

  // Get active product data
  const activeProduct = products.find(p => p.id === activeProductId);

  // Helper file parser
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  // Upload handler
  const handleImagesUpload = async (files: FileList | null) => {
    if (!files) return;
    setError(null);

    // Filter image files only
    const validImageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));

    if (validImageFiles.length === 0) {
      setError("Please upload image files only.");
      return;
    }

    const currentCount = products.length;
    const allowedNewCount = 50 - currentCount;

    if (allowedNewCount <= 0) {
      setError("You have reached the maximum listing capacity of 50 products.");
      return;
    }

    // Limit to allowed count
    const filesToUpload = validImageFiles.slice(0, allowedNewCount);
    if (validImageFiles.length > allowedNewCount) {
      setError(`Only added ${allowedNewCount} files. Max 50 products total allowed.`);
    }

    const newProducts: ProductData[] = [];
    
    for (const file of filesToUpload) {
      try {
        const base64Data = await fileToBase64(file);
        // Default product name from file name without extension
        const rawName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const formattedName = rawName.replace(/[-_]/g, ' ')
                                     .replace(/\b\w/g, c => c.toUpperCase()); // English professional capitalization
        
        const newProduct: ProductData = {
          id: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          originalImage: base64Data,
          name: formattedName,
          category: "Detecting Category...",
          status: "idle",
          assets: []
        };
        newProducts.push(newProduct);
      } catch (err: any) {
        console.error("Failed to parse file:", err);
      }
    }

    setProducts(prev => {
      const updated = [...prev, ...newProducts];
      return updated;
    });
  };

  // Trigger file click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Drag-and-drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleImagesUpload(e.dataTransfer.files);
    }
  };

  // Delete product
  const handleDeleteProduct = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProducts(prev => prev.filter(p => p.id !== productId));
    if (activeProductId === productId) {
      setActiveProductId(null);
    }
  };

  // State state-machine workers
  const updateProductStatus = (productId: string, status: ProductData["status"]) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, status } : p));
  };

  const updateAssetStatus = (productId: string, assetId: string, status: GeneratedAsset["status"], err?: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          assets: p.assets.map(a => a.id === assetId ? { ...a, status, error: err } : a)
        };
      }
      return p;
    }));
  };

  const updateAssetUrl = (productId: string, assetId: string, url: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          assets: p.assets.map(a => a.id === assetId ? { ...a, url, status: "completed" as const } : a)
        };
      }
      return p;
    }));
  };

  const ensureProductAnalysis = async (productId: string) => {
    const product = productsRef.current.find(p => p.id === productId);
    if (!product) return null;

    if (product.analysis && product.analysis.shotStyle === shotStyleRef.current) {
      return product.analysis;
    }

    updateProductStatus(productId, "analyzing");
    try {
      const matches = product.originalImage.match(/^data:image\/[^;]+;base64,(.+)$/);
      const cleanBase64 = matches ? matches[1] : product.originalImage;
      const analysis = await analyzeProductImage(cleanBase64, shotStyleRef.current);

      setProducts(prev => prev.map(p => {
        if (p.id === productId) {
          const preparedAssets: GeneratedAsset[] = analysis.visualStrategy.map((strat, idx) => ({
            id: `${strat.assetType}-${idx}`,
            type: strat.assetType,
            url: "",
            prompt: strat.prompt,
            label: strat.type,
            status: "pending"
          }));

          return {
            ...p,
            name: analysis.productName,
            category: analysis.category,
            status: "idle",
            analysis: { ...analysis, shotStyle: shotStyleRef.current },
            assets: preparedAssets
          };
        }
        return p;
      }));

      await new Promise(resolve => setTimeout(resolve, 200));
      return productsRef.current.find(p => p.id === productId)?.analysis || null;
    } catch (err: any) {
      console.error(`Analysis error for ${productId}:`, err);
      setError(`Failed to analyze "${product.name}": ${err?.message || err}`);
      updateProductStatus(productId, "idle");
      return null;
    }
  };

  const generateProductImages = async (productId: string, isBatch: boolean = false) => {
    const product = productsRef.current.find(p => p.id === productId);
    if (!product) return;

    try {
      const analysis = await ensureProductAnalysis(productId);
      const currentItem = productsRef.current.find(p => p.id === productId);
      if (!currentItem || !analysis) return;

      updateProductStatus(productId, "generating_images");
      const imageAssets = currentItem.assets.filter(a => a.type === "image");

      for (const asset of imageAssets) {
        if (isBatch && !isProcessingBatchRef.current) {
          throw new Error("Sequential image workflow was stopped by developer.");
        }
        const checkExists = productsRef.current.some(p => p.id === productId);
        if (!checkExists) return;
        
        updateAssetStatus(productId, asset.id, "generating");

        try {
          const idx = parseInt(asset.id.split("-")[1] || "0", 10);
          const strategy = analysis.visualStrategy[idx];
          const assetUrl = await generateMarketingImage(
            strategy.prompt,
            strategy.negativePrompt,
            currentItem.originalImage,
            modelTierRef.current,
            analysis.physicalDescription,
            (analysis as any).identityLock
          );
          updateAssetUrl(productId, asset.id, assetUrl);
        } catch (assetErr: any) {
          console.error(`Asset failed: ${asset.id}`, assetErr);
          updateAssetStatus(productId, asset.id, "failed", assetErr?.message || "Transient rate limit or content exception.");
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      updateProductStatus(productId, "completed");
    } catch (err: any) {
      console.error(`Image generation error for ${productId}:`, err);
      setError(`Failed to generate images for "${product.name}": ${err?.message || err}`);
      updateProductStatus(productId, "idle");
    }
  };

  const generateProductText = async (productId: string) => {
    const product = productsRef.current.find(p => p.id === productId);
    if (!product) return;

    try {
      const analysis = await ensureProductAnalysis(productId);
      const refreshedItem = productsRef.current.find(p => p.id === productId);
      if (!refreshedItem || !analysis) return;

      updateProductStatus(productId, "generating_text");
      const textContent = await generateTextContent(refreshedItem.name, analysis as any);

      setProducts(prev => prev.map(p => {
        if (p.id === productId) {
          return {
            ...p,
            status: "completed",
            textContent
          };
        }
        return p;
      }));
    } catch (err: any) {
      console.error(`Text generation error for ${productId}:`, err);
      setError(`Failed to generate listing copy for "${product.name}": ${err?.message || err}`);
      updateProductStatus(productId, "idle");
    }
  };

  const generateProductVideos = async (productId: string) => {
    const product = productsRef.current.find(p => p.id === productId);
    if (!product) return;

    try {
      const analysis = await ensureProductAnalysis(productId);
      const currentItem = productsRef.current.find(p => p.id === productId);
      if (!currentItem || !analysis) return;

      updateProductStatus(productId, "generating_videos");
      const videoAssets = currentItem.assets.filter(a => a.type === "video");

      for (const asset of videoAssets) {
        updateAssetStatus(productId, asset.id, "generating");
        try {
          const idx = parseInt(asset.id.split("-")[1] || "15", 10);
          const strategy = analysis.visualStrategy[idx];
          const frameUrl = await generateMarketingImage(
            `${strategy.prompt}. Create a strong square poster frame for a 5 second smooth zoom in and zoom out product video. Keep the product centered with room for camera movement.`,
            strategy.negativePrompt,
            currentItem.originalImage,
            modelTierRef.current,
            analysis.physicalDescription,
            (analysis as any).identityLock,
            { aspectRatio: "1:1", imageSize: "1K", qualityAudit: false }
          );
          updateAssetUrl(productId, asset.id, `cinematic-reveal://${encodeURIComponent(frameUrl)}`);
        } catch (assetErr: any) {
          console.error(`Video asset failed: ${asset.id}`, assetErr);
          updateAssetStatus(productId, asset.id, "failed", assetErr?.message || "Video generation failed.");
        }
      }

      updateProductStatus(productId, "completed");
    } catch (err: any) {
      console.error(`Video generation error for ${productId}:`, err);
      setError(`Failed to generate videos for "${product.name}": ${err?.message || err}`);
      updateProductStatus(productId, "idle");
    }
  };

  // Start sequential batch generator
  const handleStartBatch = async () => {
    const idleItems = products.filter(p => p.status === "idle");
    if (idleItems.length === 0) {
      setError("No idle products detected. Drag and drop product images to build catalog.");
      return;
    }

    setIsProcessingBatch(true);
    setError(null);

    try {
      for (const idleItem of idleItems) {
        // Break instantly if stopped
        if (!isProcessingBatchRef.current) {
          break;
        }

        const exists = productsRef.current.some(p => p.id === idleItem.id && p.status === "idle");
        if (!exists) continue;

        // Auto select items in focus
        setActiveProductId(idleItem.id);

        await generateProductImages(idleItem.id, true);
      }
    } catch (batchError: any) {
      console.error("Batch error loop:", batchError);
      setError(batchError?.message || "Batch process interrupted.");
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Stop sequential run
  const handleStopBatch = () => {
    setIsProcessingBatch(false);
    abortControllerRef.current?.abort();
    // Re-initialize a clean abort controller
    abortControllerRef.current = new AbortController();
  };

  const handleGenerateImagesForActiveProduct = async () => {
    if (!activeProductId || isProcessingBatch) return;
    setError(null);
    await generateProductImages(activeProductId);
  };

  const handleGenerateTextForActiveProduct = async () => {
    if (!activeProductId || isProcessingBatch) return;
    setError(null);
    await generateProductText(activeProductId);
  };

  const handleGenerateVideosForActiveProduct = async () => {
    if (!activeProductId || isProcessingBatch) return;
    setError(null);
    await generateProductVideos(activeProductId);
  };

  const handleSendEtsyDraft = async () => {
    if (!activeProductId || !activeProduct) return;
    setError(null);
    updateProductStatus(activeProductId, "sending_etsy");

    try {
      if (!activeProduct.textContent) {
        throw new Error("Generate SEO title, description, tags and sales score before creating an Etsy draft.");
      }

      const completedImages = activeProduct.assets.filter(a => a.type === "image" && a.status === "completed" && a.url);
      if (completedImages.length === 0) {
        throw new Error("Generate at least one completed product image before creating an Etsy draft.");
      }

      const draftPayload = {
        title: activeProduct.textContent.title,
        description: activeProduct.textContent.description,
        tags: activeProduct.textContent.tags,
        salesScore: activeProduct.textContent.salesScore,
        category: activeProduct.category,
        images: completedImages.map(a => ({ id: a.id, label: a.label, url: a.url })),
        status: "draft",
        note: "Connect Etsy OAuth/API credentials to publish this payload as a real Etsy draft.",
      };

      const blob = new Blob([JSON.stringify(draftPayload, null, 2)], { type: "application/json" });
      saveAs(blob, `etsy_draft_${activeProduct.name.replace(/[^a-zA-Z0-9]+/g, "_")}.json`);
      updateProductStatus(activeProductId, "completed");
    } catch (err: any) {
      setError(err?.message || "Failed to prepare Etsy draft.");
      updateProductStatus(activeProductId, "completed");
    }
  };

  // Local asset update handler
  const handleOnAssetUpdate = (updatedAsset: GeneratedAsset) => {
    if (!activeProductId) return;
    setProducts(prev => prev.map(p => {
      if (p.id === activeProductId) {
        return {
          ...p,
          assets: p.assets.map(a => a.id === updatedAsset.id ? updatedAsset : a)
        };
      }
      return p;
    }));
  };

  // Local asset regeneration handler
  const handleOnAssetRegenerate = async (asset: GeneratedAsset) => {
    if (!activeProductId || !activeProduct || !activeProduct.analysis) return;
    
    // Update local status to generating
    updateAssetStatus(activeProductId, asset.id, "generating");

    try {
      let finalUrl = "";
      if (asset.type === "image") {
        // Extract specific concept index from id (image-X)
        const parts = asset.id.split("-");
        const idx = parseInt(parts[1] || "0", 10);
        const strategy = activeProduct.analysis.visualStrategy[idx];

        // Variation modifier
        const variations = ["ultra realistic 8k resolution", "sharp crystal focus", "luxurious depth", "editorial highlight"];
        const selectedVar = variations[Math.floor(Math.random() * variations.length)];
        
        finalUrl = await generateMarketingImage(
          `${strategy.prompt}, ${selectedVar}`,
          strategy.negativePrompt,
          activeProduct.originalImage,
          modelTier,
          activeProduct.analysis.physicalDescription,
          (activeProduct.analysis as any).identityLock
        );
      } else {
        const parts = asset.id.split("-");
        const idx = parseInt(parts[1] || "0", 10);
        const strategy = activeProduct.analysis.visualStrategy[idx];
        
        const frameUrl = await generateMarketingImage(
          `${strategy.prompt}. Create a strong square poster frame for a 5 second smooth zoom in and zoom out product video. Keep the product centered with room for camera movement.`,
          strategy.negativePrompt,
          activeProduct.originalImage,
          modelTier,
          activeProduct.analysis.physicalDescription,
          (activeProduct.analysis as any).identityLock,
          { aspectRatio: "1:1", imageSize: "1K", qualityAudit: false }
        );
        finalUrl = `cinematic-reveal://${encodeURIComponent(frameUrl)}`;
      }

      updateAssetUrl(activeProductId, asset.id, finalUrl);
    } catch (err: any) {
      console.error(err);
      updateAssetStatus(activeProductId, asset.id, "failed", err?.message || "Regeneration failed.");
    }
  };

  // Global Zip file export
  const handleBatchExport = async () => {
    if (products.length === 0) return;
    setIsExporting(true);
    setError(null);

    try {
      const zip = new JSZip();
      let hasContent = false;

      for (const product of products) {
        const hasText = !!product.textContent;
        const hasMedia = product.assets.some(a => a.status === "completed" && a.url);

        if (!hasText && !hasMedia) {
          continue;
        }

        hasContent = true;
        const safeFolderName = product.name.replace(/[^a-zA-Z0-9]+/g, "_") || `Product_${product.id}`;
        const folder = zip.folder(safeFolderName);
        if (!folder) continue;

        // Writing text metadata
        if (product.textContent) {
          const infoText = `=== SALESGENIUS COMMERCE METADATA ===
Product Name: ${product.name}
Category: ${product.category}

Recommended SEO Optimized Title:
${product.textContent.title}

High Converting Product Description:
${product.textContent.description}

E-commerce Keywords / Tags:
${product.textContent.tags.join(", ")}

Calculated Conversion Sales Potential: ${product.textContent.salesScore}/100

AI Rationale:
${product.textContent.scoreReasoning}
`;
          folder.file("product_listing.txt", infoText);
        }

        // Pack images
        const assetsFolder = folder.folder("marketing_assets");
        for (const asset of product.assets) {
          if (asset.status === "completed" && asset.url) {
            if (asset.type === "image") {
              if (asset.url.startsWith("data:")) {
                const base64Part = asset.url.split(",")[1];
                if (base64Part) {
                  assetsFolder?.file(`${asset.id}.png`, base64Part, { base64: true });
                }
              } else {
                try {
                  const imgRes = await fetch(asset.url);
                  const blob = await imgRes.blob();
                  assetsFolder?.file(`${asset.id}.png`, blob);
                } catch (e) {
                  console.error("Fetch image error", e);
                }
              }
            } else if (asset.type === "video") {
              try {
                if (asset.url.startsWith("cinematic-reveal://")) {
                  const realUrl = decodeURIComponent(asset.url.slice("cinematic-reveal://".length));
                  try {
                    // Export smooth 5-second cinematic animations
                    const videoBlob = await createCinematicVideoBlob(realUrl, 5000);
                    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
                    assetsFolder?.file(`${asset.id}_5s_video.${ext}`, videoBlob);
                  } catch (recErr) {
                    console.error("Batch fallback video render error", recErr);
                    // Inline frame backup
                    const imgRes = await fetch(realUrl);
                    const blob = await imgRes.blob();
                    assetsFolder?.file(`${asset.id}_generated_frame.png`, blob);
                  }
                } else {
                  const videoRes = await fetch(asset.url);
                  const blob = await videoRes.blob();
                  assetsFolder?.file(`${asset.id}.mp4`, blob);
                }
              } catch (e) {
                console.error("Fetch video error", e);
              }
            }
          }
        }
      }

      if (!hasContent) {
        throw new Error("No completed product listings available. Build visual content or metadata listings first.");
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `SalesGenius_Batch_Export_${todayStr}.zip`);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to finalize batch zip archival process.");
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status: ProductData["status"]) => {
    switch (status) {
      case "idle":
        return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-400 border border-slate-700">Idle</span>;
      case "analyzing":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            <span>Scanning</span>
          </span>
        );
      case "generating_media":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            <span>Art Studio</span>
          </span>
        );
      case "generating_images":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            <span>Images</span>
          </span>
        );
      case "generating_videos":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            <span>Videos</span>
          </span>
        );
      case "generating_text":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            <span>Writing</span>
          </span>
        );
      case "sending_etsy":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            <span>Etsy Draft</span>
          </span>
        );
      case "completed":
        return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">✔ Ready</span>;
      default:
        return null;
    }
  };

  // Filter image vs video assets
  const imageAssets = activeProduct?.assets.filter(a => a.type === "image") || [];
  const videoAssets = activeProduct?.assets.filter(a => a.type === "video") || [];  return (
    <div id="app-root-layout" className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none antialiased bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-slate-950 to-slate-950">
      
      {/* 1. Universal Top Header bar */}
      <header id="main-header" className="shrink-0 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 h-16 px-6 flex items-center justify-between sticky top-0 z-50">
        
        {/* Left Side: Brand branding and icon */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-650 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-sm font-black tracking-wider text-slate-100 font-sans">
              SalesGenius <span className="text-blue-450 text-[10px] font-bold uppercase py-0.5 px-2 bg-blue-500/10 rounded-full border border-blue-500/20 ml-1.5 shrink-0 select-none">AI Studio</span>
            </span>
            <span className="block text-[9px] text-slate-400 uppercase tracking-widest font-mono">E-Commerce Content Suite</span>
          </div>
        </div>

        {/* Right Side: Global control row */}
        <div className="flex items-center gap-2.5">
          
          {/* Model selection dropdown */}
          <div className="flex items-center bg-slate-800/30 border border-slate-700/40 backdrop-blur-md px-2.5 py-1.5 rounded-xl gap-2 font-sans">
            <Cpu className="w-4 h-4 text-blue-400" />
            <select
              id="model-tier-select"
              value={modelTier}
              disabled={isProcessingBatch}
              onChange={(e) => setModelTier(e.target.value as ModelTier)}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer disabled:opacity-60"
            >
              <option value="economy" className="bg-slate-950 text-slate-300">Standard Speed</option>
              <option value="premium" className="bg-slate-950 text-slate-300">Pro Mode (Ultra-Realism)</option>
            </select>
          </div>

          <div className="hidden xl:flex items-center bg-slate-800/30 border border-slate-700/40 backdrop-blur-md px-2.5 py-1.5 rounded-xl gap-2 font-sans">
            <Images className="w-4 h-4 text-emerald-400" />
            <select
              id="shot-style-select"
              value={shotStyle}
              disabled={isProcessingBatch}
              onChange={(e) => setShotStyle(e.target.value as ShotStyleType)}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer disabled:opacity-60 max-w-[220px]"
            >
              {SHOT_STYLE_OPTIONS.map(option => (
                <option key={option.value} value={option.value} className="bg-slate-950 text-slate-300">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Download all compressed zip catalog */}
          <button
            id="global-export-btn"
            disabled={products.length === 0 || isExporting}
            onClick={handleBatchExport}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3.5 py-2.5 text-slate-300 hover:text-white bg-slate-800/30 hover:bg-slate-750 active:bg-slate-900 border border-slate-700/40 backdrop-blur-md rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Zipping...</span>
              </>
            ) : (
              <>
                <DownloadCloud className="w-3.5 h-3.5" />
                <span>Download All</span>
              </>
            )}
          </button>

          {/* Sequential execution run trigger */}
          {!isProcessingBatch ? (
            <button
              id="start-batch-btn"
              onClick={handleStartBatch}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02] active:scale-95 text-white rounded-xl shadow-lg shadow-blue-500/10 cursor-pointer transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Batch Images</span>
            </button>
          ) : (
            <button
              id="stop-batch-btn"
              onClick={handleStopBatch}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-650 text-white rounded-xl cursor-pointer transition-all animate-pulse shadow-lg"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>Stop Batch</span>
            </button>
          )}

        </div>

      </header>

      {/* 2. Main screen grid layout */}
      <div id="dashboard-layout" className="grow flex overflow-hidden">
        
        {/* Left Sidebar: Upload catalog column */}
        <aside id="sidebar" className="w-80 border-r border-white/5 bg-slate-950/40 backdrop-blur-lg flex flex-col shrink-0 select-none overflow-hidden h-full">
          
          {/* Upload card dragbox */}
          <div className="p-4 border-b border-white/5 bg-slate-950/10">
            <div
              id="drop-target-area"
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              className={`border-2 border-dashed rounded-2xl p-5 text-center flex flex-col items-center justify-center cursor-pointer transition-all duration-300 backdrop-blur-md ${
                dragActive 
                  ? "border-blue-500 bg-blue-550/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]" 
                  : "border-slate-700/50 hover:border-slate-500/50 bg-slate-800/10 hover:bg-slate-800/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleImagesUpload(e.target.files)}
                className="hidden"
              />
              <UploadCloud className={`w-8 h-8 mb-2 ${dragActive ? 'text-blue-400 animate-bounce' : 'text-slate-500'}`} />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Upload Products</h3>
              <p className="text-[10px] text-slate-505 mt-1 font-mono">Accepts images • Max 50</p>
            </div>
          </div>

          {/* List items scroll view */}
          <div id="product-list" className="flex-1 overflow-y-auto p-4 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-505 uppercase tracking-widest px-1 pb-1">
              <span>Catalog List ({products.length})</span>
              <span>100% Client-Side</span>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-16 px-4">
                <BadgeAlert className="w-7 h-7 text-slate-700 mx-auto mb-2 opacity-60" />
                <p className="text-[11px] text-slate-500 leading-normal">Workspace is empty. Drag-and-drop or select product images to start listing.</p>
              </div>
            ) : (
              products.map((p) => {
                const isActive = p.id === activeProductId;
                return (
                  <div
                    key={p.id}
                    id={`sidebar-item-${p.id}`}
                    onClick={() => setActiveProductId(p.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all relative border overflow-hidden select-none group backdrop-blur ${
                      isActive 
                        ? "bg-blue-500/10 border-blue-500/40 shadow-inner shadow-blue-500/5" 
                        : "bg-slate-900/10 border-slate-805/60 hover:bg-[#0f172a]/30 hover:border-slate-700/40"
                    }`}
                  >
                    {/* Background slide highlights for sequential processing status */}
                    {p.status === "analyzing" && (
                      <div className="absolute inset-0 bg-amber-500/5 animate-pulse pointer-events-none"></div>
                    )}
                    
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Image Thumbnail */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-800/80 relative bg-slate-950">
                        <img
                          src={p.originalImage}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Decoded detail tags */}
                      <div className="min-w-0 flex-1">
                        <h4 className={`text-xs font-semibold truncate ${isActive ? 'text-blue-305' : 'text-slate-300'}`}>
                          {p.name || "Detecting Product..."}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {getStatusBadge(p.status)}
                        </div>
                      </div>
                    </div>

                    {/* Trash erase button */}
                    <button
                      id={`delete-btn-${p.id}`}
                      onClick={(e) => handleDeleteProduct(p.id, e)}
                      className="p-1 text-slate-650 hover:text-rose-450 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 cursor-pointer"
                      title="Remove product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-slate-950/20 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>SalesGenius AI Studio v1.2</span>
            <span>Local Listing Mode</span>
          </div>

        </aside>

        {/* Right Area: Dynamic work sandbox board */}
        <main id="workspace" className="flex-1 bg-slate-950/20 flex flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-950/10 via-slate-950/10 to-slate-950/5">
          
          {/* Main system validation alert popup */}
          {error && (
            <div id="global-error-alert" className="m-6 p-4 border border-rose-500/20 bg-rose-500/10 text-rose-300 rounded-2xl flex items-start gap-3 shadow-lg backdrop-blur-md animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest">System error detected</p>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {!activeProduct ? (
            <div id="empty-state-workspace" className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto">
              <div className="w-14 h-14 bg-slate-800/10 rounded-2xl border border-slate-700/40 flex items-center justify-center shadow-lg mb-4 backdrop-blur-md">
                <Layers className="w-7 h-7 text-slate-500 animate-pulse" />
              </div>
              <h2 className="text-base font-black text-slate-200 uppercase tracking-widest">Workspace Dashboard</h2>
              <p className="text-slate-400 text-xs leading-normal mt-2">
                Select an uploaded product listing from the left sidebar catalog, or drop custom e-commerce photography in the dropzone card to begin producing descriptions.
              </p>
            </div>
          ) : (
            <div id="active-product-panel" className="p-6 space-y-8 max-w-7xl mx-auto w-full">
              
              {/* Product identification parameters banner card */}
              <div id="product-overview-banner" className="bg-slate-800/20 border border-slate-700/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row gap-6 items-start md:items-center backdrop-blur-xl">
                
                {/* Active Original Item preview */}
                <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-inner border border-slate-750 shrink-0 bg-slate-950/60 p-1">
                  <img
                    src={activeProduct.originalImage}
                    alt={activeProduct.name}
                    className="w-full h-full object-cover rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Text attributes, Selling proposition outline, and tag pillars */}
                <div className="grow space-y-2 select-none min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      Active Listing Selection
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-950/65 text-slate-350 border border-slate-805 backdrop-blur-md">
                      Category: {activeProduct.analysis?.category || "TBD"}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {SHOT_STYLE_OPTIONS.find(option => option.value === shotStyle)?.label}
                    </span>
                    {getStatusBadge(activeProduct.status)}
                  </div>

                  <h1 className="text-2xl font-black tracking-tight text-white truncate max-w-[500px]">
                    {activeProduct.name}
                  </h1>

                  {/* Short visual perception outline text */}
                  {activeProduct.analysis?.physicalDescription && (
                    <p className="text-xs text-slate-305 leading-relaxed italic border-l-2 border-indigo-505 pl-3">
                      "{activeProduct.analysis.physicalDescription}"
                    </p>
                  )}

                  {/* Segmented Selling pillars */}
                  {activeProduct.analysis?.sellingPoints && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activeProduct.analysis.sellingPoints.map((point, index) => (
                        <span
                          key={index}
                          className="px-2.5 py-1 rounded-lg text-[10px] uppercase font-bold tracking-wider bg-emerald-500/10 text-emerald-450 border border-emerald-500/20"
                        >
                          ✔ {point}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Individual workflow launcher buttons */}
                <div className="shrink-0 w-full md:w-[300px] self-stretch md:self-center grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2">
                  <button
                    id="generate-copy-btn"
                    disabled={isProcessingBatch || activeProduct.status !== "idle" && activeProduct.status !== "completed"}
                    onClick={handleGenerateTextForActiveProduct}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800/40 hover:bg-slate-750 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 font-bold text-[10px] uppercase tracking-wider text-slate-200 border border-slate-700/50 transition-all cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Generate SEO Copy</span>
                  </button>
                  <button
                    id="generate-images-btn"
                    disabled={isProcessingBatch || activeProduct.status !== "idle" && activeProduct.status !== "completed"}
                    onClick={handleGenerateImagesForActiveProduct}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-blue-655 to-indigo-600 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 active:scale-95 font-bold text-[10px] uppercase tracking-wider text-white shadow-xl shadow-blue-500/10 transition-all cursor-pointer border border-blue-550/20"
                  >
                    <Images className="w-3.5 h-3.5" />
                    <span>Generate 15 Images</span>
                  </button>
                  <button
                    id="generate-videos-btn"
                    disabled={isProcessingBatch || activeProduct.status !== "idle" && activeProduct.status !== "completed"}
                    onClick={handleGenerateVideosForActiveProduct}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 font-bold text-[10px] uppercase tracking-wider text-purple-200 border border-purple-500/30 transition-all cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5 text-purple-300" />
                    <span>Generate 2 Videos</span>
                  </button>
                  <button
                    id="send-etsy-draft-btn"
                    disabled={isProcessingBatch || activeProduct.status !== "idle" && activeProduct.status !== "completed"}
                    onClick={handleSendEtsyDraft}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 font-bold text-[10px] uppercase tracking-wider text-orange-200 border border-orange-500/25 transition-all cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-orange-300" />
                    <span>Etsy Draft</span>
                  </button>
                </div>

              </div>

              {/* Sections rendering area */}
              <div id="product-sections" className="space-y-12">
                
                {/* 1. Copywriting Text blocks card panel */}
                <section id="copywriting-section" className="space-y-4 font-sans">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center border border-blue-500/10">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <h2 className="text-base font-black text-slate-200 uppercase tracking-widest">
                      1. Smart SEO & Sales Copy
                    </h2>
                  </div>
                  <TextAnalysis
                    content={activeProduct.textContent}
                    isGenerating={activeProduct.status === "generating_text"}
                    assets={activeProduct.assets}
                    productName={activeProduct.name}
                  />
                </section>

                {/* 2. Photography rendering Studio */}
                <section id="photography-section" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center border border-emerald-500/10">
                        <Images className="w-4 h-4 text-emerald-400" />
                      </div>
                      <h2 className="text-base font-black text-slate-200 uppercase tracking-widest">
                        2. AI Photography Studio
                      </h2>
                    </div>
                    {imageAssets.length > 0 && (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-950/65 text-slate-355 border border-slate-805 backdrop-blur-md font-mono text-[10px]">
                        {imageAssets.filter(a => a.status === "completed").length} / 15 Images Completed
                      </span>
                    )}
                  </div>
                  <AssetGrid
                    assets={imageAssets}
                    onAssetUpdate={handleOnAssetUpdate}
                    onRegenerate={handleOnAssetRegenerate}
                  />
                </section>

                {/* 3. Cinematic video prompt render studio */}
                <section id="video-section" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center border border-purple-500/10">
                        <Video className="w-4 h-4 text-purple-400" />
                      </div>
                      <h2 className="text-base font-black text-slate-200 uppercase tracking-widest">
                        3. AI Video Studio
                      </h2>
                    </div>
                    {videoAssets.length > 0 && (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-950/65 text-slate-355 border border-slate-805 backdrop-blur-md font-mono text-[10px]">
                        {videoAssets.filter(a => a.status === "completed").length} / 2 Clips Completed
                      </span>
                    )}
                  </div>

                  {videoAssets.length === 0 ? (
                    <div className="bg-slate-800/15 border border-slate-700/30 p-6 py-8 text-center text-slate-400 rounded-2xl backdrop-blur-md shadow-md">
                      <p className="text-xs">No video concept reveal assets defined. Run analysis and studio assets generation to review video configurations.</p>
                    </div>
                  ) : (
                    <AssetGrid
                      assets={videoAssets}
                      onAssetUpdate={handleOnAssetUpdate}
                      onRegenerate={handleOnAssetRegenerate}
                    />
                  )}
                </section>

              </div>

            </div>
          )}

        </main>

      </div>

    </div>
  );
}
