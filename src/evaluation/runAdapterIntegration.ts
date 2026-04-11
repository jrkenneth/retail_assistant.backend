import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import assert from "node:assert/strict";
import { printSection, writeEvaluationArtifact } from "./utils.js";

type IntegrationMode = "success" | "not_found" | "unauthorized" | "timeout" | "malformed";

type AdapterCase = {
  intent: string;
  params?: Record<string, unknown>;
  filters?: Record<string, unknown>;
};

const API_KEY = "integration-test-key";

const CASES: AdapterCase[] = [
  { intent: "authenticate_customer", params: { username: "maya.percy", password: "velora-demo-001" } },
  { intent: "validate_customer_status", params: { customer_number: "CUST-0001" } },
  { intent: "get_customer_profile", params: { customer_number: "CUST-0001" } },
  { intent: "get_order_history", filters: { customer_number: "CUST-0001", limit: 5 } },
  { intent: "get_order_detail", params: { order_number: "ORD-10001" } },
  { intent: "track_order", params: { order_number: "ORD-10001" } },
  { intent: "get_order_items", params: { order_number: "ORD-10001" } },
  { intent: "initiate_return", params: { customer_number: "CUST-0001", order_number: "ORD-10001", reason: "Too small" } },
  { intent: "get_return_status", params: { return_number: "RET-0001" } },
  { intent: "get_loyalty_balance", params: { customer_number: "CUST-0001" } },
  { intent: "get_loyalty_history", params: { customer_number: "CUST-0001" }, filters: { limit: 5 } },
  { intent: "search_products", filters: { query: "headphones", limit: 5 } },
  { intent: "get_product_detail", params: { sku: "AUD-HMX-100" } },
  { intent: "create_support_ticket", params: { customer_number: "CUST-0001", subject: "Help", description: "Need assistance" } },
  { intent: "get_support_ticket", params: { ticket_number: "TKT-0001" } },
];

function makeSuccessPayload(intent: string) {
  if (intent === "validate_customer_status" || intent === "authenticate_customer" || intent === "get_customer_profile") {
    return {
      data: {
        customer_id: "cust_001",
        customer_number: "CUST-0001",
        first_name: "Maya",
        last_name: "Percy",
        full_name: "Maya Percy",
        email: "maya.percy@velora.demo",
        account_status: "active",
        loyalty_points: 1480,
      },
    };
  }

  if (intent === "get_order_history" || intent === "search_products" || intent === "get_loyalty_history") {
    return {
      data: [
        {
          intent,
          customer_number: "CUST-0001",
        },
      ],
      meta: { total: 1 },
    };
  }

  if (intent === "create_support_ticket") {
    return {
      data: {
        ticket_number: "TKT-INTEGRATION-001",
        status: "open",
      },
    };
  }

  return {
    data: {
      intent,
      customer_number: "CUST-0001",
      order_number: "ORD-10001",
      ticket_number: "TKT-0001",
      sku: "AUD-HMX-100",
    },
  };
}

async function withServer<T>(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function main() {
  printSection("Adapter Integration Evaluation");

  const results: Array<Record<string, unknown>> = [];

  await withServer((req, res) => {
    const mode = (req.headers["x-integration-mode"] as IntegrationMode | undefined) ?? "success";
    const key = req.headers["velora_api_key"];

    if (mode !== "unauthorized" && key !== API_KEY) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "missing_api_key" }));
      return;
    }

    if (mode === "timeout") {
      return;
    }

    if (mode === "unauthorized") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "invalid_credentials" }));
      return;
    }

    if (mode === "not_found") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "not_found" }));
      return;
    }

    if (mode === "malformed") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("malformed");
      return;
    }

    const intent = String(req.url ?? "");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(makeSuccessPayload(intent.includes("/products") ? "search_products" : "get_order_detail")));
  }, async (baseUrl) => {
    process.env.ECOMMERCE_API_URL = baseUrl;
    process.env.ECOMMERCE_API_KEY = API_KEY;

    const { EcommerceAdapter } = await import("../adapters/ecommerce/ecommerceAdapter.js");
    const adapter = new EcommerceAdapter() as unknown as {
      execute: (intent: string, params?: Record<string, unknown>, filters?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      client?: { defaults?: { timeout?: number; headers?: Record<string, unknown> } };
    };

    for (const testCase of CASES) {
      const name = testCase.intent;

      const setMode = (mode: IntegrationMode) => {
        const headers = (adapter as any).client.defaults.headers;
        headers["x-integration-mode"] = mode;
      };

      setMode("success");
      const success = await adapter.execute(name, testCase.params ?? {}, testCase.filters ?? {});
      assert.equal(typeof success, "object");
      results.push({ intent: name, scenario: "success", passed: true });

      setMode("not_found");
      const notFound = await adapter.execute(name, testCase.params ?? {}, testCase.filters ?? {});
      assert.equal(notFound.not_found, true);
      results.push({ intent: name, scenario: "404", passed: true });

      setMode("malformed");
      const malformed = await adapter.execute(name, testCase.params ?? {}, testCase.filters ?? {});
      assert.equal(malformed.parse_error, true);
      results.push({ intent: name, scenario: "malformed", passed: true });

      setMode("unauthorized");
      try {
        await adapter.execute(name, testCase.params ?? {}, testCase.filters ?? {});
        results.push({ intent: name, scenario: "401", passed: false, reason: "expected controlled failure" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const expected = name === "authenticate_customer" ? "invalid username or password" : "authentication failed";
        assert.match(message, new RegExp(expected, "i"));
        results.push({ intent: name, scenario: "401", passed: true });
      }

      setMode("timeout");
      (adapter as any).client.defaults.timeout = 50;
      try {
        await adapter.execute(name, testCase.params ?? {}, testCase.filters ?? {});
        results.push({ intent: name, scenario: "timeout", passed: false, reason: "expected timeout failure" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /timed out/i);
        results.push({ intent: name, scenario: "timeout", passed: true });
      }
      (adapter as any).client.defaults.timeout = 10000;
    }
  });

  const passed = results.filter((result) => result.passed === true).length;
  const summary = {
    suite: "adapter_integration",
    intents_tested: CASES.length,
    checks_run: results.length,
    passed,
    failed: results.length - passed,
    results,
  };

  const filePath = await writeEvaluationArtifact("adapter-integration", summary);
  console.log(`Passed ${passed}/${results.length} adapter checks.`);
  console.log(`Saved results to ${filePath}`);
}

main().catch((error) => {
  console.error("[evaluation] Adapter integration evaluation failed", error);
  process.exitCode = 1;
});
