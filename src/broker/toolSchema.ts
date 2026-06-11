export const routeInferenceToolSchema = {
  name: "route_inference",
  description: "Route an agent task to a capable model and pay through a policy-bound Cobo Agentic Wallet.",
  input_schema: {
    type: "object",
    required: ["prompt", "routing_mode", "max_spend_usd", "allowed_providers"],
    properties: {
      prompt: {
        type: "string",
        description: "Task prompt from the autonomous agent or user."
      },
      routing_mode: {
        type: "string",
        enum: ["cheapest_capable", "fastest_capable", "quality_first"],
        description: "Routing preference applied after capability filtering."
      },
      max_spend_usd: {
        type: "number",
        minimum: 0,
        description: "Per-task inference spend cap enforced by wallet policy."
      },
      allowed_providers: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Caller/provider allowlist. Cobo policy also enforces deny-by-default provider boundaries."
      },
      require_receipt: {
        type: "boolean",
        description: "When true, persist a receipt JSON file and include receipt paths in the response."
      },
      idempotency_key: {
        type: "string",
        description: "Caller-supplied replay key for demo and future payment idempotency."
      }
    }
  }
} as const;
