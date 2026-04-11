import { retrieveRelevantChunks } from "../rag/retrievePolicy.js";
import { printSection, roundPercent, writeEvaluationArtifact } from "./utils.js";

type RagCase = {
  id: string;
  query: string;
  expected_policy_key: string;
  note?: string;
};

const CASES: RagCase[] = [
  { id: "rag-01", query: "What is Velora's return window for eligible products?", expected_policy_key: "returns_policy" },
  { id: "rag-02", query: "Are refunds sent back to the original payment method?", expected_policy_key: "returns_policy" },
  { id: "rag-03", query: "What should I do if tracking says delivered but I never received the parcel?", expected_policy_key: "shipping_policy" },
  { id: "rag-04", query: "Can I change my shipping address after checkout?", expected_policy_key: "shipping_policy" },
  { id: "rag-05", query: "Does the warranty cover accidental damage?", expected_policy_key: "warranty_policy" },
  { id: "rag-06", query: "How does a manufacturing defect claim work under warranty?", expected_policy_key: "warranty_policy" },
  { id: "rag-07", query: "Do loyalty points expire if I stop using my account?", expected_policy_key: "loyalty_policy" },
  { id: "rag-08", query: "How does Velora use customer information?", expected_policy_key: "privacy_policy" },
  { id: "rag-09", query: "Can I return a final sale item if I changed my mind?", expected_policy_key: "returns_policy" },
  { id: "rag-10", query: "If I bought a gift and it later turns out to be faulty, can the recipient make a warranty claim?", expected_policy_key: "warranty_policy", note: "Known difficult warranty-vs-returns overlap query." },
];

async function main() {
  printSection("RAG Retrieval Evaluation");

  const results: Array<Record<string, unknown>> = [];

  for (const testCase of CASES) {
    const chunks = await retrieveRelevantChunks(testCase.query, 3);
    const top = chunks[0] ?? null;
    const passed = top?.policy_key === testCase.expected_policy_key;

    results.push({
      id: testCase.id,
      query: testCase.query,
      expected_policy_key: testCase.expected_policy_key,
      actual_policy_key: top?.policy_key ?? null,
      actual_policy_title: top?.policy_title ?? null,
      top_similarity: top?.similarity ?? 0,
      passed,
      note: testCase.note,
    });

    console.log(`${testCase.id}: ${passed ? "PASS" : "FAIL"} -> ${top?.policy_key ?? "none"}`);
  }

  const passed = results.filter((entry) => entry.passed === true).length;
  const accuracy = passed / CASES.length;
  const summary = {
    suite: "rag_retrieval",
    total_queries: CASES.length,
    passed,
    failed: CASES.length - passed,
    accuracy_percent: roundPercent(accuracy),
    results,
  };

  const filePath = await writeEvaluationArtifact("rag-evaluation", summary);
  console.log(`Accuracy: ${passed}/${CASES.length} (${roundPercent(accuracy)}%)`);
  console.log(`Saved results to ${filePath}`);
}

main().catch((error) => {
  console.error("[evaluation] RAG evaluation failed", error);
  process.exitCode = 1;
});
