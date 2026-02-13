import type { Node, Edge } from "reactflow";

export function toWasmInput(
  nodes: Node[],
  edges: Edge[]
): string {
  const V = nodes.length;
  const E = edges.length;

  const vertexLine = nodes.map((n) => n.id).join(" ");

  const edgeLines = edges.map((e) => {
    const wRaw = (e.data as any)?.w ?? e.label ?? 1;
    const w = Number.isFinite(Number(wRaw)) ? Number(wRaw) : 1;
    // edgeId src dst weight
    return `${e.id} ${e.source} ${e.target} ${w}`;
  });

  return `${V} ${E}\n${vertexLine}\n${edgeLines.join("\n")}\n`;
}
