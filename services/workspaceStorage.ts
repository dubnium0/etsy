import { ModelTier, ProductData, ShotStyleType } from "../types";

const DATABASE_NAME = "salesgenius-ai-studio";
const DATABASE_VERSION = 1;
const PRODUCTS_STORE = "products";
const SETTINGS_STORE = "settings";
const WORKSPACE_KEY = "current-workspace";

interface WorkspaceSettingsRecord {
  key: typeof WORKSPACE_KEY;
  activeProductId: string | null;
  modelTier: ModelTier;
  shotStyle: ShotStyleType;
  productOrder: string[];
  updatedAt: string;
}

export interface WorkspaceSnapshot {
  products: ProductData[];
  activeProductId: string | null;
  modelTier: ModelTier;
  shotStyle: ShotStyleType;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PRODUCTS_STORE)) {
        database.createObjectStore(PRODUCTS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the local workspace database."));
    request.onblocked = () => reject(new Error("The local workspace database is blocked by another open tab."));
  });
}

function restoreProduct(product: ProductData): ProductData {
  const assets = (product.assets || []).map((asset) => (
    asset.status === "generating" ? { ...asset, status: "pending" as const } : asset
  ));
  const hasCompletedOutput = Boolean(product.textContent) || assets.some(
    (asset) => asset.status === "completed" && Boolean(asset.url),
  );

  return {
    ...product,
    status: hasCompletedOutput ? "completed" : "idle",
    assets,
  };
}

export async function loadWorkspace(): Promise<WorkspaceSnapshot> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([PRODUCTS_STORE, SETTINGS_STORE], "readonly");
    const productsRequest = transaction.objectStore(PRODUCTS_STORE).getAll() as IDBRequest<ProductData[]>;
    const settingsRequest = transaction.objectStore(SETTINGS_STORE).get(WORKSPACE_KEY) as IDBRequest<WorkspaceSettingsRecord | undefined>;
    const [storedProducts, settings] = await Promise.all([
      requestResult(productsRequest),
      requestResult(settingsRequest),
      transactionDone(transaction),
    ]);

    const productMap = new Map(storedProducts.map((product) => [product.id, restoreProduct(product)]));
    const orderedProducts = settings?.productOrder
      .map((id) => productMap.get(id))
      .filter((product): product is ProductData => Boolean(product)) || [];
    const orderedIds = new Set(orderedProducts.map((product) => product.id));
    const remainingProducts = storedProducts
      .filter((product) => !orderedIds.has(product.id))
      .map(restoreProduct);
    const products = [...orderedProducts, ...remainingProducts];
    const activeProductId = settings?.activeProductId && products.some((product) => product.id === settings.activeProductId)
      ? settings.activeProductId
      : products[0]?.id || null;

    return {
      products,
      activeProductId,
      modelTier: settings?.modelTier || "economy",
      shotStyle: settings?.shotStyle || "creative_hero",
    };
  } finally {
    database.close();
  }
}

export async function saveWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  const database = await openDatabase();
  try {
    const keysTransaction = database.transaction(PRODUCTS_STORE, "readonly");
    const storedKeys = await requestResult(keysTransaction.objectStore(PRODUCTS_STORE).getAllKeys());
    await transactionDone(keysTransaction);

    const transaction = database.transaction([PRODUCTS_STORE, SETTINGS_STORE], "readwrite");
    const productStore = transaction.objectStore(PRODUCTS_STORE);
    const currentIds = new Set(snapshot.products.map((product) => product.id));

    for (const key of storedKeys) {
      if (typeof key === "string" && !currentIds.has(key)) productStore.delete(key);
    }
    for (const product of snapshot.products) productStore.put(product);

    const settings: WorkspaceSettingsRecord = {
      key: WORKSPACE_KEY,
      activeProductId: snapshot.activeProductId,
      modelTier: snapshot.modelTier,
      shotStyle: snapshot.shotStyle,
      productOrder: snapshot.products.map((product) => product.id),
      updatedAt: new Date().toISOString(),
    };
    transaction.objectStore(SETTINGS_STORE).put(settings);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function requestPersistentWorkspaceStorage(): Promise<void> {
  if (navigator.storage?.persist) await navigator.storage.persist();
}
