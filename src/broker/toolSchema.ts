export const routeInferenceToolSchema = {
  name: "route_inference",
  description: "Route an agent task to a capable model, run pre-wallet spend checks, authorize paid routes through Cobo Agentic Wallet, and return an auditable receipt.",
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
        description: "Per-task inference spend cap checked before wallet authorization and recorded in the receipt."
      },
      allowed_providers: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Agent/provider allowlist used for pre-wallet routing and spend safety."
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
