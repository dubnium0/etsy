import React, { useState } from "react";
import { Copy, Check, HardDrive, Download, AlertCircle, RefreshCw } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { GeneratedAsset, TextContent } from "../types";

interface TextAnalysisProps {
  content?: TextContent;
  isGenerating: boolean;
  assets?: GeneratedAsset[];
  productName?: string;
}

export const TextAnalysis: React.FC<TextAnalysisProps> = ({
  content,
  isGenerating,
  assets = [],
  productName = "Product"
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleProductZipExport = async () => {
    if (!content) return;
    setIsZipping(true);
    setExportError(null);

    try {
      const zip = new JSZip();

      // 1. Create product metadata file
      const infoText = `=== E-COMMERCE PRODUCT INFORMATION ===
Product Name: ${productName}

SEO Title:
${content.title}

Product Description:
${content.description}

Keywords / Search Tags:
${content.tags.join(", ")}

Sales Potential Score: ${content.salesScore}/100

AI Strategic Conversion Analysis:
${content.scoreReasoning}
`;
      zip.file("product_info.txt", infoText);

      // 2. Add completed assets
      let mediaFolder = zip.folder("media");
      
      for (const asset of assets) {
        if (asset.status === "completed" && asset.url) {
          if (asset.type === "image") {
            // Check if it is a data url
            if (asset.url.startsWith("data:")) {
              const base64Data = asset.url.split(",")[1];
              if (base64Data) {
                mediaFolder?.file(`${asset.id}.png`, base64Data, { base64: true });
              }
            } else {
              // Direct URL
              try {
                const imgRes = await fetch(asset.url);
                const blob = await imgRes.blob();
                mediaFolder?.file(`${asset.id}.png`, blob);
              } catch (err) {
                console.error("Could not fetch image to compress:", err);
              }
            }
          } else if (asset.type === "video") {
            try {
              const videoRes = await fetch(asset.url);
              const blob = await videoRes.blob();
              mediaFolder?.file(`${asset.id}.mp4`, blob);
            } catch (err) {
              console.error("Could not fetch video stream to compress:", err);
            }
          }
        }
      }

      // Generate the ZIP file
      const safeName = productName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `SalesGenius_${safeName}_listing.zip`);
    } catch (err: any) {
      console.error(err);
      setExportError("Failed to build product zip archive. Ensure your assets are loaded.");
    } finally {
      setIsZipping(false);
    }
  };

  if (isGenerating) {
    return (
      <div id="text-analysis-loading" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center py-16 animate-pulse backdrop-blur-xl">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <h3 className="text-lg font-bold text-slate-200">Writing Copy & Analyzing Potential</h3>
        <p className="text-slate-400 text-sm mt-2 max-w-md">
          Writing search-optimized copy and evaluating conversion strategy parameters...
        </p>
      </div>
    );
  }

  if (!content) {
    return (
      <div id="text-analysis-placeholder" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-8 text-center text-slate-400 py-12 backdrop-blur-xl">
        <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-sm font-bold">Content not generated yet.</p>
        <p className="text-xs text-slate-500 mt-1">Run analysis to create copywriting, scoring suggestions, and metadata.</p>
      </div>
    );
  }

  const tagsText = content.tags.join(", ");

  return (
    <div id="text-analysis-container" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left/Main Area: SEO Title, Description, and Tags */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* SEO Optimized Title */}
        <div id="title-card" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold text-blue-450 uppercase tracking-widest">SEO Optimized Title</label>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400">
                <strong className="text-slate-200">{content.title.length}</strong> / 120 chars
              </span>
              <button
                id="copy-title-btn"
                onClick={() => copyToClipboard(content.title, "title")}
                className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-755 transition-colors duration-200"
              >
                {copiedField === "title" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="text-slate-100 font-semibold tracking-tight leading-relaxed text-lg bg-slate-950/50 p-4 rounded-xl border border-slate-800 backdrop-blur-md">
            {content.title}
          </div>
        </div>

        {/* Product Description */}
        <div id="description-card" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 shadow-xl relative backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Sales-Oriented Product Description</label>
            <button
              id="copy-desc-btn"
              onClick={() => copyToClipboard(content.description, "desc")}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-755 transition-colors duration-200"
            >
              {copiedField === "desc" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Description</span>
                </>
              )}
            </button>
          </div>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 text-slate-300 leading-relaxed text-sm whitespace-pre-wrap max-h-[380px] overflow-y-auto backdrop-blur-md">
            {content.description}
          </div>
        </div>

        {/* High Volume Tags */}
        <div id="tags-card" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 shadow-xl relative backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-purple-400 uppercase tracking-widest">High-Volume Search Tags</label>
              <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                13 Tags
              </span>
            </div>
            <button
              id="copy-tags-btn"
              onClick={() => copyToClipboard(tagsText, "tags")}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-755 transition-colors duration-200"
            >
              {copiedField === "tags" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy CSV</span>
                </>
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 p-3 bg-slate-950/50 rounded-xl border border-slate-800 backdrop-blur-md">
            {content.tags.map((tag, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-[10px] text-blue-400 font-mono transition-all hover:bg-blue-500/20"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>

      </div>

      {/* Right Area: Scores, AI Analysis, Export */}
      <div className="space-y-6">

        {/* Sales Potential Score Card */}
        <div id="score-card" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
          
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Active Analysis</span>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Sales Potential Score</h3>
            </div>
            <div className="flex flex-col items-center bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-700/80 shadow-md">
              <span className="text-[9px] font-bold text-slate-500 uppercase">Sales Score</span>
              <span className="text-3xl font-black text-emerald-400 leading-none mt-1">{content.salesScore}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950/60 rounded-full h-3 overflow-hidden p-[1px] border border-slate-800">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${content.salesScore}%`,
                background: `linear-gradient(90deg, #10b981 ${Math.max(0, content.salesScore - 30)}%, #3b82f6 100%)`
              }}
            ></div>
          </div>
          
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1 px-0.5">
            <span>0% (Poor)</span>
            <span>70% (High Potential)</span>
            <span>100% (Perfect)</span>
          </div>
        </div>

        {/* AI Analysis and Psychology triggers */}
        <div id="reasoning-card" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 shadow-xl relative backdrop-blur-xl">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Artistic Conversion Rationale</h3>
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line bg-slate-950/40 p-4 rounded-xl border border-slate-800/50 backdrop-blur-md">
            {content.scoreReasoning}
          </p>
        </div>

        {/* Export Options Card */}
        <div id="export-card" className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 shadow-xl space-y-4 backdrop-blur-xl">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Product-Level Export</h3>
          
          <button
            id="product-zip-btn"
            disabled={isZipping}
            onClick={handleProductZipExport}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02] active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-lg hover:shadow-blue-500/10 cursor-pointer"
          >
            {isZipping ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Zipping product data...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Listing (.zip)</span>
              </>
            )}
          </button>

          <button
            id="gdrive-fake-btn"
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-slate-850 hover:bg-slate-750 text-slate-300 border border-slate-700 hover:text-white transition-all rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <HardDrive className="w-4 h-4 text-emerald-500" />
            <span>Export to Google Drive</span>
          </button>

          <p className="text-[11px] text-slate-500 leading-normal italic text-center">
            *Google Drive export requires backend integration. Only visual mockup provided.
          </p>

          {exportError && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/25 p-2.5 rounded-lg flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
