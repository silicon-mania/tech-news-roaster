import "@testing-library/jest-dom/vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { defaultImagePrompt } from "@/services/generation";
import {
  buildCompletedRun,
  buildCompletedV3Run,
  buildFailedManualRun,
  buildNewsLinkedImages,
  createMemorySavedRunStore,
  manualRunFetcher,
  renderWorkspace,
} from "./workspace-test-utils";

describe("Workspace saved runs", () => {
  test("composes a run server-side and renders the persisted result in the runs list", async () => {
    const user = userEvent.setup();
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    // The route persists the run under the client-minted id and returns it; the
    // fake echoes a completed run, mirroring that contract.
    const submitManualRunFetcher = manualRunFetcher(
      ({ runId, sourceTweetUrl: url, usersDirection }) =>
        buildCompletedV3Run({
          id: runId,
          label: "Drafts for 1234567890",
          sourceTweetUrl: url,
          usersDirection,
        }),
    );
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({ submitManualRunFetcher });

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    expect(submitManualRunFetcher).toHaveBeenCalledTimes(1);
    // The composing placeholder is replaced by the finished run the route returned.
    expect(
      await screen.findByRole("region", { name: /completed draft stack/i }),
    ).toBeInTheDocument();
    expect(sourceTweetUrlInput).toHaveValue(sourceTweetUrl);

    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(screen.getByRole("button", { name: /drafts for 1234567890/i })).toBeInTheDocument();
  });

  test("renders a composed v3 run with its generated image set and drafts", async () => {
    const user = userEvent.setup();
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const submitManualRunFetcher = manualRunFetcher(
      ({ runId, sourceTweetUrl: url, usersDirection }) =>
        buildCompletedV3Run({ id: runId, sourceTweetUrl: url, usersDirection }),
    );
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({ submitManualRunFetcher });

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    const imageGenerationArea = await screen.findByRole("complementary", {
      name: /image generation area/i,
    });

    expect(imageGenerationArea).toHaveTextContent("Image generation complete");
    expect(
      within(imageGenerationArea).getByRole("region", { name: /image results area/i }),
    ).toHaveTextContent("Variation 4");
    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
  });

  test("reopens Saved Runs from the drawer without regenerating", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Previously saved run" }),
    ]);
    const { sourceTweetUrlInput } = renderWorkspace({
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /previously saved run.*just now/i,
      }),
    );

    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");
    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: /source tweet preview/i,
      }),
    ).toHaveTextContent("agent workspace");
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
  });

  test("reopens v3 Saved Runs with the generated image set and no regeneration", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const startImageGeneration = vi.fn();
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(""),
    );
    const savedRun = buildCompletedV3Run({
      label: "Persisted v3 run",
      usersDirection: "Keep the saved direction.",
    });
    const savedRunStore = createMemorySavedRunStore([savedRun]);
    const { sourceTweetUrlInput } = renderWorkspace({
      imageGenerationStreamFetcher,
      onStartGenerationRun: startGenerationRun,
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /persisted v3 run/i,
      }),
    );

    expect(startGenerationRun).not.toHaveBeenCalled();
    expect(startImageGeneration).not.toHaveBeenCalled();
    expect(imageGenerationStreamFetcher).not.toHaveBeenCalled();
    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");

    // A reopened run with a saved direction auto-reveals the inline field.
    expect(screen.getByRole("textbox", { name: /^user's direction$/i })).toHaveValue(
      "Keep the saved direction.",
    );

    await user.click(screen.getByRole("button", { name: /open tweet context/i }));
    expect(screen.getByRole("dialog", { name: /tweet context/i })).toHaveTextContent(
      "The source tweet claims the launch removes the final workflow bottleneck.",
    );
    await user.click(screen.getByRole("button", { name: /close tweet context/i }));

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    const imageResultsArea = within(imageGenerationArea).getByRole("region", {
      name: /image results area/i,
    });
    expect(imageResultsArea).toHaveTextContent("Variation 4");
    expect(imageGenerationArea).toHaveTextContent("Image generation complete");
    // The single generated set completed — there is no failed image state.
    expect(
      within(imageResultsArea).queryByRole("article", { name: /^failed image set$/i }),
    ).not.toBeInTheDocument();
  });

  test("reopens text-successful Saved Runs with unstarted image generation still eligible", async () => {
    const user = userEvent.setup();
    const startImageGeneration = vi.fn();
    const newsLinkedImages = buildNewsLinkedImages();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({
        imageGenerationState: {
          status: "not-started",
        },
        label: "Image-ready saved run",
        newsLinkedImages,
        phase: "waiting-for-image-selection",
      }),
    ]);
    renderWorkspace({
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /image-ready saved run.*just now/i,
      }),
    );

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(imageGenerationArea).toHaveTextContent("Waiting for image selection");
    expect(imageGenerationArea).toHaveTextContent("Launch visual");

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /open image direction/i,
      }),
    );
    const userImagePromptField = screen.getByRole("textbox", {
      name: /user image prompt/i,
    });
    expect(userImagePromptField).toHaveValue(defaultImagePrompt);
    await user.clear(userImagePromptField);
    await user.type(userImagePromptField, "Make the visual feel launch-ready.");
    await user.click(
      screen.getByRole("button", {
        name: /close image direction/i,
      }),
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /^start image generation$/i,
      }),
    );

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageId: "news-linked-image-1",
      userImagePrompt: "Make the visual feel launch-ready.",
    });
  });

  test("renders a persisted failed run without re-saving it client-side", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    // A composition that fails is persisted server-side as a failed run and returned
    // (HTTP 200), so the route fake resolves with it rather than rejecting.
    const submitManualRunFetcher = manualRunFetcher(({ runId, sourceTweetUrl: url }) =>
      buildFailedManualRun({
        id: runId,
        sourceTweetUrl: url,
        failureMessage: "Source tweet could not be retrieved.",
      }),
    );
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      savedRunStore,
      submitManualRunFetcher,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(
      await screen.findByRole("region", { name: /generation failure state/i }),
    ).toHaveTextContent("Source tweet could not be retrieved.");
    expect(screen.getByRole("status")).toHaveTextContent("Source tweet could not be retrieved.");
    // The route already persisted the failed run; the client never re-saves it.
    expect(savedRunStore.save).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(screen.getByTitle("Failed")).toBeInTheDocument();
  });

  test("composing the same source tweet again creates an independent run", async () => {
    const user = userEvent.setup();
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ id: "original-saved-run", label: "Original run" }),
    ]);
    const submitManualRunFetcher = manualRunFetcher(
      ({ runId, sourceTweetUrl: url, usersDirection }) =>
        buildCompletedV3Run({ id: runId, label: "New run", sourceTweetUrl: url, usersDirection }),
    );
    const { generateButton, sourceTweetUrlInput } = renderWorkspace({
      savedRunStore,
      submitManualRunFetcher,
    });

    // The reopened saved run pre-fills the composer with its source tweet.
    await screen.findByRole("button", { name: /open runs, 1 saved/i });
    await waitFor(() => expect(sourceTweetUrlInput).toHaveValue(sourceTweetUrl));

    await user.click(generateButton);

    // The new run is composed under its own client-minted id — never the reopened
    // run's id — and lands alongside the original in the runs list.
    expect(
      await screen.findByRole("region", { name: /completed draft stack/i }),
    ).toBeInTheDocument();
    const [, init] = (submitManualRunFetcher as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(String(init?.body)).runId).not.toBe("original-saved-run");

    await user.click(screen.getByRole("button", { name: /open runs, 2 saved/i }));
    expect(screen.getByRole("button", { name: /original run/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new run/i })).toBeInTheDocument();
  });

  test("renders saved-run relative dates", async () => {
    const dateNow = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-06-05T12:00:00.000Z").getTime());
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({
        label: "Three weeks old",
        savedAt: "2026-05-15T12:00:00.000Z",
      }),
    ]);

    renderWorkspace({ savedRunStore });

    const user = userEvent.setup();
    expect(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(
      screen.getByRole("button", {
        name: /three weeks old.*3 weeks ago/i,
      }),
    ).toBeInTheDocument();

    dateNow.mockRestore();
  });

  test("deletes saved runs through a desktop hover affordance", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Disposable run" }),
    ]);

    renderWorkspace({ isDesktop: true, savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.hover(
      screen.getByRole("button", {
        name: /disposable run.*just now/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /delete saved run: disposable run/i,
      }),
    );

    await waitFor(() => expect(savedRunStore.delete).toHaveBeenCalledWith("saved-run"));
    expect(
      screen.queryByRole("button", {
        name: /disposable run/i,
      }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Saved run deleted")).toBeInTheDocument();
  });

  test("omits the delete affordance on mobile", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Mobile saved run" }),
    ]);

    renderWorkspace({ isDesktop: false, savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );

    expect(
      screen.queryByRole("button", {
        name: /delete saved run: mobile saved run/i,
      }),
    ).not.toBeInTheDocument();
  });
});
