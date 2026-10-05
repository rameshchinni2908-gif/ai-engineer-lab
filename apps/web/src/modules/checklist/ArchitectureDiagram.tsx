import type { ArchitectureEdge, ArchitectureNode } from "@/content/types";
import { layoutArchitecture } from "./architectureLayout";

const KIND_FILL: Record<ArchitectureNode["kind"], string> = {
  client: "fill-sky-100 stroke-sky-500 dark:fill-sky-950 dark:stroke-sky-400",
  service: "fill-violet-100 stroke-violet-500 dark:fill-violet-950 dark:stroke-violet-400",
  store: "fill-amber-100 stroke-amber-500 dark:fill-amber-950 dark:stroke-amber-400",
  model: "fill-emerald-100 stroke-emerald-500 dark:fill-emerald-950 dark:stroke-emerald-400",
  queue: "fill-rose-100 stroke-rose-500 dark:fill-rose-950 dark:stroke-rose-400",
  cache: "fill-cyan-100 stroke-cyan-500 dark:fill-cyan-950 dark:stroke-cyan-400",
  external: "fill-muted stroke-muted-foreground",
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;

/**
 * Readable node/edge reference-architecture diagram (SVG). Every edge
 * endpoint is required to resolve to a declared node - `layoutArchitecture`
 * surfaces (never silently drops) any that don't, per CLAUDE.md's "never
 * present invented/incorrect structure" spirit applied to a diagram.
 */
export function ArchitectureDiagram({
  nodes,
  edges,
}: {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}): JSX.Element {
  const { positions, width, height, danglingEdges } = layoutArchitecture(nodes, edges);
  const validEdges = edges.filter((e) => positions.has(e.from) && positions.has(e.to));

  return (
    <div className="overflow-x-auto rounded-lg border border-border p-2">
      <svg
        role="img"
        aria-label={`Reference architecture diagram with ${nodes.length} components and ${validEdges.length} connections`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-full"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground" />
          </marker>
        </defs>

        {validEdges.map((edge, i) => {
          const from = positions.get(edge.from)!;
          const to = positions.get(edge.to)!;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="stroke-foreground/50"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
              {edge.label && (
                <text x={midX} y={midY - 4} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {[...positions.values()].map((pos) => (
          <g key={pos.id}>
            <rect
              x={pos.x}
              y={pos.y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={8}
              className={KIND_FILL[pos.node.kind]}
              strokeWidth={1.5}
            />
            <foreignObject x={pos.x + 4} y={pos.y + 4} width={NODE_WIDTH - 8} height={NODE_HEIGHT - 8}>
              <div className="flex h-full flex-col items-center justify-center text-center text-[10px] leading-tight text-foreground">
                <span className="font-medium">{pos.node.label}</span>
                <span className="text-muted-foreground">{pos.node.kind}</span>
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>

      {danglingEdges.length > 0 && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {danglingEdges.length} edge(s) reference a node id not declared in this diagram and were
          not drawn - this indicates a content authoring error.
        </p>
      )}
    </div>
  );
}
