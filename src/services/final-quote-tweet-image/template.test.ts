import { describe, expect, test } from "vitest";
import {
  quoteTweetBandGradient,
  quoteTweetColors,
  quoteTweetFrame,
  quoteTweetImageRegion,
  quoteTweetRainbowStripe,
  quoteTweetTitleBand,
  quoteTweetTitleBox,
  quoteTweetTitleTypography,
} from "./index";

describe("baked quote tweet template", () => {
  test("uses the native Figma frame size", () => {
    expect(quoteTweetFrame).toEqual({ width: 3240, height: 4050 });
  });

  test("stacks the image region directly above the title band", () => {
    expect(quoteTweetImageRegion.y).toBe(0);
    expect(quoteTweetImageRegion.height).toBe(quoteTweetTitleBand.y);
    expect(quoteTweetTitleBand.y + quoteTweetTitleBand.height).toBe(quoteTweetFrame.height);
    expect(quoteTweetTitleBand.width).toBe(quoteTweetFrame.width);
  });

  test("keeps the title box inside the band", () => {
    expect(quoteTweetTitleBox.y).toBeGreaterThanOrEqual(quoteTweetTitleBand.y);
    expect(quoteTweetTitleBox.y + quoteTweetTitleBox.height).toBeLessThanOrEqual(
      quoteTweetTitleBand.y + quoteTweetTitleBand.height,
    );
    expect(quoteTweetTitleBox.x + quoteTweetTitleBox.width).toBeLessThanOrEqual(
      quoteTweetTitleBand.x + quoteTweetTitleBand.width,
    );
  });

  test("fades into the band starting inside the image region", () => {
    expect(quoteTweetBandGradient.y).toBeLessThan(quoteTweetTitleBand.y);
    expect(quoteTweetBandGradient.from).toContain("0)");
    expect(quoteTweetBandGradient.to).toContain("1)");
  });

  test("points the rainbow stripe at a committed asset", () => {
    expect(quoteTweetRainbowStripe.src).toBe("/assets/quote-tweet/rainbow-stripe.png");
    expect(quoteTweetRainbowStripe.segments).toHaveLength(6);
  });

  test("records the exact title typography from Figma", () => {
    expect(quoteTweetTitleTypography).toMatchObject({
      fontFamily: "VC Henrietta Condensed",
      fontWeight: 400,
      fontSizePx: 320,
      lineHeightPx: 320,
      letterSpacingEm: -0.02,
    });
    expect(quoteTweetColors.title).toBe("#FFFFFF");
    expect(quoteTweetColors.band).toBe("#000000");
  });
});
