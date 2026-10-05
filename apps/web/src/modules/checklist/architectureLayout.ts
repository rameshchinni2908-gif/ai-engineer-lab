import type { ArchitectureEdge, ArchitectureNode } from "@/content/types";

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  node: ArchitectureNode;
}

export interface LayoutResult {
  positions: Map<string, NodePosition>;
  width: number;
  height: number;
  /** Edges whose `from`/`to` did not resolve to a declared node - should always be empty for real content; surfaced instead of silently dropped. */
  danglingEdges: ArchitectureEdge[];
}

const KIND_ORDER: ArchitectureNode["kind"][] = ["client", "service", "model", "store", "queue", "cache", "external"];
const COL_WIDTH = 190;
const ROW_HEIGHT = 80;
const MARGIN = 40;

/**
 * Pure column-by-kind layout: groups nodes into columns by `kind` (in a
 * fixed, readable order), stacks same-kind nodes vertically. Deterministic
 * given the same node list, so the diagram never jitters between renders.
 */
export function layoutArchitecture(nodes: ArchitectureNode[], edges: ArchitectureEdge[]): LayoutResult {
  const byKind = new Map<ArchitectureNode["kind"], ArchitectureNode[]>();
  for (const node of nodes) {
    const list = byKind.get(node.kind) ?? [];
    list.push(node);
    byKind.set(node.kind, list);
  }

  const positions = new Map<string, NodePosition>();
  let colIndex = 0;
  let maxRows = 1;
  for (const kind of KIND_ORDER) {
    const kindNodes = byKind.get(kind);
    if (!kindNodes || kindNodes.length === 0) continue;
    kindNodes.forEach((node, rowIndex) => {
      positions.set(node.id, {
        id: node.id,
        x: MARGIN + colIndex * COL_WIDTH,
        y: MARGIN + rowIndex * ROW_HEIGHT,
        node,
      });
    });
    maxRows = Math.max(maxRows, kindNodes.length);
    colIndex++;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const danglingEdges = edges.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to));

  return {
    positions,
    width: MARGIN * 2 + Math.max(colIndex, 1) * COL_WIDTH,
    height: MARGIN * 2 + maxRows * ROW_HEIGHT,
    danglingEdges,
  };
}
