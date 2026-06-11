import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { quoteTweetRainbowStripe, quoteTweetTitleTypography } from "./index";

const repoRoot = process.cwd();
const fontPath = resolve(repoRoot, "public/fonts/vc-henrietta-condensed.otf");
const stripePath = resolve(repoRoot, "public/assets/quote-tweet/rainbow-stripe.png");
const globalsCss = readFileSync(resolve(repoRoot, "src/app/globals.css"), "utf8");

describe("bundled quote tweet assets", () => {
  test("ships the title serif as a committed font file", () => {
    expect(existsSync(fontPath)).toBe(true);
    // OpenType (OTTO) or TrueType (\x00\x01\x00\x00) sfnt header.
    const header = readFileSync(fontPath).subarray(0, 4).toString("latin1");
    expect(["OTTO", "\x00\x01\x00\x00", "true", "ttcf"]).toContain(header);
  });

  test("ships the rainbow stripe bitmap referenced by the template", () => {
    expect(existsSync(stripePath)).toBe(true);
    expect(quoteTweetRainbowStripe.src).toBe("/assets/quote-tweet/rainbow-stripe.png");
  });

  test("registers the serif via a hand-written @font-face (not next/font)", () => {
    const fontFaceMatch = globalsCss.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    const titleFace = fontFaceMatch.find((block) =>
      block.includes(quoteTweetTitleTypography.fontFamily),
    );
    expect(titleFace, "expected an @font-face for the title family").toBeDefined();
    expect(titleFace).toContain("/fonts/vc-henrietta-condensed.otf");
    expect(titleFace).toMatch(/font-weight:\s*400/);
  });
});
