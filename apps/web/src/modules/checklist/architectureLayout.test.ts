import { describe, expect, it } from "vitest";
import { DESIGN_SCENARIOS } from "@/content";
import { layoutArchitecture } from "./architectureLayout";

describe("layoutArchitecture", () => {
  it("places every node at a unique, non-negative position", () => {
    const { nodes, edges } = DESIGN_SCENARIOS[0]!.referenceArchitecture;
    const { positions } = layoutArchitecture(nodes, edges);
    expect(positions.size).toBe(nodes.length);
    const seen = new Set<string>();
    for (const pos of positions.values()) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      const key = `${pos.x},${pos.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("reports zero dangling edges for every real DESIGN_SCENARIOS reference architecture", () => {
    for (const scenario of DESIGN_SCENARIOS) {
      const { nodes, edges } = scenario.referenceArchitecture;
      const { danglingEdges } = layoutArchitecture(nodes, edges);
      expect(danglingEdges).toEqual([]);
    }
  });

  it("flags a dangling edge whose endpoint has no declared node", () => {
    const { danglingEdges } = layoutArchitecture(
      [{ id: "a", label: "A", kind: "client" }],
      [{ from: "a", to: "does-not-exist" }],
    );
    expect(danglingEdges).toHaveLength(1);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const { nodes, edges } = DESIGN_SCENARIOS[0]!.referenceArchitecture;
    const a = layoutArchitecture(nodes, edges);
    const b = layoutArchitecture(nodes, edges);
    expect([...a.positions.values()]).toEqual([...b.positions.values()]);
  });
});
