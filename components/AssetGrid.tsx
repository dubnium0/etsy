import React, { useState } from "react";
import { Download, Edit2, RotateCw, Play, Loader2, Sparkles, X, Check, AlertCircle } from "lucide-react";
import { saveAs } from "file-saver";
import { GeneratedAsset } from "../types";
import { editMarketingImage, createCinematicVideoBlob } from "../services/geminiService";

interface AssetGridProps {
  assets: GeneratedAsset[];
  onAssetUpdate: (updatedAsset: GeneratedAsset) => void;
  onRegenerate: (asset: GeneratedAsset) => void;
}

export const AssetGrid: React.FC<AssetGridProps> = ({
  assets,
  onAssetUpdate,
  onRegenerate
}) => {
  if (assets.length === 0) {
    return (
      <div id="no-assets" className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-8 py-12 text-center text-slate-400 backdrop-blur-xl shadow-lg shadow-black/10">
        <Sparkles className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-200">No assets generated yet.</p>
        <p className="text-xs text-slate-500 mt-1">Start batch generation to create studio photographs or cinematic descriptions.</p>
      </div>
    );
  }

  return (
    <div id="assets-grid-container" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onAssetUpdate={onAssetUpdate}
          onRegenerate={onRegenerate}
        />
      ))}
    </div>
  );
};

interface AssetCardProps {
  asset: GeneratedAsset;
  onAssetUpdate: (updatedAsset: GeneratedAsset) => void;
  onRegenerate: (asset: GeneratedAsset) => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, onAssetUpdate, onRegenerate }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [isGeneratingEdit, setIsGeneratingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isPreparingVideo, setIsPreparingVideo] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!asset.url) return;
    try {
      const isReveal = asset.url.startsWith("cinematic-reveal://");
      const realUrl = isReveal ? decodeURIComponent(asset.url.slice("cinematic-reveal://".length)) : asset.url;
      
      if (isReveal) {
        setIsPreparingVideo(true);
        try {
          // Generate a smooth 5-second cinematic MP4/WebM video blob client-side
          const videoBlob = await createCinematicVideoBlob(realUrl, 5000);
          const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
          saveAs(videoBlob, `${asset.id}_5s_video.${ext}`);
        } catch (videoErr) {
          console.error("Canvas video recording failed, downloading fallback frame as png instead:", videoErr);
          const res = await fetch(realUrl);
          const blob = await res.blob();
          saveAs(blob, `${asset.id}_generated.png`);
        } finally {
          setIsPreparingVideo(false);
        }
      } else {
        const extension = asset.type === "image" ? "png" : "mp4";
        // Fetch if its a blob URL to ensure proper download name
        if (realUrl.startsWith("blob:") || realUrl.startsWith("http") || realUrl.startsWith("data:")) {
          const res = await fetch(realUrl);
          const blob = await res.blob();
          saveAs(blob, `${asset.id}_generated.${extension}`);
        } else {
          saveAs(realUrl, `${asset.id}_generated.${extension}`);
        }
      }
    } catch (err) {
      console.error("Failed to download file:", err);
      // Fallback
      const isReveal = asset.url.startsWith("cinematic-reveal://");
      const realUrl = isReveal ? decodeURIComponent(asset.url.slice("cinematic-reveal://".length)) : asset.url;
      const link = document.createElement("a");
      link.href = realUrl;
      link.download = `${asset.id}_generated.${(asset.type === "image" || isReveal) ? "png" : "mp4"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleApplyEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInstruction.trim() || !asset.url) return;

    setIsGeneratingEdit(true);
    setEditError(null);

    try {
      const isReveal = asset.url.startsWith("cinematic-reveal://");
      const realUrl = isReveal ? decodeURIComponent(asset.url.slice("cinematic-reveal://".length)) : asset.url;

      // Call editMarketingImage with base64 and user instructions
      const editedUrl = await editMarketingImage(realUrl, editInstruction);
      onAssetUpdate({
        ...asset,
        url: isReveal ? `cinematic-reveal://${encodeURIComponent(editedUrl)}` : editedUrl,
        status: "completed"
      });
      setIsEditing(false);
      setEditInstruction("");
    } catch (err: any) {
      console.error(err);
      setEditError(err?.message || "Failed to edit image.");
    } finally {
      setIsGeneratingEdit(false);
    }
  };

  return (
    <div
      id={`asset-card-${asset.id}`}
      className="aspect-square bg-slate-900/40 rounded-2xl overflow-hidden relative border border-slate-700/50 shadow-md group select-none flex flex-col justify-between backdrop-blur-xl transition-all duration-300 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-900/10"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (!isGeneratingEdit) {
          setIsEditing(false);
        }
      }}
    >
      {/* 1. Pending (Queued) State */}
      {asset.status === "pending" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-slate-950/45 text-slate-400 backdrop-blur-sm">
          <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)] mb-3"></div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-450">Queued</p>
          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 px-2" title={asset.prompt}>
            {asset.prompt}
          </p>
        </div>
      )}

      {/* 2. Generating State */}
      {asset.status === "generating" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-slate-950/65 text-blue-400 backdrop-blur-md">
          <div className="relative flex items-center justify-center mb-3">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 w-8 h-8 animate-ping"></div>
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-200">
            {asset.type === "image" ? "Generating Image" : "Rendering Video"}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 px-2">
            Invoking commercial art matrix...
          </p>
        </div>
      )}

      {/* 3. Failed State */}
      {asset.status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-rose-950/20 text-slate-300 backdrop-blur-md">
          <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
          <p className="text-xs font-bold text-rose-450 uppercase tracking-widest">Generation Failed</p>
          <p className="text-[10px] text-slate-450 mt-1 line-clamp-2 px-2 mb-3" title={asset.error}>
            {asset.error || "Transient model error"}
          </p>
          <button
            onClick={() => onRegenerate(asset)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-[10px] uppercase tracking-wider font-semibold transition-colors duration-200 cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 4. Completed Content */}
      {asset.status === "completed" && asset.url && (
        <React.Fragment>
          {asset.type === "image" ? (
            <img
              src={asset.url}
              alt={asset.prompt}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
          ) : asset.url.startsWith("cinematic-reveal://") ? (
            <div className="w-full h-full relative overflow-hidden group">
              <style>{`
                @keyframes drift {
                  0% { transform: scale(1.08) translate(0px, 0px); }
                  50% { transform: scale(1.18) translate(-3%, -2%); }
                  100% { transform: scale(1.12) translate(2%, 2%); }
                }
                @keyframes shimmer {
                  0% { background-position: -200% 0; }
                  100% { background-position: 200% 0; }
                }
              `}</style>
              {/* Dynamic zooming panning background representing the cinematic shot */}
              <div className="w-full h-full relative overflow-hidden">
                <img
                  src={decodeURIComponent(asset.url.slice("cinematic-reveal://".length))}
                  alt={asset.prompt}
                  className="w-full h-full object-cover scale-[1.08]"
                  style={{
                    animation: "drift 16s ease-in-out infinite alternate"
                  }}
                  referrerPolicy="no-referrer"
                />
              </div>
              
              {/* Moving gloss light sweeps to make it feel deeply glossy/cinematic */}
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none mix-blend-overlay"></div>
              <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0)_30%,rgba(255,255,255,0.08)_45%,rgba(255,255,255,0.1)_55%,rgba(255,255,255,0)_70%)] bg-[length:200%_100%] pointer-events-none mix-blend-overlay"
                   style={{
                     animation: "shimmer 6s infinite linear"
                   }}
              ></div>
              
              {/* Overlay with details informing the user of the interactive preview */}
              <div className="absolute bottom-2 left-2 right-2 pointer-events-none bg-slate-950/85 backdrop-blur-md px-2 py-1.5 rounded-xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <span className="text-[9px] text-slate-200 uppercase tracking-widest font-black font-mono">Cinematic 3D Reveal</span>
                </div>
                <span className="text-[8px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-bold font-mono">
                  Concept Frame
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full h-full relative group">
              <video
                src={asset.url}
                controls
                className="w-full h-full object-cover"
                playsInline
                preload="metadata"
              />
              <div className="absolute bottom-2 left-2 pointer-events-none bg-slate-950/85 backdrop-blur px-2 py-1 rounded-lg border border-slate-800/80 flex items-center gap-1">
                <Play className="w-3 h-3 fill-blue-500 text-blue-500" />
                <span className="text-[10px] text-slate-200 uppercase tracking-widest font-bold">Concept Reveal</span>
              </div>
            </div>
          )}

          {/* Hover Overlay Actions */}
          {isHovered && !isEditing && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-900/85 to-transparent p-3 pt-12 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest truncate max-w-[120px]" title={asset.type}>
                  {asset.type} Strategy
                </span>
                <span className="text-[9px] text-slate-450 font-mono">1:1 Format</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={handleDownload}
                  disabled={isPreparingVideo}
                  title={isPreparingVideo ? "Preparing 3s video clip..." : "Download File"}
                  className="flex items-center justify-center p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800/60 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isPreparingVideo ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
                {(asset.type === "image" || asset.url.startsWith("cinematic-reveal://")) ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    title="Edit with AI"
                    className="flex items-center justify-center p-2 bg-slate-900/80 hover:bg-slate-850 text-blue-400 hover:text-blue-300 border border-slate-800/60 rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="p-2 opacity-30 select-none flex items-center justify-center bg-slate-900/80 rounded-lg border border-slate-800/60">
                    <Edit2 className="w-4 h-4 text-slate-500" />
                  </div>
                )}
                <button
                  onClick={() => onRegenerate(asset)}
                  title="Regenerate Asset"
                  className="flex items-center justify-center p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800/60 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Edit Panel Overlay */}
          {isEditing && (
            <form
              onSubmit={handleApplyEdit}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur p-4 flex flex-col justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1">
                    <Sparkles className="w-3 h-3 animate-pulse" />
                    AI Brush Editor
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-200 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 leading-normal">
                  Describe what detail to paint, add, refine, or illuminate on this photograph.
                </p>
              </div>

              <div className="space-y-2">
                <textarea
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  placeholder="e.g. Add a lens flare, make it brighter..."
                  rows={2}
                  disabled={isGeneratingEdit}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-sans"
                />

                {editError && (
                  <p className="text-[9px] text-rose-400 line-clamp-1 flex items-center gap-0.5">
                    <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                    <span>{editError}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isGeneratingEdit || !editInstruction.trim()}
                  className="w-full py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02] active:scale-95 disabled:bg-slate-800 disabled:text-slate-550 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 shadow cursor-pointer transition-all"
                >
                  {isGeneratingEdit ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Re-Rendering...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Apply Edit</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </React.Fragment>
      )}
    </div>
  );
};
