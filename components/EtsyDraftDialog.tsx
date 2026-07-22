import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, ExternalLink, Loader2, Search, Store, X } from "lucide-react";
import {
  EtsyDraftInput,
  EtsyDraftResult,
  EtsyReadinessState,
  EtsyTaxonomyOption,
  getEtsyReadinessStates,
  getEtsyTaxonomies,
} from "../services/etsyService";

interface EtsyDraftDialogProps {
  shopName: string;
  productCategory: string;
  imageCount: number;
  videoCount: number;
  onClose: () => void;
  onSubmit: (input: EtsyDraftInput) => Promise<EtsyDraftResult>;
}

function normalizeCategory(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

const ETSY_CATEGORY_ALIASES: Record<string, string> = {
  "apparel & fashion": "clothing",
  apparel: "clothing",
  fashion: "clothing",
  "beauty & personal care": "bath & beauty",
  "home & garden": "home & living",
  "jewelry & accessories": "jewelry",
  "arts & crafts": "craft supplies & tools",
  electronics: "electronics & accessories",
  bags: "bags & purses",
};

function resolveCategoryQuery(value: string): string {
  const normalized = normalizeCategory(value);
  return ETSY_CATEGORY_ALIASES[normalized] || normalized;
}

function rankTaxonomyMatches(query: string, taxonomies: EtsyTaxonomyOption[]): EtsyTaxonomyOption[] {
  const normalized = resolveCategoryQuery(query);
  if (normalized.length < 2) return [];
  return taxonomies
    .filter((item) => normalizeCategory(item.path).includes(normalized) || normalizeCategory(item.name).includes(normalized))
    .sort((a, b) => {
      const score = (item: EtsyTaxonomyOption) => {
        const path = normalizeCategory(item.path);
        const name = normalizeCategory(item.name);
        if (path === normalized) return 0;
        if (name === normalized) return 1;
        if (path.startsWith(normalized)) return 2;
        if (name.startsWith(normalized)) return 3;
        return 4;
      };
      return score(a) - score(b) || a.path.localeCompare(b.path);
    });
}

export function EtsyDraftDialog({
  shopName,
  productCategory,
  imageCount,
  videoCount,
  onClose,
  onSubmit,
}: EtsyDraftDialogProps) {
  const [taxonomies, setTaxonomies] = useState<EtsyTaxonomyOption[]>([]);
  const [readinessStates, setReadinessStates] = useState<EtsyReadinessState[]>([]);
  const [categoryQuery, setCategoryQuery] = useState(productCategory);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<EtsyTaxonomyOption | null>(null);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [whoMade, setWhoMade] = useState<EtsyDraftInput["whoMade"]>("i_did");
  const [whenMade, setWhenMade] = useState("made_to_order");
  const [isSupply, setIsSupply] = useState(false);
  const [readinessStateId, setReadinessStateId] = useState<number | undefined>();
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<EtsyDraftResult | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getEtsyTaxonomies(), getEtsyReadinessStates()])
      .then(([taxonomyOptions, readinessOptions]) => {
        if (!active) return;
        setTaxonomies(taxonomyOptions);
        const initialMatches = rankTaxonomyMatches(productCategory, taxonomyOptions);
        const resolvedProductCategory = resolveCategoryQuery(productCategory);
        const exactPath = initialMatches.find((item) => normalizeCategory(item.path) === resolvedProductCategory);
        const exactNameMatches = initialMatches.filter((item) => normalizeCategory(item.name) === resolvedProductCategory);
        const initialSelection = exactPath || (exactNameMatches.length === 1 ? exactNameMatches[0] : null);
        if (initialSelection) {
          setSelectedTaxonomy(initialSelection);
          setCategoryQuery(initialSelection.path);
        }
        setReadinessStates(readinessOptions);
        setReadinessStateId(readinessOptions[0]?.readinessStateId);
      })
      .catch((error) => active && setLocalError(error instanceof Error ? error.message : "Could not load Etsy options."))
      .finally(() => active && setIsLoadingOptions(false));
    return () => { active = false; };
  }, []);

  const categoryMatches = useMemo(() => {
    if (selectedTaxonomy) return [];
    return rankTaxonomyMatches(categoryQuery, taxonomies).slice(0, 8);
  }, [categoryQuery, selectedTaxonomy, taxonomies]);

  const selectTaxonomy = (taxonomy: EtsyTaxonomyOption) => {
    setSelectedTaxonomy(taxonomy);
    setCategoryQuery(taxonomy.path);
    setLocalError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    const resolvedTaxonomy = selectedTaxonomy || rankTaxonomyMatches(categoryQuery, taxonomies)[0];
    if (!resolvedTaxonomy) {
      setLocalError("Select an Etsy category from the search results.");
      return;
    }
    if (!price || Number(price) <= 0) {
      setLocalError("Enter a valid product price.");
      return;
    }
    setIsSubmitting(true);
    try {
      setResult(await onSubmit({
        price,
        quantity,
        taxonomyId: resolvedTaxonomy.id,
        whoMade,
        whenMade,
        isSupply,
        readinessStateId,
      }));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Etsy draft could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="etsy-dialog-title">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-900 shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-500/25 bg-orange-500/10">
              <Store className="h-4 w-4 text-orange-300" />
            </div>
            <div className="min-w-0">
              <h2 id="etsy-dialog-title" className="text-sm font-black uppercase tracking-wider text-slate-100">Send Etsy Draft</h2>
              <p className="truncate text-xs text-slate-400">{shopName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Close Etsy draft dialog">
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          <div className="space-y-5 px-6 py-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-400" />
            <div>
              <h3 className="text-lg font-black text-slate-100">Draft created in Etsy</h3>
              <p className="mt-1 text-sm text-slate-400">Listing #{result.listingId} received {result.uploadedImages} images and {result.uploadedVideos} videos.</p>
            </div>
            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-left text-xs text-amber-200">
                {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
            <a href={result.managerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-orange-400">
              Open Etsy Listings <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-800 pb-4 text-xs text-slate-400">
              <span><strong className="text-slate-200">{imageCount}</strong> images ready</span>
              <span><strong className="text-slate-200">{videoCount}</strong> videos ready</span>
              <span>Saved as draft, not published</span>
            </div>

            {isLoadingOptions ? (
              <div className="flex h-32 items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading Etsy shop options
              </div>
            ) : (
              <>
                <div className="relative">
                  <label htmlFor="etsy-category" className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Etsy Category</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="etsy-category"
                      value={categoryQuery}
                      onChange={(event) => { setCategoryQuery(event.target.value); setSelectedTaxonomy(null); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && categoryMatches[0]) {
                          event.preventDefault();
                          selectTaxonomy(categoryMatches[0]);
                        }
                      }}
                      autoComplete="off"
                      placeholder="Search Etsy categories"
                      aria-expanded={categoryMatches.length > 0}
                      aria-controls="etsy-category-results"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition-colors focus:border-orange-500/60"
                    />
                  </div>
                  {selectedTaxonomy && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-300">
                      <CheckCircle className="h-3.5 w-3.5" /> Etsy category selected
                    </p>
                  )}
                  {categoryMatches.length > 0 && (
                    <div id="etsy-category-results" role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-xl">
                      {categoryMatches.map((item) => (
                        <button key={item.id} type="button" role="option" aria-selected={false} onClick={() => selectTaxonomy(item)} className="block w-full border-b border-slate-800 px-3 py-2 text-left text-xs text-slate-300 transition-colors last:border-0 hover:bg-slate-800 hover:text-white">
                          {item.path}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="etsy-price" className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Price</label>
                    <input id="etsy-price" type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-orange-500/60" />
                  </div>
                  <div>
                    <label htmlFor="etsy-quantity" className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Quantity</label>
                    <input id="etsy-quantity" type="number" min="1" max="999" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-orange-500/60" />
                  </div>
                  <div>
                    <label htmlFor="etsy-maker" className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Who Made It</label>
                    <select id="etsy-maker" value={whoMade} onChange={(event) => setWhoMade(event.target.value as EtsyDraftInput["whoMade"])} className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-orange-500/60">
                      <option value="i_did">I did</option>
                      <option value="collective">A member of my shop</option>
                      <option value="someone_else">Another company or person</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="etsy-made" className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">When Made</label>
                    <select id="etsy-made" value={whenMade} onChange={(event) => setWhenMade(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-orange-500/60">
                      <option value="made_to_order">Made to order</option>
                      <option value="2020_2026">2020-2026</option>
                      <option value="2010_2019">2010-2019</option>
                      <option value="2007_2009">2007-2009</option>
                      <option value="before_2007">Before 2007</option>
                    </select>
                  </div>
                  {readinessStates.length > 0 && (
                    <div className="sm:col-span-2">
                      <label htmlFor="etsy-readiness" className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Processing Profile</label>
                      <select id="etsy-readiness" value={readinessStateId || ""} onChange={(event) => setReadinessStateId(Number(event.target.value) || undefined)} className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-orange-500/60">
                        {readinessStates.map((item) => <option key={item.readinessStateId} value={item.readinessStateId}>{item.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={isSupply} onChange={(event) => setIsSupply(event.target.checked)} className="h-4 w-4 accent-orange-500" />
                  This item is a craft or party supply
                </label>
              </>
            )}

            {localError && <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">{localError}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={isLoadingOptions || isSubmitting} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isSubmitting ? "Sending Draft" : "Create Draft"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
