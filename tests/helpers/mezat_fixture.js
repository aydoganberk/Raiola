const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeMezatLikeRepo(prefix = 'raiola-mezat-fixture-') {
  const targetRepo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'mezat-fixture',
    private: true,
    workspaces: ['apps/*'],
  }, null, 2));
  writeFile(targetRepo, 'turbo.json', JSON.stringify({
    pipeline: {
      build: { dependsOn: ['^build'] },
      test: { dependsOn: ['^test'] },
    },
  }, null, 2));
  writeFile(targetRepo, 'CODEOWNERS', [
    '/apps/web @web-team',
    '/apps/mobile @mobile-team',
    '/apps/api @api-team',
    '',
  ].join('\n'));

  writeFile(targetRepo, 'apps/web/package.json', JSON.stringify({
    name: '@mezat/web',
    dependencies: { next: '15.0.0' },
  }, null, 2));
  writeFile(targetRepo, 'apps/web/app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'apps/web/app/page.tsx', 'export default function Page() { return <main>Web</main>; }\n');

  writeFile(targetRepo, 'apps/mobile/package.json', JSON.stringify({
    name: '@mezat/mobile',
    dependencies: {
      expo: '52.0.0',
      'expo-router': '4.0.0',
      'react-native': '0.76.0',
    },
  }, null, 2));
  writeFile(targetRepo, 'apps/mobile/app.json', JSON.stringify({ expo: { name: 'Mezat' } }, null, 2));
  writeFile(targetRepo, 'apps/mobile/app/_layout.tsx', 'export default function Layout() { return null; }\n');
  writeFile(targetRepo, 'apps/mobile/app/home.tsx', 'export default function Home() { return null; }\n');

  writeFile(targetRepo, 'apps/api/package.json', JSON.stringify({
    name: '@mezat/api',
    dependencies: {
      hono: '4.6.0',
      '@upstash/redis': '1.0.0',
      jsonwebtoken: '9.0.0',
      'firebase-admin': '13.0.0',
    },
    scripts: {
      test: 'node --test',
    },
  }, null, 2));
  writeFile(targetRepo, 'apps/api/src/server.ts', [
    "import { Hono } from 'hono';",
    "import { Redis } from '@upstash/redis';",
    "import jwt from 'jsonwebtoken';",
    'const app = new Hono();',
    "app.use('*', async (c, next) => next());",
    "app.get('/health', (c) => c.json({ ok: true }));",
    "app.post('/bids', (c) => c.json({ ok: true }));",
    '',
  ].join('\n'));
  writeFile(targetRepo, 'apps/api/src/repositories/itemRepository.ts', [
    "import { getFirestore } from 'firebase-admin/firestore';",
    'export class ItemRepository {',
    '  constructor() {',
    '    this.db = getFirestore();',
    '  }',
    '}',
    '',
  ].join('\n'));

  return targetRepo;
}

module.exports = {
  makeMezatLikeRepo,
  writeFile,
};
