import type { RouteInferenceResponse } from "../types.js";
import { writeJson } from "../utils/fs.js";
import { sha256 } from "../utils/hash.js";

export function receiptHash(response: RouteInferenceResponse): string {
  return sha256(
    JSON.stringify({
      ...response,
      reconciliation: {
        ...response.reconciliation,
        evidence: {
          ...response.reconciliation.evidence,
          receipt_hash: ""
        }
      },
      receipt: {
        ...response.receipt,
        receipt_hash: ""
      }
    })
  );
}

export async function saveReceipt(response: RouteInferenceResponse): Promise<RouteInferenceResponse> {
  const signedResponse: RouteInferenceResponse = {
    ...response,
    reconciliation: {
      ...response.reconciliation,
      evidence: {
        ...response.reconciliation.evidence,
        receipt_hash: receiptHash(response)
      }
    },
    receipt: {
      ...response.receipt,
      receipt_hash: receiptHash(response)
    }
  };
  await writeJson(signedResponse.receipt.archive_path, signedResponse);
  await writeJson(signedResponse.receipt.receipt_path, signedResponse);
  return signedResponse;
}
