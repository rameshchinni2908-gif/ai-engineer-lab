import { findModel } from "@ail/shared";
import { unprocessableError } from "../../middleware/errors.js";

/**
 * `POST /advanced/multimodal-demo` capability gate. Per contracts §4 M10:
 * "422 if the chosen model's `ModelInfo.supportsVision` is false" - a
 * documented per-model fact looked up from the catalog, never assumed from
 * a model family's general reputation.
 */
export function assertVisionCapable(model: string): void {
  const info = findModel(model);
  if (!info || !info.supportsVision) {
    throw unprocessableError(
      `Model "${model}" does not support vision input (ModelInfo.supportsVision is false or the model is unknown).`,
    );
  }
}
