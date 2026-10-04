import type { ChecklistItem, DesignScenario, LearningPathStep } from "../types";
import { productChecklistItems } from "./items-product";
import { qualityChecklistItems } from "./items-quality";
import { opsChecklistItems } from "./items-ops";
import { designScenariosA } from "./scenarios-a";
import { designScenariosB } from "./scenarios-b";
import { LEARNING_PATH as learningPathSteps } from "./learning-path";

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  ...productChecklistItems,
  ...qualityChecklistItems,
  ...opsChecklistItems,
];

export const DESIGN_SCENARIOS: DesignScenario[] = [...designScenariosA, ...designScenariosB];

export const LEARNING_PATH: LearningPathStep[] = learningPathSteps;
