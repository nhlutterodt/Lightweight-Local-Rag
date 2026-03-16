import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders action-linked operational confirmations", () => {
    render(
      <AnalyticsPanel
        metrics={[]}
        queue={[]}
        metricsState={{ status: "ready", error: "", lastUpdated: "2026-03-15T20:00:00.000Z", changeSummary: "No changes." }}
        queueState={{ status: "ready", error: "", lastUpdated: "2026-03-15T20:00:00.000Z", changeSummary: "Queue is empty." }}
        operationalActions={[
          {
            id: "action-1",
            timestamp: "2026-03-15T20:01:00.000Z",
            message: "Queued Notes.md for collection TestIngest.",
            status: "success",
          },
        ]}
      />,
    );

    expect(screen.getByText(/recent operational actions/i)).toBeInTheDocument();
    expect(screen.getByText(/queued notes\.md for collection testingest\./i)).toBeInTheDocument();
  });

  it("jumps to the linked queue item when an action deep link is clicked", () => {
    render(
      <AnalyticsPanel
        metrics={[]}
        queue={[{ entityId: "job-1", path: "C:/Docs/file.txt", status: "processing" }]}
        metricsState={{ status: "ready", error: "", lastUpdated: "2026-03-15T20:00:00.000Z", changeSummary: "No changes." }}
        queueState={{ status: "ready", error: "", lastUpdated: "2026-03-15T20:00:00.000Z", changeSummary: "Queue has one item." }}
        operationalActions={[
          {
            id: "action-1",
            timestamp: "2026-03-15T20:01:00.000Z",
            message: "Queued file.txt for collection TestIngest.",
            status: "success",
            target: {
              section: "queue",
              entityId: "job-1",
              label: "View queued job",
            },
          },
        ]}
      />,
    );

    const queueRegion = document.getElementById("queueManager");
    const queueItem = screen.getByText("file.txt").closest(".queue-item");
    const queueRegionScrollSpy = vi.fn();
    const queueItemScrollSpy = vi.fn();

    queueRegion.scrollIntoView = queueRegionScrollSpy;
    queueItem.scrollIntoView = queueItemScrollSpy;

    fireEvent.click(screen.getByRole("button", { name: /view queued job/i }));

    expect(queueRegionScrollSpy).toHaveBeenCalled();
    expect(queueItemScrollSpy).toHaveBeenCalled();
    expect(queueItem).toHaveClass("is-linked-highlight");
  });
});