import type { RouteInferenceResponse } from "../types.js";
import { writeJson } from "../utils/fs.js";

export async function saveReceipt(response: RouteInferenceResponse): Promise<RouteInferenceResponse> {
  await writeJson(response.receipt.receipt_path, response);
  return response;
}
