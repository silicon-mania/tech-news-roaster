import "@testing-library/jest-dom/vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { buildRuntimeStatus, renderWorkspace } from "./workspace-test-utils";

describe("Workspace run form", () => {
  test("renders an almost empty draft-first shell before any run exists", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", { name: "Auto-news" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /primary source tweet bar/i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /draft canvas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /^user's direction$/i })).not.toBeInTheDocument();
  });

  test("submits a valid direct Source Tweet URL with optional User's Direction", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, " https://x.com/siliconmania/status/1234567890 ");
    await user.click(screen.getByRole("button", { name: /add direction/i }));
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(usersDirectionInput, "Make it sharper about platform risk.");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Make it sharper about platform risk.",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Run started.");
    expect(
      screen.getByRole("region", { name: /compressed source tweet bar/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );

    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(
      screen.getByRole("button", {
        name: /new generation run.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Enrichment running")).toBeInTheDocument();
    expect(generateButton).toBeDisabled();
  });

  test("rejects invalid URLs before generation starts", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://example.com/posts/123");
    await user.click(generateButton);

    expect(startGenerationRun).not.toHaveBeenCalled();
    const sourceTweetBar = screen.getByRole("region", {
      name: /primary source tweet bar/i,
    });
    expect(within(sourceTweetBar).getByRole("alert")).toHaveTextContent(
      "Use a direct x.com or twitter.com status URL.",
    );
    expect(sourceTweetUrlInput).toHaveAttribute("aria-invalid", "true");
  });

  test("allows User's Direction to stay empty", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://twitter.com/siliconmania/status/987654321");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://twitter.com/siliconmania/status/987654321",
      usersDirection: "",
    });
  });

  test("warns in development when live APIs are enabled but still allows runs", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        enrichment: {
          credentials: {
            apiKey: true,
          },
          mode: "configured",
        },
        generation: {
          ...buildRuntimeStatus().generation,
          credentials: {
            aiGatewayApiKey: true,
          },
          mode: "live",
        },
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "development",
    });

    expect(screen.getByText("Live APIs enabled. Runs may use paid quota.")).toBeInTheDocument();
    expect(generateButton).toBeEnabled();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });
  });

  test("warns in development when news-linked images are unavailable", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        enrichment: {
          credentials: {
            apiKey: false,
          },
          mode: "off",
        },
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "development",
    });

    expect(
      screen.getByText(
        "News-linked images unavailable. Set OUTSIDE_X_ENRICHMENT_ENDPOINT to enable image generation.",
      ),
    ).toBeInTheDocument();
    expect(generateButton).toBeEnabled();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });
  });

  test("disables Run in production when live integrations are not ready", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton, generationStreamUrls } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        productionReady: false,
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "production",
    });

    expect(generateButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Live integrations are not configured.");

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).not.toHaveBeenCalled();
    expect(generationStreamUrls).toEqual([]);
  });

  test("allows production runs when live integrations are ready", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        productionReady: true,
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "production",
    });

    expect(generateButton).toBeEnabled();
    expect(screen.queryByText("Live integrations are not configured.")).not.toBeInTheDocument();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });
  });

  test("does not render preset steering controls", () => {
    renderWorkspace();

    expect(screen.queryByLabelText(/angle/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/draft's tone/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/length/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/publish mode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/preset/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  test("opens the generation stream with the accepted source tweet", async () => {
    const user = userEvent.setup();
    const { sourceTweetUrlInput, generateButton, generationStreamUrls } = renderWorkspace();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/13579");
    await user.click(screen.getByRole("button", { name: /add direction/i }));
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(usersDirectionInput, "Challenge the premise.");
    await user.click(generateButton);

    expect(generationStreamUrls).toEqual([
      "/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F13579&usersDirection=Challenge+the+premise.",
    ]);
  });
});
