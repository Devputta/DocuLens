import { describe, it, expect } from 'vitest';
import {
  screenToPdfCoordinates,
  pdfToScreenCoordinates,
  normalizeScreenRect,
} from '../src/services/regionCapture';

describe('Region Capture — Screen to PDF Coordinate Conversion Across Zoom Levels (Requirement 5)', () => {
  // Standard Letter page dimensions in PDF points (72 DPI points)
  const pdfWidth = 612;
  const pdfHeight = 792;

  // Rendered DOM dimensions on screen
  const domWidth = 800;
  const domHeight = 1000;

  it('converts screen coordinates to PDF space accurately at 1.0x (100% standard zoom)', () => {
    // Selection covering top-left quadrant of the screen canvas (400x500 out of 800x1000)
    const screenRect = { x: 0, y: 0, width: 400, height: 500 };

    const pdfCoords = screenToPdfCoordinates({
      screenRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 1.0,
    });

    // 400 / 800 = 0.5 -> 0.5 * 612 = 306
    // 500 / 1000 = 0.5 -> 0.5 * 792 = 396
    expect(pdfCoords.x).toBe(0);
    expect(pdfCoords.y).toBe(0);
    expect(pdfCoords.width).toBe(306);
    expect(pdfCoords.height).toBe(396);
  });

  it('converts center selection at 1.0x zoom', () => {
    // 200px centered box: x: 200..600 (width 400), y: 250..750 (height 500)
    const screenRect = { x: 200, y: 250, width: 400, height: 500 };

    const pdfCoords = screenToPdfCoordinates({
      screenRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 1.0,
    });

    // x: 200 / 800 = 0.25 -> 0.25 * 612 = 153
    // y: 250 / 1000 = 0.25 -> 0.25 * 792 = 198
    // w: 400 / 800 = 0.50 -> 0.50 * 612 = 306
    // h: 500 / 1000 = 0.50 -> 0.50 * 792 = 396
    expect(pdfCoords.x).toBe(153);
    expect(pdfCoords.y).toBe(198);
    expect(pdfCoords.width).toBe(306);
    expect(pdfCoords.height).toBe(396);
  });

  it('converts coordinates accurately at 0.5x zoom (zoomed out)', () => {
    // At 0.5x zoom, effective display width is 800 * 0.5 = 400px, height is 1000 * 0.5 = 500px.
    // A screen selection of 200x250 pixels on this zoomed-out canvas covers 50% of the page.
    const screenRect = { x: 100, y: 125, width: 200, height: 250 };

    const pdfCoords = screenToPdfCoordinates({
      screenRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 0.5,
    });

    // x: 100 / (800 * 0.5) = 100 / 400 = 0.25 -> 0.25 * 612 = 153
    // y: 125 / (1000 * 0.5) = 125 / 500 = 0.25 -> 0.25 * 792 = 198
    // w: 200 / (800 * 0.5) = 200 / 400 = 0.50 -> 0.50 * 612 = 306
    // h: 250 / (1000 * 0.5) = 250 / 500 = 0.50 -> 0.50 * 792 = 396
    expect(pdfCoords.x).toBe(153);
    expect(pdfCoords.y).toBe(198);
    expect(pdfCoords.width).toBe(306);
    expect(pdfCoords.height).toBe(396);
  });

  it('converts coordinates accurately at 1.5x zoom', () => {
    // At 1.5x zoom, effective display width is 800 * 1.5 = 1200px, height is 1000 * 1.5 = 1500px.
    // Screen selection of 600x750 pixels covers 50% of the page.
    const screenRect = { x: 300, y: 375, width: 600, height: 750 };

    const pdfCoords = screenToPdfCoordinates({
      screenRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 1.5,
    });

    // x: 300 / 1200 = 0.25 -> 153
    // y: 375 / 1500 = 0.25 -> 198
    // w: 600 / 1200 = 0.50 -> 306
    // h: 750 / 1500 = 0.50 -> 396
    expect(pdfCoords.x).toBe(153);
    expect(pdfCoords.y).toBe(198);
    expect(pdfCoords.width).toBe(306);
    expect(pdfCoords.height).toBe(396);
  });

  it('converts coordinates accurately at 2.0x zoom (zoomed in)', () => {
    // At 2.0x zoom, effective display width is 800 * 2 = 1600px, height is 1000 * 2 = 2000px.
    // A 400x500 px box on screen covers 25% width and 25% height of the page.
    const screenRect = { x: 400, y: 500, width: 400, height: 500 };

    const pdfCoords = screenToPdfCoordinates({
      screenRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 2.0,
    });

    // x: 400 / 1600 = 0.25 -> 0.25 * 612 = 153
    // y: 500 / 2000 = 0.25 -> 0.25 * 792 = 198
    // w: 400 / 1600 = 0.25 -> 0.25 * 612 = 153
    // h: 500 / 2000 = 0.25 -> 0.25 * 792 = 198
    expect(pdfCoords.x).toBe(153);
    expect(pdfCoords.y).toBe(198);
    expect(pdfCoords.width).toBe(153);
    expect(pdfCoords.height).toBe(198);
  });

  it('inverts PDF point coordinates back to screen pixels reliably', () => {
    const pdfRect = { x: 153, y: 198, width: 306, height: 396 };

    // At 1.0x
    const screenAt1x = pdfToScreenCoordinates({
      pdfRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 1.0,
    });
    expect(screenAt1x.x).toBe(200);
    expect(screenAt1x.y).toBe(250);
    expect(screenAt1x.width).toBe(400);
    expect(screenAt1x.height).toBe(500);

    // At 2.0x
    const screenAt2x = pdfToScreenCoordinates({
      pdfRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 2.0,
    });
    expect(screenAt2x.x).toBe(400);
    expect(screenAt2x.y).toBe(500);
    expect(screenAt2x.width).toBe(800);
    expect(screenAt2x.height).toBe(1000);
  });

  it('clamps coordinates safely when drag exceeds boundary bounds', () => {
    const outOfBoundsScreenRect = { x: -50, y: -20, width: 1200, height: 1500 };

    const pdfCoords = screenToPdfCoordinates({
      screenRect: outOfBoundsScreenRect,
      domWidth,
      domHeight,
      pdfWidth,
      pdfHeight,
      zoomLevel: 1.0,
    });

    expect(pdfCoords.x).toBe(0);
    expect(pdfCoords.y).toBe(0);
    expect(pdfCoords.width).toBe(pdfWidth);
    expect(pdfCoords.height).toBe(pdfHeight);
  });

  it('normalizes screen rectangles to 0..1 intervals cleanly', () => {
    const norm = normalizeScreenRect(
      { x: 200, y: 250, width: 400, height: 500 },
      domWidth,
      domHeight,
      1.0
    );

    expect(norm.x).toBe(0.25);
    expect(norm.y).toBe(0.25);
    expect(norm.width).toBe(0.5);
    expect(norm.height).toBe(0.5);
  });
});
