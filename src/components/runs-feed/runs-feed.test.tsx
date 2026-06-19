import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { GenerationRun } from "@/services/workspace";
import {
  buildCompletedRun,
  buildCompletedV3Run,
  createMemorySavedRunStore,
} from "../workspace/workspace-test-utils";
import { RunsFeed } from "./runs-feed";
import { feedPageSize } from "./use-runs-feed";

// jsdom has no IntersectionObserver. Capture each instance so a test can drive
// "scroll the bottom sentinel into view" by invoking the observed callback.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  disconnected = false;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

function triggerFeedScroll() {
  const observer = FakeIntersectionObserver.instances.filter((each) => !each.disconnected).at(-1);

  if (!observer) {
    throw new Error("Expected an active IntersectionObserver to drive feed scrolling.");
  }

  act(() => {
    observer.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    );
  });
}

// A Complete Run carries a draft, a visual joke, and an image variation. The
// ordinal drives both a unique label and a savedAt minute so newest-first order
// and pagination are deterministic.
function buildCompleteRun(ordinal: number): GenerationRun {
  return buildCompletedV3Run({
    id: `complete-run-${ordinal}`,
    label: `Complete run ${ordinal}`,
    savedAt: `2026-06-06T11:${String(ordinal).padStart(2, "0")}:00.000Z`,
  });
}

// A successful-but-incomplete run (no visual joke set, no image set) — fails
// isCompleteRun and must stay out of the feed.
function buildIncompleteRun(ordinal: number): GenerationRun {
  return buildCompletedRun({
    id: `incomplete-run-${ordinal}`,
    label: `Incomplete run ${ordinal}`,
    savedAt: `2026-06-06T11:${String(ordinal).padStart(2, "0")}:00.000Z`,
  });
}

// The faithful Run Card carries its run label as the article's accessible name
// (not painted text), so cards are identified — and ordered — by that label.
function feedCardLabels() {
  return within(screen.getByRole("region", { name: "Runs" }))
    .getAllByRole("article")
    .map((card) => card.getAttribute("aria-label"));
}

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Runs Feed", () => {
  test("lists only Complete Runs, newest-first", async () => {
    const savedRunStore = createMemorySavedRunStore([
      buildCompleteRun(1),
      buildIncompleteRun(2),
      buildCompleteRun(3),
    ]);

    render(<RunsFeed savedRunStore={savedRunStore} />);

    await waitFor(() => expect(feedCardLabels()).toEqual(["Complete run 3", "Complete run 1"]));

    // The successful-but-incomplete run is filtered out — never rendered as a card.
    expect(
      within(screen.getByRole("region", { name: "Runs" })).queryByRole("article", {
        name: "Incomplete run 2",
      }),
    ).not.toBeInTheDocument();
  });

  test("shows the resolved selected draft text on each card", async () => {
    const savedRunStore = createMemorySavedRunStore([buildCompleteRun(1)]);

    render(<RunsFeed savedRunStore={savedRunStore} />);

    // The card's commentary is the resolved Selected Draft (first draft fallback).
    await waitFor(() =>
      expect(screen.getByText("Quote-tweet draft: first saved draft.")).toBeInTheDocument(),
    );
  });

  test("opens the relocated Workspace via an icon-only New Manual Run action", async () => {
    const savedRunStore = createMemorySavedRunStore();

    render(<RunsFeed savedRunStore={savedRunStore} />);

    const newRunLink = screen.getByRole("link", { name: /new manual run/i });
    expect(newRunLink).toHaveAttribute("href", "/workspace");
    // Icon-only: the action carries no visible text label.
    expect(newRunLink).toHaveTextContent("");
  });

  test("pages with limit 14 and appends the next cursor's runs on scroll", async () => {
    const savedRunStore = createMemorySavedRunStore(
      Array.from({ length: 20 }, (_, index) => buildCompleteRun(index + 1)),
    );

    render(<RunsFeed savedRunStore={savedRunStore} />);

    // First page: the newest 14 runs (run 20 down to run 7). The oldest is absent.
    await waitFor(() => expect(feedCardLabels()).toHaveLength(feedPageSize));
    expect(savedRunStore.listPaginated).toHaveBeenCalledWith({
      cursor: null,
      limit: feedPageSize,
    });
    expect(feedCardLabels()).not.toContain("Complete run 1");

    triggerFeedScroll();

    // Scrolling the sentinel into view loads the next page at the offset cursor
    // and appends the remaining six runs, including the oldest.
    await waitFor(() => expect(feedCardLabels()).toContain("Complete run 1"));
    expect(savedRunStore.listPaginated).toHaveBeenCalledWith({
      cursor: "14",
      limit: feedPageSize,
    });
    expect(feedCardLabels()).toHaveLength(20);
  });

  test("fetches further pages within one load to fill toward the visible target when runs are filtered out", async () => {
    // The newest four runs are incomplete, so the first raw page yields only ten
    // Complete Runs — the feed must fetch the next page to fill toward 14.
    const incompleteRuns = [17, 18, 19, 20].map(buildIncompleteRun);
    const completeRuns = Array.from({ length: 16 }, (_, index) => buildCompleteRun(index + 1));
    const savedRunStore = createMemorySavedRunStore([...completeRuns, ...incompleteRuns]);

    render(<RunsFeed savedRunStore={savedRunStore} />);

    await waitFor(() => expect(savedRunStore.listPaginated).toHaveBeenCalledTimes(2));

    expect(savedRunStore.listPaginated).toHaveBeenNthCalledWith(1, {
      cursor: null,
      limit: feedPageSize,
    });
    expect(savedRunStore.listPaginated).toHaveBeenNthCalledWith(2, {
      cursor: "14",
      limit: feedPageSize,
    });

    await waitFor(() => expect(feedCardLabels()).toHaveLength(16));
    expect(feedCardLabels().some((label) => label?.startsWith("Incomplete run"))).toBe(false);
  });

  test("renders the feed without persisting a selection (defaults are display-only)", async () => {
    const savedRunStore = createMemorySavedRunStore(
      Array.from({ length: 20 }, (_, index) => buildCompleteRun(index + 1)),
    );

    render(<RunsFeed savedRunStore={savedRunStore} />);

    await waitFor(() => expect(feedCardLabels()).toHaveLength(feedPageSize));
    triggerFeedScroll();
    await waitFor(() => expect(feedCardLabels()).toHaveLength(20));

    // First-of-each resolution is display-only: showing and scrolling the feed
    // writes nothing, so a view-only run reopens with the same defaults.
    expect(savedRunStore.save).not.toHaveBeenCalled();
  });

  test("renders an empty state pointing at the New Manual Run action and the cadence", async () => {
    const savedRunStore = createMemorySavedRunStore();

    render(<RunsFeed savedRunStore={savedRunStore} />);

    // Zero Complete Runs yields an empty state, not a blank page.
    const emptyState = await screen.findByRole("region", { name: /no runs yet/i });

    // It directs the operator to the `+` New Manual Run button and explains the
    // automatic every-two-hours Discovery cadence.
    expect(within(emptyState).getByText(/new manual run/i)).toBeInTheDocument();
    expect(within(emptyState).getByText(/every two hours/i)).toBeInTheDocument();
  });

  test("renders one Discovery Source link per parsed id in the empty state", async () => {
    const savedRunStore = createMemorySavedRunStore();

    render(
      <RunsFeed savedRunStore={savedRunStore} discoverySourceListIds={["1111", "2222", "3333"]} />,
    );

    const lists = await screen.findByRole("navigation", { name: /discovery source lists/i });
    const links = within(lists).getAllByRole("link");

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://x.com/i/lists/1111",
      "https://x.com/i/lists/2222",
      "https://x.com/i/lists/3333",
    ]);
  });

  test("omits the Discovery Source links when no list ids are configured", async () => {
    const savedRunStore = createMemorySavedRunStore();

    render(<RunsFeed savedRunStore={savedRunStore} discoverySourceListIds={[]} />);

    // The empty state still renders; only the per-list links are absent.
    await screen.findByRole("region", { name: /no runs yet/i });
    expect(
      screen.queryByRole("navigation", { name: /discovery source lists/i }),
    ).not.toBeInTheDocument();
  });
});

// The Refresh flow toasts, so these renders also mount the Toaster (mounted once
// at the app root in production).
function renderFeedWithToaster(runs: GenerationRun[]) {
  const savedRunStore = createMemorySavedRunStore(runs);

  render(
    <>
      <RunsFeed savedRunStore={savedRunStore} />
      <Toaster />
    </>,
  );

  return savedRunStore;
}

describe("Runs Feed — Refresh", () => {
  test("renders an icon-only Refresh action beside the New Manual Run button", async () => {
    const savedRunStore = createMemorySavedRunStore([buildCompleteRun(1)]);

    render(<RunsFeed savedRunStore={savedRunStore} />);

    const refresh = await screen.findByRole("button", { name: "Refresh" });
    // Icon-only: the action carries no visible text label.
    expect(refresh).toHaveTextContent("");

    // It lives in the feed header right next to the New Manual Run action.
    const header = refresh.closest("header");
    if (!header) {
      throw new Error("Expected the Refresh action to live inside the feed header.");
    }
    expect(within(header).getByRole("link", { name: /new manual run/i })).toBeInTheDocument();
  });

  test("re-fetches the first page and merges new Complete Runs to the top, toasting the count", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeedWithToaster([buildCompleteRun(1), buildCompleteRun(2)]);

    await waitFor(() => expect(feedCardLabels()).toEqual(["Complete run 2", "Complete run 1"]));
    expect(savedRunStore.listPaginated).toHaveBeenCalledTimes(1);

    // Two runs finish after the page loaded — a newer savedAt puts them at the top
    // of the first page (finished Manual Runs / background Automated Runs).
    await savedRunStore.save(buildCompleteRun(3));
    await savedRunStore.save(buildCompleteRun(4));

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    // The two new Complete Runs land at the top, newest-first, above the existing.
    await waitFor(() =>
      expect(feedCardLabels()).toEqual([
        "Complete run 4",
        "Complete run 3",
        "Complete run 2",
        "Complete run 1",
      ]),
    );
    // Refresh re-runs the first page at the null cursor.
    expect(savedRunStore.listPaginated).toHaveBeenLastCalledWith({
      cursor: null,
      limit: feedPageSize,
    });
    // A quiet toast reports how many arrived.
    expect(await screen.findByText("2 new runs")).toBeInTheDocument();
  });

  test("reports when no new runs arrived and leaves the feed unchanged", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeedWithToaster([buildCompleteRun(1), buildCompleteRun(2)]);

    await waitFor(() => expect(feedCardLabels()).toEqual(["Complete run 2", "Complete run 1"]));

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(savedRunStore.listPaginated).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No new runs")).toBeInTheDocument();
    expect(feedCardLabels()).toEqual(["Complete run 2", "Complete run 1"]);
  });

  test("merges only newly-arrived Complete Runs, skipping incomplete ones", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeedWithToaster([buildCompleteRun(1)]);

    await waitFor(() => expect(feedCardLabels()).toEqual(["Complete run 1"]));

    // A newer-but-incomplete run and a newer Complete Run both arrive.
    await savedRunStore.save(buildIncompleteRun(2));
    await savedRunStore.save(buildCompleteRun(3));

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    // Only the Complete Run is merged in; the incomplete arrival never becomes a card.
    await waitFor(() => expect(feedCardLabels()).toEqual(["Complete run 3", "Complete run 1"]));
    expect(
      within(screen.getByRole("region", { name: "Runs" })).queryByRole("article", {
        name: "Incomplete run 2",
      }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("1 new run")).toBeInTheDocument();
  });
});
