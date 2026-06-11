export function timelineHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CoboRouter</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --ink: #17202a;
      --muted: #667085;
      --line: #d0d5dd;
      --panel: #ffffff;
      --accent: #1769aa;
      --good: #087443;
      --bad: #b42318;
      --warn: #b54708;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    header {
      padding: 24px 28px 18px;
      border-bottom: 1px solid var(--line);
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand img {
      width: 52px;
      height: 52px;
    }
    h1 { margin: 0; font-size: 24px; line-height: 1.15; }
    .pitch { margin: 6px 0 0; color: var(--muted); max-width: 880px; }
    .trustbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      max-width: 540px;
    }
    .trustbar span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 900;
      background: #f8fafc;
    }
    main {
      display: grid;
      grid-template-columns: minmax(280px, 360px) 1fr;
      gap: 20px;
      padding: 20px;
    }
    aside, section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }
    label { display: block; font-weight: 700; margin: 14px 0 6px; }
    textarea, input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      font: inherit;
      background: #fff;
    }
    textarea { min-height: 210px; resize: vertical; }
    button {
      border: 0;
      border-radius: 6px;
      padding: 11px 14px;
      font-weight: 800;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
    }
    button.secondary { background: #344054; }
    .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .actions.edge-actions { grid-template-columns: 1fr; }
    .policy {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
    }
    .timeline {
      display: grid;
      gap: 12px;
    }
    .node {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      display: grid;
      gap: 8px;
      background: #fff;
    }
    .node h3 { margin: 0; font-size: 16px; }
    .node p { margin: 0; color: var(--muted); }
    .status {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .02em;
    }
    .blocked { color: #fff; background: var(--bad); }
    .approved { color: #fff; background: var(--good); }
    .pending { color: #fff; background: var(--warn); }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    pre {
      margin: 0;
      background: #101828;
      color: #f2f4f7;
      border-radius: 8px;
      padding: 12px;
      overflow: auto;
      max-height: 320px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 8px 6px;
      text-align: left;
    }
    @media (max-width: 820px) {
      main { grid-template-columns: 1fr; }
      header { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <img src="/favicon.svg" alt="" />
      <div>
        <h1>CoboRouter</h1>
        <p class="pitch">Wallet-governed inference procurement for autonomous agents: route the prompt, authorize spend, settle through Cobo, and return a verifiable receipt.</p>
      </div>
    </div>
    <div class="trustbar" aria-label="CoboRouter proof points">
      <span>Live Z.AI route</span>
      <span>Cobo policy authority</span>
      <span>On-chain proof</span>
      <span>Immutable receipt archive</span>
    </div>
  </header>
  <main>
    <aside>
      <label for="prompt">Agent Task</label>
      <textarea id="prompt">Plan a 3-step treasury action for an autonomous DAO agent with $1,000 USDC.
Compare these two provided low-risk DeFi yield options, explain the risks, and recommend one:
Option A: USDC lending on approved protocol fixture, 4.2% estimated APY, high liquidity, audited.
Option B: USDC vault on approved protocol fixture, 6.1% estimated APY, medium liquidity, audited.
Use a reasoning-capable model only if needed and return a wallet/payment receipt.</textarea>
      <label for="budget">Task budget</label>
      <input id="budget" type="number" value="0.03" min="0" step="0.01" />
      <div class="policy">
        <span>Allowed: Z.AI family</span>
        <span>Human approval: $0.50</span>
        <span>Asset: USDC</span>
        <span>Mode: cheapest</span>
      </div>
      <div class="actions">
        <button id="approved">Run live approved route</button>
        <button id="blocked" class="secondary">Budget block</button>
      </div>
      <div class="actions edge-actions">
        <button id="budget-declined" class="secondary">Budget declined</button>
        <button id="provider-not-allowlisted" class="secondary">Provider denied</button>
        <button id="human-approval" class="secondary">Human approval</button>
        <button id="settlement-failure" class="secondary">Settlement failure</button>
        <button id="local" class="secondary">Local model</button>
        <button id="simple-zai" class="secondary">Z.AI Flash</button>
      </div>
    </aside>
    <section>
      <div class="timeline" id="timeline"></div>
    </section>
  </main>
  <script>
    const timeline = document.getElementById("timeline");
    const promptInput = document.getElementById("prompt");
    const budgetInput = document.getElementById("budget");
    const initialScenario = new URLSearchParams(window.location.search).get("scenario") === "approved" ? "approved" : "blocked";
    let latestReceiptJson = "";
    const zaiProviderIds = [
      "zai",
      "zai_glm_5_turbo",
      "zai_glm_5",
      "zai_glm_4_7",
      "zai_flash",
      "zai_glm_4_7_flashx",
      "zai_glm_4_6",
      "zai_glm_4_5",
      "zai_glm_4_5_air",
      "zai_glm_4_5_x",
      "zai_glm_4_5_airx",
      "zai_glm_4_5_flash",
      "zai_glm_4_32b_128k"
    ];

    function esc(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function node(title, body, status, detail = "") {
      const statusHtml = status ? '<span class="status ' + status.className + '">' + status.label + '</span>' : "";
      return '<article class="node"><h3>' + esc(title) + '</h3>' + statusHtml + '<p>' + esc(body) + '</p>' + detail + '</article>';
    }

    function quoteTable(trace) {
      return '<table><thead><tr><th>Provider</th><th>Tokens</th><th>Quote</th><th>Decision</th><th>Reason</th></tr></thead><tbody>' +
        trace.map(row => '<tr><td>' + esc(row.provider_id) + '</td><td>' + esc(row.estimated_input_tokens + "/" + row.estimated_output_tokens) + '</td><td>$' + row.estimated_cost_usd.toFixed(4) + '</td><td>' + esc(row.decision) + '</td><td>' + esc(row.reason) + '</td></tr>').join("") +
        '</tbody></table>';
    }

    function receiptTools() {
      return '<div class="actions"><button id="copy-receipt" type="button">Copy Receipt</button><button id="download-receipt" class="secondary" type="button">Download JSON</button></div>';
    }

    function setScenarioPrompt(scenario) {
      if (scenario === "local") {
        promptInput.value = "LOCAL-ONLY PRIVATE TASK.\\nSummarize this confidential agent wallet memo in one sentence without using any network provider:\\nThe agent should pause new paid inference if the task budget is below the quoted provider cost.";
        budgetInput.value = "0";
        return;
      }
      if (scenario === "simple_zai") {
        promptInput.value = "Summarize this product in one friendly sentence: CoboRouter helps agents choose and pay for inference under wallet policy.";
        budgetInput.value = "0.01";
        return;
      }
      promptInput.value = "Plan a 3-step treasury action for an autonomous DAO agent with $1,000 USDC.\\nCompare these two provided low-risk DeFi yield options, explain the risks, and recommend one:\\nOption A: USDC lending on approved protocol fixture, 4.2% estimated APY, high liquidity, audited.\\nOption B: USDC vault on approved protocol fixture, 6.1% estimated APY, medium liquidity, audited.\\nUse a reasoning-capable model only if needed and return a wallet/payment receipt.";
      budgetInput.value = scenario === "approved" ? "0.25" : "0.02";
      if (scenario === "provider_not_allowlisted" || scenario === "human_approval" || scenario === "settlement_failure") {
        budgetInput.value = "0.25";
      }
    }

    function paymentDetail(payment) {
      const tx = payment.tx_hash && payment.explorer_url
        ? '<br>tx: <a href="' + esc(payment.explorer_url) + '" target="_blank" rel="noreferrer">' + esc(payment.tx_hash) + '</a>'
        : '<br>tx: ' + esc(payment.tx_hash || "none");
      return '<p class="mono">operation: ' + esc(payment.operation_id || "none") + '<br>reference: ' + esc(payment.payment_reference || "none") + tx + '</p>';
    }

    function render(response) {
      latestReceiptJson = JSON.stringify(response, null, 2);
      const blocked = response.status === "blocked" || response.status === "requires_human_approval" || response.status === "paid_failed" || response.status === "failed";
      const walletStatus = response.status === "requires_human_approval"
        ? { className: "pending", label: "HUMAN APPROVAL REQUIRED" }
        : response.status === "paid_failed" || response.status === "failed"
          ? { className: "blocked", label: "FAILED SAFELY" }
          : response.status === "blocked"
            ? { className: "blocked", label: "BLOCKED BY WALLET POLICY" }
            : { className: "approved", label: "APPROVED BY WALLET POLICY" };
      const paymentStatus = response.payment.status === "settled"
        ? { className: "approved", label: "ON-CHAIN PROOF" }
        : response.payment.status === "failed"
          ? { className: "blocked", label: "SETTLEMENT FAILED SAFELY" }
          : response.payment.status === "not_created"
            ? { className: "blocked", label: "NO SPEND" }
            : { className: "pending", label: response.payment.status.toUpperCase() };
      timeline.innerHTML = [
        node("1. Agent Task", "Agent asks for an outcome and supplies a spend cap.", null, '<pre>' + esc(promptInput.value) + '</pre>'),
        node("2. Live Boundary", "Fresh run at " + response.receipt.timestamp + "; execution mode " + response.receipt.execution_mode + "; triage " + response.broker_decision.triage_source + "; provider invoice simulated=" + response.provider_invoice.simulated, response.receipt.execution_mode === "live" ? { className: "approved", label: "LIVE PATH" } : { className: "pending", label: "DEMO/LOCAL PATH" }, '<p class="mono">archive: ' + esc(response.receipt.archive_path) + '<br>quote: ' + esc(response.receipt.quote_hash) + '</p>'),
        node("3. GLM/Z.AI Triage", response.broker_decision.task_type + " via " + response.broker_decision.triage_source, { className: "pending", label: response.broker_decision.triage_model }),
        node("4. Provider Quotes", "CoboRouter estimates tokens from this prompt, then compares capability, price, and wallet eligibility.", null, quoteTable(response.broker_decision.route_trace)),
        node("5. Cobo Wallet Policy", response.wallet_policy.reason || "policy approved spend within boundaries", walletStatus, '<p class="mono">authority: ' + esc(response.wallet_policy.policyAuthority) + '<br>source: ' + esc(response.wallet_policy.policySource) + '<br>policy: ' + esc(response.wallet_policy.policyHash) + '<br>wallet: ' + esc(response.wallet_policy.walletAddress) + '<br>pact: ' + esc(response.wallet_policy.evidence.coboPactId || "none") + '<br>authorized quote: $' + esc(response.wallet_policy.approved_spend_usd) + '</p>'),
        node("6. Payment Proof", response.payment.status + " / " + response.payment.proof_type, paymentStatus, paymentDetail(response.payment)),
        node("7. Answer", response.answer ? response.answer.summary : "No inference ran because wallet policy blocked the spend.", response.answer ? { className: "approved", label: "ANSWER RETURNED" } : { className: "blocked", label: "NO INFERENCE" }),
        node("8. Receipt", "Latest receipt saved to " + response.receipt.receipt_path + "; immutable archive saved to " + response.receipt.archive_path, null, receiptTools() + '<pre>' + esc(latestReceiptJson) + '</pre>')
      ].join("");
    }

    async function run(scenario) {
      setScenarioPrompt(scenario);
      timeline.innerHTML = node("Running", "Calling route_inference and Cobo policy adapter...", { className: "pending", label: "WORKING" });
      const response = await fetch("/api/route-inference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: promptInput.value,
          routing_mode: "cheapest_capable",
          max_spend_usd: Number(budgetInput.value),
          allowed_providers: scenario === "simple_zai" ? zaiProviderIds : [...zaiProviderIds, "second_real_provider", "local_baseline"],
          require_receipt: true,
          idempotency_key: "demo-" + scenario + "-001",
          scenario
        })
      });
      render(await response.json());
    }

    document.getElementById("blocked").addEventListener("click", () => run("blocked"));
    document.getElementById("approved").addEventListener("click", () => run("approved"));
    document.getElementById("budget-declined").addEventListener("click", () => run("budget_declined"));
    document.getElementById("provider-not-allowlisted").addEventListener("click", () => run("provider_not_allowlisted"));
    document.getElementById("human-approval").addEventListener("click", () => run("human_approval"));
    document.getElementById("settlement-failure").addEventListener("click", () => run("settlement_failure"));
    document.getElementById("local").addEventListener("click", () => run("local"));
    document.getElementById("simple-zai").addEventListener("click", () => run("simple_zai"));
    timeline.addEventListener("click", async event => {
      if (event.target.id === "copy-receipt" && latestReceiptJson) {
        await navigator.clipboard.writeText(latestReceiptJson);
        event.target.textContent = "Copied";
      }
      if (event.target.id === "download-receipt" && latestReceiptJson) {
        const blob = new Blob([latestReceiptJson], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "coborouter-receipt.json";
        link.click();
        URL.revokeObjectURL(link.href);
      }
    });
    run(initialScenario);
  </script>
</body>
</html>`;
}
