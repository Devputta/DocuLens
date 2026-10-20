import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const outDir = path.resolve(projectRoot, 'public/ocr');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Copy worker.min.js from tesseract.js
const workerSrc = path.resolve(projectRoot, 'node_modules/tesseract.js/dist/worker.min.js');
if (fs.existsSync(workerSrc)) {
  fs.copyFileSync(workerSrc, path.join(outDir, 'worker.min.js'));
} else {
  console.warn('[copy-ocr-assets] worker.min.js not found in node_modules/tesseract.js/dist');
}

// Copy core files from tesseract.js-core
const coreDir = path.resolve(projectRoot, 'node_modules/tesseract.js-core');
if (fs.existsSync(coreDir)) {
  const coreFiles = fs.readdirSync(coreDir).filter((file) => file.startsWith('tesseract-core'));
  for (const file of coreFiles) {
    fs.copyFileSync(path.join(coreDir, file), path.join(outDir, file));
  }
} else {
  console.warn('[copy-ocr-assets] tesseract.js-core directory not found');
}

console.log('[copy-ocr-assets] Successfully copied Tesseract worker and WASM assets to public/ocr/');
