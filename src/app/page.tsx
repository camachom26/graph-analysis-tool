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

import { toWasmInput } from "@/lib/serialize";
import { runKruskalSteps, type KruskalStepResponse } from "@/lib/kruskalWasm";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

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

  const current = useMemo(() => {
    if (!kruskal) return null;
    if (stepIndex < 0) return null;
    return kruskal.steps[stepIndex] ?? null;
  }, [kruskal, stepIndex]);

  const mstSet = useMemo(() => new Set(current?.mstEdgeIds ?? []), [current]);
  const rejectedSet = useMemo(() => new Set(current?.rejectedEdgeIds ?? []), [current]);
  const consideredId = current?.consideredEdgeId ?? null;

  const styledEdges: RFEdge[] = useMemo(() => {
    return edges.map((e) => {
      const isMst = mstSet.has(e.id);
      const isRejected = rejectedSet.has(e.id);
      const isConsidered = consideredId === e.id;

      const style: React.CSSProperties = {
        strokeWidth: isConsidered ? 5 : isMst ? 4 : 1.5,
        opacity: isMst || isConsidered ? 1 : isRejected ? 0.15 : 0.45,
        strokeDasharray: isRejected ? "6 4" : undefined,
      };

      return {
        ...e,
        animated: isConsidered && current?.action === "accept",
        style,
      };
    });
  }, [edges, mstSet, rejectedSet, consideredId, current]);

  const invalidate = useCallback(() => {
    setKruskal(null);
    setStepIndex(-1);
    setError(null);
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
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

  const canStepForward = !!kruskal && stepIndex < kruskal.steps.length - 1;
  const canStepBack = stepIndex > -1;
  const totalWeight = current?.totalWeight ?? 0;
  const totalSteps = kruskal?.steps.length ?? 0;

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1fr_390px]">
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

      <aside className="p-4 border-l space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Graph Analysis Tool</h1>
          <p className="text-sm text-gray-600">
            Edit the graph, then compute and step through Kruskal’s MST (C++ → WASM).
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

        {error ? (
          <div className="p-3 rounded-lg border text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div className="p-3 rounded-lg border space-y-2">
          <div className="text-sm">
            <div>
              <span className="font-medium">Step:</span> {stepIndex + 1} / {totalSteps}
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
                → {current.action.toUpperCase()} {current.reason === "cycle" ? "(cycle)" : ""}
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
            onClick={() => setStepIndex((i) => Math.min((kruskal?.steps.length ?? 1) - 1, i + 1))}
          >
            Step
          </button>
          <button
            className="px-3 py-2 rounded-md border disabled:opacity-50"
            disabled={!kruskal}
            onClick={() => setStepIndex((kruskal?.steps.length ?? 1) - 1)}
          >
            Run
          </button>
          <button className="px-3 py-2 rounded-md border" onClick={() => setStepIndex(-1)}>
            Reset
          </button>
        </div>

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
      </aside>
    </div>
  );
}
