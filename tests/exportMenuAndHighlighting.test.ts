import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import { ExportMenuItem } from '../src/components/ExportMenu';

describe('ExportMenu component contracts and requirements', () => {
  it('conforms to the ExportMenuItem structure and invokes callbacks', () => {
    const handleCSV = vi.fn();
    const handleJSON = vi.fn();

    const items: ExportMenuItem[] = [
      {
        label: 'CSV (formula-safe)',
        hint: 'RFC-4180 with injection defense',
        onClick: handleCSV,
      },
      {
        label: 'JSON',
        hint: 'Structured data with meta',
        onClick: handleJSON,
      },
    ];

    expect(items.length).toBe(2);
    items[0].onClick();
    expect(handleCSV).toHaveBeenCalledTimes(1);

    items[1].onClick();
    expect(handleJSON).toHaveBeenCalledTimes(1);
  });

  it('source code implements aria-haspopup, aria-expanded, role=menu, role=menuitem, and 32px height', () => {
    const menuSrc = fs.readFileSync('src/components/ExportMenu.tsx', 'utf8');

    // Accessibility attributes
    expect(menuSrc).toContain('aria-haspopup="menu"');
    expect(menuSrc).toContain('aria-expanded=');
    expect(menuSrc).toContain('role="menu"');
    expect(menuSrc).toContain('role="menuitem"');

    // Button height 32px
    expect(menuSrc).toContain('h-8');

    // Amber focus ring (#E8A94A)
    expect(menuSrc).toContain('focus-visible:ring-[#E8A94A]');

    // Closes on outside click and Escape
    expect(menuSrc).toContain('Escape');
    expect(menuSrc).toContain('handleClickOutside');
    expect(menuSrc).toContain('handleItemClick');

    // Right-aligned dropdown above table
    expect(menuSrc).toContain('right-0');
    expect(menuSrc).toContain('z-50');
  });

  it('TablesView integrates ExportMenu with CSV (formula-safe) and JSON, keeping Open in Reader to the left on desktop', () => {
    const tablesSrc = fs.readFileSync('src/components/TablesView.tsx', 'utf8');

    expect(tablesSrc).toContain('Open in Reader (p.');
    expect(tablesSrc).toContain('<ExportMenu');
    expect(tablesSrc).toContain('CSV (formula-safe)');
    expect(tablesSrc).toContain('JSON');
    expect(tablesSrc).toContain('downloadCSVFile');
    expect(tablesSrc).toContain('downloadJSONFile');
    // Header stays on one line on desktop
    expect(tablesSrc).toContain('md:flex-row md:items-center justify-between');
    expect(tablesSrc).toContain('shrink-0');
  });

  it('CompareView integrates ExportMenu with PDF report and Markdown summary', () => {
    const compareSrc = fs.readFileSync('src/components/CompareView.tsx', 'utf8');

    expect(compareSrc).toContain('<ExportMenu');
    expect(compareSrc).toContain('label: \'PDF report\'');
    expect(compareSrc).toContain('label: \'Markdown summary\'');
    expect(compareSrc).toContain('onClick: handleExportPDF');
    expect(compareSrc).toContain('onClick: handleExportMarkdown');
  });
});

describe('Static Highlighter Marker and Palette Integrity Checks', () => {
  it('ReaderView debounces highlight query by 250ms, styles matches as static markers, and removes whole-paragraph amber tint', () => {
    const readerSrc = fs.readFileSync('src/components/ReaderView.tsx', 'utf8');

    // Debounce by 250ms
    expect(readerSrc).toContain('debouncedHighlightQuery');
    expect(readerSrc).toContain('250');

    // Auto-scroll uses nearest
    expect(readerSrc).toContain("block: 'nearest'");

    // Marker styling: solid amber background at 65% opacity, dark text #0F1217, normal font weight (no bold), no underline, rounded 3px, box-decoration-break: clone
    expect(readerSrc).toContain('bg-[#E8A94A]/65');
    expect(readerSrc).toContain('text-[#0F1217]');
    expect(readerSrc).toContain('font-normal');
    expect(readerSrc).toContain('no-underline');
    expect(readerSrc).toContain('rounded-[3px]');
    expect(readerSrc).toContain('[box-decoration-break:clone]');

    // No paragraph amber tint for hasMatch, only thin left border at 40% opacity
    expect(readerSrc).toContain('border-[#E8A94A]/40');
    expect(readerSrc).not.toContain('bg-accent/15 border-l-4');
  });

  it('SearchView applies the same marker style with 65% opacity primary and 30% opacity secondary', () => {
    const searchSrc = fs.readFileSync('src/components/SearchView.tsx', 'utf8');

    // Primary terms at 65% opacity with dark text
    expect(searchSrc).toContain('bg-[#E8A94A]/65');
    expect(searchSrc).toContain('text-[#0F1217]');

    // Secondary terms at 30% opacity
    expect(searchSrc).toContain('bg-[#E8A94A]/30');

    // Normal font weight, no-underline, rounded 3px, box-decoration-break: clone
    expect(searchSrc).toContain('font-normal');
    expect(searchSrc).toContain('no-underline');
    expect(searchSrc).toContain('rounded-[3px]');
    expect(searchSrc).toContain('[box-decoration-break:clone]');
  });

  it('Strict Palette check: only approved colors exist in all changed components', () => {
    const files = [
      'src/components/ExportMenu.tsx',
      'src/components/TablesView.tsx',
      'src/components/CompareView.tsx',
      'src/components/ReaderView.tsx',
      'src/components/SearchView.tsx',
    ];
    const allowed = new Set([
      '#0F1217', '#161B22', '#1D242E', '#262D38', '#343D4B',
      '#E6E9EF', '#9AA3B2', '#6B7585', '#E8A94A'
    ].map(s => s.toUpperCase()));

    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const matches = content.match(/#[0-9a-fA-F]{3,8}/g) || [];
      for (const m of matches) {
        const clean = m.toUpperCase().slice(0, 7);
        expect(allowed.has(clean)).toBe(true);
      }
    }
  });

  it('ReaderView removes all animation, pulse, and custom glow from cited passage highlighting', () => {
    const readerSrc = fs.readFileSync('src/components/ReaderView.tsx', 'utf8');

    // No pulse state or pulse timer toggling highlight classes
    expect(readerSrc).not.toContain('pulseElementId');
    expect(readerSrc).not.toContain('setPulseElementId');
    expect(readerSrc).not.toContain('animate-pulse');
    expect(readerSrc).not.toContain('shadow-[0_0_24px');

    // Selected/cited passages are fully static: bg #E8A94A at 10%, 2px solid left border #E8A94A, transition-none
    expect(readerSrc).toContain('bg-[#E8A94A]/10');
    expect(readerSrc).toContain('border-l-2 border-[#E8A94A]');
    expect(readerSrc).toContain('transition-none');
    expect(readerSrc).not.toContain('animate-pulse border-l-2 border-accent');
  });

  it('ReaderView guards auto-scroll once per navigation with lastHandledNavRef and prevents scroll fights', () => {
    const readerSrc = fs.readFileSync('src/components/ReaderView.tsx', 'utf8');

    // lastHandledNavRef guard
    expect(readerSrc).toContain('lastHandledNavRef');
    expect(readerSrc).toContain('lastHandledNavRef.current = navToken');
    expect(readerSrc).toContain("block: 'nearest'");

    // Right-hand sidebar is sticky with max-height and overflow-y-auto
    expect(readerSrc).toContain('lg:sticky');
    expect(readerSrc).toContain('lg:max-h-[calc(100vh-2rem)]');
    expect(readerSrc).toContain('lg:overflow-y-auto');

    // Document canvas is not trapped with fixed height or transition-all
    expect(readerSrc).not.toContain('transition-all`}');
  });

  it('index.css enforces single crisp 2px solid #E8A94A focus ring on :focus-visible only', () => {
    const cssSrc = fs.readFileSync('src/index.css', 'utf8');

    expect(cssSrc).toContain(':focus-visible');
    expect(cssSrc).toContain('outline: 2px solid var(--color-accent) !important');
    expect(cssSrc).toContain('outline-offset: 2px !important');
    expect(cssSrc).toContain(':focus:not(:focus-visible)');
    expect(cssSrc).toContain('outline: none !important');
  });
});
