
import { workerData, parentPort } from 'worker_threads';
import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function findImports(importPath: string): { contents: string } | { error: string } {
  const roots = [
    process.cwd(),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  ];
  for (const root of roots) {
    try {
      const fullPath = path.join(root, 'node_modules', importPath);
      if (fs.existsSync(fullPath)) return { contents: fs.readFileSync(fullPath, 'utf8') };
    } catch {}
  }
  if (fs.existsSync(importPath)) {
    try { return { contents: fs.readFileSync(importPath, 'utf8') }; } catch {}
  }
  return { error: `Import not found: ${importPath}` };
}

try {
  const output = JSON.parse(
    solc.compile(JSON.stringify(workerData.input), { import: findImports })
  );
  parentPort!.postMessage({ ok: true, output });
} catch (err: any) {
  parentPort!.postMessage({ ok: false, error: err.message });
}
