import {
  RETRIEVAL_MODES,
  buildRetrievalPlan,
  normalizeRetrievalMode,
} from "../lib/retrievalModes.js";

describe("retrievalModes", () => {
  it("normalizes valid retrieval mode values", () => {
    expect(normalizeRetrievalMode("VECTOR")).toBe(RETRIEVAL_MODES.VECTOR);
    expect(normalizeRetrievalMode("filtered-vector")).toBe(
      RETRIEVAL_MODES.FILTERED_VECTOR,
    );
  });

  it("falls back to vector mode for invalid values", () => {
    expect(normalizeRetrievalMode("hybrid")).toBe(RETRIEVAL_MODES.VECTOR);
  });

  it("builds plain vector plan without constraints", () => {
    const plan = buildRetrievalPlan({
      mode: RETRIEVAL_MODES.VECTOR,
      query: "What is the architecture?",
    });

    expect(plan.mode).toBe(RETRIEVAL_MODES.VECTOR);
    expect(plan.constraintsActive).toBe(false);
    expect(plan.vectorOptions.overfetchFactor).toBe(1);
  });

  it("infers filtered-vector constraints from query and keeps overfetch", () => {
    const plan = buildRetrievalPlan({
      mode: RETRIEVAL_MODES.FILTERED_VECTOR,
      query: "How does XML logging work in XMLLogger.ps1?",
      overfetchFactor: 6,
    });

    expect(plan.mode).toBe(RETRIEVAL_MODES.FILTERED_VECTOR);
    expect(plan.constraintsActive).toBe(true);
    expect(plan.vectorOptions.overfetchFactor).toBe(6);
    expect(plan.vectorOptions.metadataFilters.fileTypeEquals).toBe("powershell");
    expect(plan.vectorOptions.metadataFilters.fileNameContains).toBe(
      "XMLLogger.ps1",
    );
  });

  it("allows explicit retrieval constraints to override inference", () => {
    const plan = buildRetrievalPlan({
      mode: RETRIEVAL_MODES.FILTERED_VECTOR,
      query: "show markdown notes",
      constraints: {
        fileType: "powershell",
        fileName: "Chat-Rag.ps1",
        strict: true,
      },
    });

    expect(plan.vectorOptions.metadataFilters.fileTypeEquals).toBe("powershell");
    expect(plan.vectorOptions.metadataFilters.fileNameContains).toBe(
      "Chat-Rag.ps1",
    );
    expect(plan.vectorOptions.strictFilter).toBe(true);
  });

  it("uses overfetch 1 when filtered-vector has no active constraints", () => {
    const plan = buildRetrievalPlan({
      mode: RETRIEVAL_MODES.FILTERED_VECTOR,
      query: "Summarize retrieval architecture",
      overfetchFactor: 7,
    });

    expect(plan.constraintsActive).toBe(false);
    expect(plan.vectorOptions.overfetchFactor).toBe(1);
    expect(plan.appliedOverfetchFactor).toBe(1);
  });

  it("keeps configured overfetch when filtered-vector constraints are active", () => {
    const plan = buildRetrievalPlan({
      mode: RETRIEVAL_MODES.FILTERED_VECTOR,
      query: "Find function in Chat-Rag.ps1",
      overfetchFactor: 7,
    });

    expect(plan.constraintsActive).toBe(true);
    expect(plan.vectorOptions.overfetchFactor).toBe(7);
    expect(plan.appliedOverfetchFactor).toBe(7);
  });
});
