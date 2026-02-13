type WasmModuleFactory = (opts?: any) => Promise<any>;

let wasmPromise: Promise<any> | null = null;

async function loadWasmModule() {
  // Load the generated ES module from /public/wasm
  // Fetch the JS file and import it via a blob URL to avoid bundler issues.
  const jsUrl = "/wasm/kruskal_wasm.js";
  const resp = await fetch(jsUrl);
  if (!resp.ok) throw new Error(`Failed to fetch WASM loader: ${resp.status}`);

  const code = await resp.text();
  const blob = new Blob([code], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  const mod = await import(/* webpackIgnore: true */ blobUrl);
  URL.revokeObjectURL(blobUrl);

  // Emscripten MODULARIZE + EXPORT_ES6 exports a default factory
  const factory: WasmModuleFactory = mod.default;
  return factory({
    locateFile: (path: string) => {
      // Ensure the wasm file is found
      if (path.endsWith(".wasm")) return "/wasm/kruskal_wasm.wasm";
      return `/wasm/${path}`;
    },
  });
}

export async function getKruskalWasm() {
  if (!wasmPromise) wasmPromise = loadWasmModule();
  return wasmPromise;
}

export type KruskalStepResponse = {
  steps: Array<{
    consideredEdgeId: string;
    action: "accept" | "reject";
    reason: "ok" | "cycle";
    totalWeight: number;
    mstEdgeIds: string[];
    rejectedEdgeIds: string[];
  }>;
  mstWeight: number;
};

export async function runKruskalSteps(inputText: string): Promise<KruskalStepResponse> {
  const mod = await getKruskalWasm();
  const jsonStr: string = mod.runKruskalStepsJSON(inputText);
  return JSON.parse(jsonStr);
}
