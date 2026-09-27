// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { sanitizeSvg, svgDimensions } from "./svg";

describe("sanitizeSvg", () => {
  it("strips a script element from SVG markup", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><circle cx="1" cy="1" r="2" /></svg>';
    const result = sanitizeSvg(source);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<circle");
  });

  it("strips event handler attributes", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onmouseover="alert(2)" /></svg>';
    const result = sanitizeSvg(source);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("onmouseover");
    expect(result).toContain("<rect");
  });

  it("keeps safe SVG structure and attributes", () => {
    const source =
      '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="red" /></svg>';
    const result = sanitizeSvg(source);
    expect(result).toContain("<rect");
    expect(result).toContain("viewBox");
    expect(result).toContain("width=");
  });
});

describe("svgDimensions", () => {
  it("reads explicit width and height", () => {
    expect(svgDimensions('<svg width="120" height="60"></svg>')).toEqual({
      width: 120,
      height: 60,
    });
  });

  it("falls back to the viewBox when width/height are missing", () => {
    expect(svgDimensions('<svg viewBox="0 0 200 100"></svg>')).toEqual({
      width: 200,
      height: 100,
    });
  });

  it("uses a default size when neither dimensions nor viewBox exist", () => {
    expect(svgDimensions("<svg></svg>")).toEqual({ width: 800, height: 800 });
  });
});
