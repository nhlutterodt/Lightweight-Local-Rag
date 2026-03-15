import { render, screen } from "@testing-library/react";
import AnalyticsPanel from "../AnalyticsPanel";

describe("AnalyticsPanel", () => {
  it("renders loading states with accessible summaries", () => {
    render(
      <AnalyticsPanel
        metrics={[]}
        queue={[]}
        metricsState={{ status: "loading", error: "" }}
        queueState={{ status: "loading", error: "" }}
      />,
    );

    expect(screen.getByText(/loading index metrics/i)).toBeInTheDocument();
    expect(screen.getByText(/loading queue/i)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("renders error states for metrics and queue", () => {
    render(
      <AnalyticsPanel
        metrics={[]}
        queue={[]}
        metricsState={{ status: "error", error: "Backend unavailable" }}
        queueState={{ status: "error", error: "SSE disconnected" }}
      />,
    );

    expect(screen.getByText(/unable to load indices/i)).toHaveTextContent("Backend unavailable");
    expect(screen.getByText(/unable to load queue/i)).toHaveTextContent("SSE disconnected");
  });

  it("renders populated metrics and queue with operational summaries", () => {
    render(
      <AnalyticsPanel
        metrics={[{ name: "Docs", health: "HEALTHY" }]}
        queue={[{ path: "C:/Docs/file.txt", status: "processing" }]}
        metricsState={{ status: "ready", error: "" }}
        queueState={{ status: "ready", error: "" }}
      />,
    );

    expect(screen.getAllByText(/1 vector index loaded/i)).toHaveLength(2);
    expect(screen.getAllByText(/1 job in the ingestion queue/i)).toHaveLength(2);
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("file.txt")).toBeInTheDocument();
  });
});