import { describe, expect, test } from "vitest";
import {
  quoteTweetBand,
  quoteTweetBandGradient,
  quoteTweetColors,
  quoteTweetFrame,
  quoteTweetImageRegion,
  quoteTweetLabelBox,
  quoteTweetLabelTypography,
  quoteTweetLogo,
} from "./index";

describe("baked quote tweet template", () => {
  test("uses the native Figma frame size", () => {
    expect(quoteTweetFrame).toEqual({ width: 3240, height: 4050 });
  });

  test("places the colored band at the Figma rect, filling the bottom of the frame", () => {
    expect(quoteTweetBand).toMatchObject({ x: 0, y: 2997, width: 3240, height: 1053 });
    expect(quoteTweetBand.width).toBe(quoteTweetFrame.width);
    expect(quoteTweetBand.y + quoteTweetBand.height).toBe(quoteTweetFrame.height);
  });

  test("fills the region above the band with the image", () => {
    expect(quoteTweetImageRegion.x).toBe(0);
    expect(quoteTweetImageRegion.y).toBe(0);
    expect(quoteTweetImageRegion.width).toBe(quoteTweetFrame.width);
    expect(quoteTweetImageRegion.height).toBe(quoteTweetBand.y);
  });

  test("centers the label box inside the band", () => {
    // Inside the band on every edge.
    expect(quoteTweetLabelBox.x).toBeGreaterThanOrEqual(quoteTweetBand.x);
    expect(quoteTweetLabelBox.x + quoteTweetLabelBox.width).toBeLessThanOrEqual(
      quoteTweetBand.x + quoteTweetBand.width,
    );
    expect(quoteTweetLabelBox.y).toBeGreaterThanOrEqual(quoteTweetBand.y);
    expect(quoteTweetLabelBox.y + quoteTweetLabelBox.height).toBeLessThanOrEqual(
      quoteTweetBand.y + quoteTweetBand.height,
    );
    // Centered horizontally in the frame, and vertically within the band.
    expect(quoteTweetLabelBox.x + quoteTweetLabelBox.width / 2).toBe(quoteTweetFrame.width / 2);
    const bandCenter = quoteTweetBand.y + quoteTweetBand.height / 2;
    const boxCenter = quoteTweetLabelBox.y + quoteTweetLabelBox.height / 2;
    expect(Math.abs(boxCenter - bandCenter)).toBeLessThanOrEqual(1);
  });

  test("fades the image into the band color, meeting the band top", () => {
    expect(quoteTweetBandGradient.y).toBeLessThan(quoteTweetBand.y);
    expect(quoteTweetBandGradient.y + quoteTweetBandGradient.height).toBe(quoteTweetBand.y);
    expect(quoteTweetBandGradient.angleDeg).toBe(180);
  });

  test("pins the Locked-In Logo to the top-left, pointing at a committed SVG", () => {
    expect(quoteTweetLogo.src).toBe("/assets/quote-tweet/locked-in-logo.svg");
    expect(quoteTweetLogo.src.endsWith(".svg")).toBe(true);
    expect(quoteTweetLogo.x).toBeLessThan(quoteTweetFrame.width / 2);
    expect(quoteTweetLogo.y).toBeLessThan(quoteTweetFrame.height / 2);
  });

  test("records the CompactaICG italic label typography", () => {
    expect(quoteTweetLabelTypography).toMatchObject({
      fontFamily: "CompactaICG",
      fontWeight: 500,
      fontStyle: "italic",
      letterSpacingEm: -0.02,
      textAlign: "center",
    });
    expect(quoteTweetColors.label).toBe("#FFFFFF");
  });
});
