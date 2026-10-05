import { describe, expect, it } from "vitest";
import { CHECKLIST_ITEMS } from "@/content";
import { exportChecklistMarkdown } from "./DesignReviewChecklist";

describe("exportChecklistMarkdown", () => {
  it("marks a completed item with [x] and an incomplete item with [ ]", () => {
    const [first, second] = CHECKLIST_ITEMS;
    const md = exportChecklistMarkdown([first!, second!], new Set([first!.id]));
    expect(md).toContain(`[x] **${first!.title}**`);
    expect(md).toContain(`[ ] **${second!.title}**`);
  });

  it("groups items under their category as a Markdown heading", () => {
    const item = CHECKLIST_ITEMS[0]!;
    const md = exportChecklistMarkdown([item], new Set());
    expect(md).toContain(`## ${item.category}`);
  });

  it("the real CHECKLIST_ITEMS content has 49 items across 10 categories", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(49);
    const categories = new Set(CHECKLIST_ITEMS.map((i) => i.category));
    expect(categories.size).toBe(10);
  });
});
