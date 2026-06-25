import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { quoteTweetLabelTypography, quoteTweetLogo } from "./index";

const repoRoot = process.cwd();
const fontPath = resolve(repoRoot, "public/fonts/compacta-icg-italic.ttf");
const logoPath = resolve(repoRoot, "public", quoteTweetLogo.src.replace(/^\//, ""));
const oldStripePath = resolve(repoRoot, "public/assets/quote-tweet/rainbow-stripe.png");
const globalsCss = readFileSync(resolve(repoRoot, "src/app/globals.css"), "utf8");

describe("bundled quote tweet assets", () => {
  test("ships the CompactaICG label face as a committed font file", () => {
    expect(existsSync(fontPath)).toBe(true);
    // OpenType (OTTO) or TrueType (\x00\x01\x00\x00) sfnt header.
    const header = readFileSync(fontPath).subarray(0, 4).toString("latin1");
    expect(["OTTO", "\x00\x01\x00\x00", "true", "ttcf"]).toContain(header);
  });

  test("ships the Locked-In Logo as a committed SVG with outlined text", () => {
    expect(existsSync(logoPath)).toBe(true);
    expect(quoteTweetLogo.src).toBe("/assets/quote-tweet/locked-in-logo.svg");

    const svg = readFileSync(logoPath, "utf8");
    expect(svg).toContain("<svg");
    // Outlined text — vector paths, never <text>, so the mark is font-independent.
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<text");
  });

  test("registers CompactaICG via a hand-written @font-face (not next/font)", () => {
    const fontFaceMatch = globalsCss.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    const labelFace = fontFaceMatch.find((block) =>
      block.includes(quoteTweetLabelTypography.fontFamily),
    );
    expect(labelFace, "expected an @font-face for the label family").toBeDefined();
    expect(labelFace).toContain("/fonts/compacta-icg-italic.ttf");
    expect(labelFace).toMatch(/font-weight:\s*500/);
    expect(labelFace).toMatch(/font-style:\s*italic/);
  });

  test("drops the old rainbow stripe asset", () => {
    expect(existsSync(oldStripePath)).toBe(false);
  });

  test("retires the Henrietta section-title serif once every header uses the display tier", () => {
    // ADR-0030 Phase 5: all headers moved to the CompactaICG display tier
    // (`.display-locked`), so the bundled Henrietta face and its `@font-face`
    // registration were removed — the font system keeps no dead tier.
    const henriettaPath = resolve(repoRoot, "public/fonts/vc-henrietta-condensed.otf");
    expect(existsSync(henriettaPath)).toBe(false);
    expect(globalsCss).not.toContain("vc-henrietta-condensed.otf");
  });
});
