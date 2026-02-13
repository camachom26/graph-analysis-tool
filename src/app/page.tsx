"use client";

import React, { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Edge as RFEdge,
  Node as RFNode,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";

import { toWasmInput } from "./lib/serialize";
import { runKruskalSteps, type KruskalStepResponse } from "./lib/kruskalWasm";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

type GraphJSON = {
  nodes: Array<{ id: string; label?: string; x?: number; y?: number }>;
  edges: Array<{ id: string; source: string; target: string; w: number }>;
};

function initialGraph() {
  const nodes: RFNode[] = [
    { id: "A", position: { x: 80, y: 120 }, data: { label: "A" } },
    { id: "B", position: { x: 280, y: 60 }, data: { label: "B" } },
    { id: "C", position: { x: 420, y: 220 }, data: { label: "C" } },
    { id: "D", position: { x: 200, y: 260 }, data: { label: "D" } },
  ];

  const edges: RFEdge[] = [
    { id: "e1", source: "A", target: "B", label: "2", data: { w: 2 } },
    { id: "e2", source: "B", target: "C", label: "6", data: { w: 6 } },
    { id: "e3", source: "C", target: "D", label: "1", data: { w: 1 } },
    { id: "e4", source: "A", target: "D", label: "5", data: { w: 5 } },
    { id: "e5", source: "B", target: "D", label: "3", data: { w: 3 } },
  ];

  return { nodes, edges };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function randInt(lo: number, hi: number) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function circleLayout(n: number, centerX = 260, centerY = 220, radius = 180) {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n;
    out.push({
      x: centerX + radius * Math.cos(ang),
      y: centerY + radius * Math.sin(ang),
    });
  }
  return out;
}

function makeRandomGraph(opts: {
  n: number;
  density: number; // 0..1, probability of an edge for each pair
  wMin: number;
  wMax: number;
  connected: boolean;
}): { nodes: RFNode[]; edges: RFEdge[] } {
  const n = clamp(Math.floor(opts.n), 2, 30);
  const density = clamp(opts.density, 0, 1);
  const wMin = Math.min(opts.wMin, opts.wMax);
  const wMax = Math.max(opts.wMin, opts.wMax);

  const positions = circleLayout(n);
  const nodes: RFNode[] = Array.from({ length: n }).map((_, i) => {
    const id = `N${i + 1}`;
    return {
      id,
      position: { x: positions[i].x, y: positions[i].y },
      data: { label: id },
    };
  });

  const edges: RFEdge[] = [];
  const used = new Set<string>(); // prevent duplicates (undirected)

  const addUndirectedEdge = (a: string, b: string, w: number) => {
    if (a === b) return;
    const key = a < b ? `${a}__${b}` : `${b}__${a}`;
    if (used.has(key)) return;
    used.add(key);
    const id = uid("e");
    edges.push({
      id,
      source: a,
      target: b,
      label: String(w),
      data: { w },
    });
  };

  // If connected requested: first add a random spanning tree
  if (opts.connected) {
    for (let i = 1; i < n; i++) {
      const a = nodes[i].id;
      const b = nodes[randInt(0, i - 1)].id;
      addUndirectedEdge(a, b, randInt(wMin, wMax));
    }
  }

  // Then sprinkle additional edges by density
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i].id;
      const b = nodes[j].id;
      const key = `${a}__${b}`;
      if (used.has(key)) continue;
      if (Math.random() < density) {
        addUndirectedEdge(a, b, randInt(wMin, wMax));
      }
    }
  }

  return { nodes, edges };
}

/** -------------------- JSON helpers -------------------- **/
function exportGraphJSON(nodes: RFNode[], edges: RFEdge[]): GraphJSON {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: String((n.data as any)?.label ?? n.id),
      x: n.position.x,
      y: n.position.y,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      w: Number((e.data as any)?.w ?? e.label ?? 1),
    })),
  };
}

function importGraphJSON(raw: string): { nodes: RFNode[]; edges: RFEdge[] } {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON (could not parse).");
  }

  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('JSON must have shape: { "nodes": [...], "edges": [...] }');
  }

  const nodeIds = new Set<string>();
  const nodes: RFNode[] = parsed.nodes.map((n: any, idx: number) => {
    if (!n?.id || typeof n.id !== "string") throw new Error(`Node at index ${idx} missing string id.`);
    if (nodeIds.has(n.id)) throw new Error(`Duplicate node id: ${n.id}`);
    nodeIds.add(n.id);

    const x = Number.isFinite(Number(n.x)) ? Number(n.x) : 80 + (idx % 8) * 80;
    const y = Number.isFinite(Number(n.y)) ? Number(n.y) : 80 + Math.floor(idx / 8) * 80;

    return {
      id: n.id,
      position: { x, y },
      data: { label: typeof n.label === "string" ? n.label : n.id },
    };
  });

  const edgeIds = new Set<string>();
  const edges: RFEdge[] = parsed.edges.map((e: any, idx: number) => {
    if (!e?.id || typeof e.id !== "string") throw new Error(`Edge at index ${idx} missing string id.`);
    if (edgeIds.has(e.id)) throw new Error(`Duplicate edge id: ${e.id}`);
    edgeIds.add(e.id);

    if (!e.source || typeof e.source !== "string") throw new Error(`Edge ${e.id} missing source.`);
    if (!e.target || typeof e.target !== "string") throw new Error(`Edge ${e.id} missing target.`);
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      throw new Error(`Edge ${e.id} refers to unknown node(s): ${e.source}, ${e.target}`);
    }

    const w = Number(e.w);
    if (!Number.isFinite(w)) throw new Error(`Edge ${e.id} has invalid weight w.`);

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: String(w),
      data: { w },
    };
  });

  return { nodes, edges };
}

export default function Page() {
  const init = initialGraph();
  const [nodes, setNodes, onNodesChange] = useNodesState(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(init.edges);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [kruskal, setKruskal] = useState<KruskalStepResponse | null>(null);
  const [stepIndex, setStepIndex] = useState(-1);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Random graph controls
  const [randN, setRandN] = useState(8);
  const [randDensity, setRandDensity] = useState(0.25);
  const [randWMin, setRandWMin] = useState(1);
  const [randWMax, setRandWMax] = useState(20);
  const [randConnected, setRandConnected] = useState(true);

  // JSON import/export
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(exportGraphJSON(init.nodes, init.edges), null, 2)
  );
  const [jsonMsg, setJsonMsg] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    setKruskal(null);
    setStepIndex(-1);
    setError(null);
  }, []);

  // --- Extra post-final step (gray last considered edge) ---
  const displayStepsLen = useMemo(() => {
    if (!kruskal) return 0;
    return kruskal.steps.length + 1;
  }, [kruskal]);

  const isPostFinalStep = useMemo(() => {
    if (!kruskal) return false;
    return stepIndex === kruskal.steps.length;
  }, [kruskal, stepIndex]);

  const current = useMemo(() => {
    if (!kruskal) return null;
    if (stepIndex < 0) return null;
    if (stepIndex >= kruskal.steps.length) return kruskal.steps[kruskal.steps.length - 1] ?? null;
    return kruskal.steps[stepIndex] ?? null;
  }, [kruskal, stepIndex]);

  const mstSet = useMemo(() => new Set(current?.mstEdgeIds ?? []), [current]);
  const rejectedSet = useMemo(() => new Set(current?.rejectedEdgeIds ?? []), [current]);
  const consideredId = current?.consideredEdgeId ?? null;

  const finalGrayEdgeId = isPostFinalStep ? consideredId : null;

  const styledEdges: RFEdge[] = useMemo(() => {
    return edges.map((e) => {
      const isMst = mstSet.has(e.id);
      const isRejected = rejectedSet.has(e.id);
      const isConsidered = consideredId === e.id;
      const isFinalGray = finalGrayEdgeId === e.id;

      const style: React.CSSProperties = {
        strokeWidth: isConsidered ? 5 : isMst ? 4 : 1.5,
        opacity: isMst || isConsidered ? 1 : isRejected ? 0.15 : 0.45,
        // if final gray edge, force solid even if it was rejected
        strokeDasharray: isFinalGray ? undefined : isRejected ? "6 4" : undefined,
        stroke: isFinalGray ? "#9CA3AF" : undefined,
      };

      return {
        ...e,
        animated: isConsidered && current?.action === "accept" && !isFinalGray,
        style,
      };
    });
  }, [edges, mstSet, rejectedSet, consideredId, current, finalGrayEdgeId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // Optional: prevent self-loops
      if (connection.source && connection.target && connection.source === connection.target) return;

      const id = uid("e");
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id,
            label: "1",
            data: { w: 1 },
          },
          eds
        )
      );
      invalidate();
    },
    [setEdges, invalidate]
  );

  const onSelectionChange = useCallback((sel: { nodes?: RFNode[]; edges?: RFEdge[] }) => {
    setSelectedNodeId(sel.nodes?.[0]?.id ?? null);
    setSelectedEdgeId(sel.edges?.[0]?.id ?? null);
  }, []);

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) ?? null : null),
    [edges, selectedEdgeId]
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId]
  );

  const selectedWeight = useMemo(() => {
    if (!selectedEdge) return "";
    const w = (selectedEdge.data as any)?.w ?? selectedEdge.label ?? "";
    return String(w);
  }, [selectedEdge]);

  const updateSelectedEdgeWeight = useCallback(
    (value: string) => {
      const parsed = Number(value);
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== selectedEdgeId) return e;
          const w = Number.isFinite(parsed) ? parsed : 1;
          return { ...e, label: String(w), data: { ...(e.data as any), w } };
        })
      );
      invalidate();
    },
    [selectedEdgeId, setEdges, invalidate]
  );

  const selectedNodeLabel = useMemo(() => {
    if (!selectedNode) return "";
    return String((selectedNode.data as any)?.label ?? selectedNode.id);
  }, [selectedNode]);

  const updateSelectedNodeLabel = useCallback(
    (value: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, label: value } } : n))
      );
    },
    [selectedNodeId, setNodes]
  );

  const addNode = useCallback(() => {
    const id = uid("N");
    setNodes((nds) => [
      ...nds,
      {
        id,
        position: { x: 100 + Math.random() * 350, y: 80 + Math.random() * 300 },
        data: { label: id },
      },
    ]);
    invalidate();
  }, [setNodes, invalidate]);

  const deleteSelected = useCallback(() => {
    if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      invalidate();
      return;
    }
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
      invalidate();
    }
  }, [selectedEdgeId, selectedNodeId, setEdges, setNodes, invalidate]);

  const compute = useCallback(async () => {
    setIsComputing(true);
    setError(null);
    try {
      const input = toWasmInput(nodes, edges);
      const result = await runKruskalSteps(input);
      setKruskal(result);
      setStepIndex(-1);
    } catch (e: any) {
      setError(e?.message ?? "Failed to run WASM");
      setKruskal(null);
      setStepIndex(-1);
    } finally {
      setIsComputing(false);
    }
  }, [nodes, edges]);

  // Random graph action
  const generateRandom = useCallback(() => {
    const g = makeRandomGraph({
      n: randN,
      density: randDensity,
      wMin: randWMin,
      wMax: randWMax,
      connected: randConnected,
    });
    setNodes(g.nodes);
    setEdges(g.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    invalidate();
    // refresh JSON text to match
    const j = exportGraphJSON(g.nodes, g.edges);
    setJsonText(JSON.stringify(j, null, 2));
    setJsonMsg("Generated random graph.");
  }, [randN, randDensity, randWMin, randWMax, randConnected, setNodes, setEdges, invalidate]);

  // JSON actions
  const refreshJsonFromCurrent = useCallback(() => {
    const j = exportGraphJSON(nodes, edges);
    setJsonText(JSON.stringify(j, null, 2));
    setJsonMsg("Exported current graph to JSON.");
  }, [nodes, edges]);

  const loadJson = useCallback(() => {
    try {
      const g = importGraphJSON(jsonText);
      setNodes(g.nodes);
      setEdges(g.edges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      invalidate();
      setJsonMsg("Imported JSON graph successfully.");
      setError(null);
    } catch (e: any) {
      setJsonMsg(null);
      setError(e?.message ?? "Failed to import JSON.");
    }
  }, [jsonText, setNodes, setEdges, invalidate]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setJsonMsg("Copied JSON to clipboard.");
    } catch {
      setJsonMsg("Could not copy to clipboard (browser blocked it).");
    }
  }, [jsonText]);

  // UI step controls
  const canStepForward = !!kruskal && stepIndex < displayStepsLen - 1;
  const canStepBack = stepIndex > -1;
  const totalWeight = current?.totalWeight ?? 0;

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1fr_420px]">
      <div className="h-[70vh] lg:h-screen">
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      <aside className="p-4 border-l space-y-4 overflow-y-auto">
        <div>
          <h1 className="text-xl font-semibold">Graph Analysis Tool</h1>
          <p className="text-sm text-gray-600">
            Edit, generate, or import a graph — then compute and step through Kruskal’s MST (C++ → WASM).
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button className="px-3 py-2 rounded-md border" onClick={addNode}>
            Add Node
          </button>
          <button className="px-3 py-2 rounded-md border" onClick={deleteSelected}>
            Delete Selected
          </button>
          <button
            className="px-3 py-2 rounded-md border disabled:opacity-50"
            onClick={compute}
            disabled={isComputing}
          >
            {isComputing ? "Computing..." : "Compute MST"}
          </button>
        </div>

        {error ? <div className="p-3 rounded-lg border text-sm text-red-600">{error}</div> : null}
        {jsonMsg ? <div className="p-3 rounded-lg border text-sm text-gray-700">{jsonMsg}</div> : null}

        {/* Stepper */}
        <div className="p-3 rounded-lg border space-y-2">
          <div className="text-sm">
            <div>
              <span className="font-medium">Step:</span> {stepIndex + 1} / {displayStepsLen}
            </div>
            <div>
              <span className="font-medium">MST Weight (so far):</span> {totalWeight}
            </div>
          </div>

          {current ? (
            <div className="text-sm">
              <div className="font-medium">Considering edge:</div>
              <div>
                <span className="font-mono">{current.consideredEdgeId}</span>{" "}
                {isPostFinalStep ? (
                  <span className="text-gray-600">→ POST (gray out last considered edge)</span>
                ) : (
                  <span>
                    → {current.action.toUpperCase()} {current.reason === "cycle" ? "(cycle)" : ""}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              Press <span className="font-medium">Compute MST</span> then Step.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-md border disabled:opacity-50"
            disabled={!canStepBack}
            onClick={() => setStepIndex((i) => Math.max(-1, i - 1))}
          >
            Back
          </button>
          <button
            className="px-3 py-2 rounded-md border disabled:opacity-50"
            disabled={!canStepForward}
            onClick={() => setStepIndex((i) => Math.min(displayStepsLen - 1, i + 1))}
          >
            Step
          </button>
          <button
            className="px-3 py-2 rounded-md border disabled:opacity-50"
            disabled={!kruskal}
            onClick={() => setStepIndex(displayStepsLen - 1)}
          >
            Run
          </button>
          <button className="px-3 py-2 rounded-md border" onClick={() => setStepIndex(-1)}>
            Reset
          </button>
        </div>

        {/* Edit selection */}
        <div className="p-3 rounded-lg border space-y-2">
          <div className="font-medium text-sm">Edit Selection</div>

          {selectedNode ? (
            <div className="space-y-1">
              <div className="text-xs text-gray-600">Node label (display only):</div>
              <input
                className="w-full border rounded-md px-2 py-1"
                value={selectedNodeLabel}
                onChange={(e) => updateSelectedNodeLabel(e.target.value)}
              />
            </div>
          ) : selectedEdge ? (
            <div className="space-y-1">
              <div className="text-xs text-gray-600">Edge weight:</div>
              <input
                className="w-full border rounded-md px-2 py-1"
                value={selectedWeight}
                onChange={(e) => updateSelectedEdgeWeight(e.target.value)}
                inputMode="numeric"
              />
              <div className="text-xs text-gray-500">
                Edge ID: <span className="font-mono">{selectedEdge.id}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">Click a node or edge to edit it.</div>
          )}

          <div className="text-xs text-gray-500">
            Any edit invalidates the computed timeline (press Compute MST again).
          </div>
        </div>

        {/* Random graph controls */}
        <div className="p-3 rounded-lg border space-y-3">
          <div className="font-medium text-sm">Random Graph</div>

          <label className="block text-xs text-gray-600">
            Nodes: {randN}
            <input
              className="w-full"
              type="range"
              min={2}
              max={30}
              value={randN}
              onChange={(e) => setRandN(Number(e.target.value))}
            />
          </label>

          <label className="block text-xs text-gray-600">
            Density: {randDensity.toFixed(2)}
            <input
              className="w-full"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={randDensity}
              onChange={(e) => setRandDensity(Number(e.target.value))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-600">
              Min weight
              <input
                className="w-full border rounded-md px-2 py-1"
                value={randWMin}
                onChange={(e) => setRandWMin(Number(e.target.value))}
                inputMode="numeric"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Max weight
              <input
                className="w-full border rounded-md px-2 py-1"
                value={randWMax}
                onChange={(e) => setRandWMax(Number(e.target.value))}
                inputMode="numeric"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={randConnected}
              onChange={(e) => setRandConnected(e.target.checked)}
            />
            Force connected graph
          </label>

          <button className="w-full px-3 py-2 rounded-md border" onClick={generateRandom}>
            Generate Random Graph
          </button>

          <div className="text-xs text-gray-500">
            Tip: set density ~0.15–0.35 for readable demos.
          </div>
        </div>

        {/* JSON import/export */}
        <div className="p-3 rounded-lg border space-y-2">
          <div className="font-medium text-sm">Import / Export JSON</div>
          <div className="text-xs text-gray-600">
            Format:
            <span className="font-mono">{" { nodes:[{id,label,x,y}], edges:[{id,source,target,w}] }"}</span>
          </div>

          <textarea
            className="w-full h-48 border rounded-md p-2 font-mono text-xs"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />

          <div className="flex gap-2 flex-wrap">
            <button className="px-3 py-2 rounded-md border" onClick={loadJson}>
              Import JSON
            </button>
            <button className="px-3 py-2 rounded-md border" onClick={refreshJsonFromCurrent}>
              Export Current
            </button>
            <button className="px-3 py-2 rounded-md border" onClick={copyJson}>
              Copy JSON
            </button>
          </div>

          <div className="text-xs text-gray-500">
            Importing replaces the current graph and resets the stepper.
          </div>
        </div>
      </aside>
    </div>
  );
}
