# Contributing to DocuLens

Thank you for your interest in contributing to DocuLens! DocuLens is dedicated to advancing local-first document processing with strict privacy and mathematical provenance.

---

## 1. Development Setup

### Prerequisites
- **Node.js**: >= 20.0.0
- **npm**: >= 10.0.0

### Getting Started
```bash
# 1. Clone the repository
git clone https://github.com/Devputta/DocuLens.git
cd DocuLens

# 2. Install dependencies and generate package-lock
npm install

# 3. Configure environment
cp .env.example .env
# Optional: Set GEMINI_API_KEY if testing remote AI capabilities

# 4. Start local development server
npm run dev
```

The application will be accessible at `http://localhost:3000`.

---

## 2. Branching & Commit Conventions

### Branch Strategy
- `main`: Production-ready branch.
- Feature branches: `feat/<feature-name>`, `fix/<bug-name>`, `refactor/<scope>`.

### Conventional Commits
All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature or user-facing analytical capability.
- `fix:` A bug fix or resilience patch.
- `docs:` Documentation additions or updates.
- `test:` Adding missing tests or correcting existing tests.
- `refactor:` Code changes that neither fix a bug nor add a feature.
- `chore:` Dependency bumps, build script updates, or configuration changes.

Examples:
- `feat: add docx ingestion via local mammoth parser`
- `fix: prevent arraybuffer detachment during pdf worker postMessage`
- `test: add unit tests for install dialog and iframe warning`

---

## 3. Quality & Verification Gates

Before submitting a Pull Request, you must verify that all automated gates pass cleanly:

```bash
# Run linting, unit tests, and production build in sequence
npm run verify
```

Every PR must satisfy:
1. `npm run lint` passes with 0 TypeScript errors or warnings.
2. `npm test` passes all 22 test suites with 0 test failures.
3. `npm run build` completes successfully.
4. Clean browser console without runtime `console.error` or unhandled rejections during standard workflows.

---

## 4. How to Add a New Service & Corresponding Test

Follow this standard pattern when introducing new capabilities:

### Step 1: Define Interfaces & Types
Create or update domain types in `src/types/doculens.ts`:
```ts
export interface MetricsCalculation {
  metricId: string;
  documentId: string;
  value: number;
  unit: string;
}
```

### Step 2: Implement the Service
Implement your pure or storage-backed logic in `src/services/` (e.g. `src/services/metricsCalculator.ts`):
```ts
import { storage } from './storage';
import { MetricsCalculation } from '../types/doculens';

export function calculateReadingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 200);
}
```

### Step 3: Write a Dedicated Vitest Test
Add a corresponding test file in `tests/` (e.g. `tests/metricsCalculator.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { calculateReadingTimeMinutes } from '../src/services/metricsCalculator';

describe('Metrics Calculator Service', () => {
  it('calculates reading time assuming 200 words per minute', () => {
    const text = 'word '.repeat(400);
    expect(calculateReadingTimeMinutes(text)).toBe(2);
  });
});
```

### Step 4: Run and Verify
```bash
npx vitest run tests/metricsCalculator.test.ts
npm run verify
```
