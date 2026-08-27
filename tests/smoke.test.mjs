import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = '/opt/data/unified-utility-platform';

const requiredFiles = [
  'package.json',
  'README.md',
  'src/app/page.tsx',
  'src/app/about/page.tsx',
  'src/app/tools/transcript/page.tsx',
  'src/app/tools/downloader/page.tsx',
  'src/app/tools/converter/page.tsx',
  'src/app/tools/signature/page.tsx',
  'src/app/tools/paper-calculator/page.tsx',
  'src/app/api/transcript/route.ts',
  'src/app/api/downloader/probe/route.ts',
  'src/app/api/downloader/download/route.ts',
  'src/app/api/converter/catalog/route.ts',
  'src/app/api/converter/convert/route.ts',
];

test('required app files exist', () => {
  for (const rel of requiredFiles) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`);
  }
});

test('README documents the project', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /Unified Utility Platform/);
  assert.match(readme, /npm run dev/);
});
