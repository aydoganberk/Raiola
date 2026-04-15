const fs = require('node:fs');
const path = require('node:path');

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function defaultSharedPackage(index) {
  const name = `@fixture/shared-${String(index).padStart(2, '0')}`;
  return {
    relativePath: `packages/shared-${String(index).padStart(2, '0')}`,
    manifest: {
      name,
      version: '1.0.0',
      private: true,
      scripts: {
        test: 'node --test',
      },
    },
    source: [
      `export function value${index}() {`,
      `  return '${name}';`,
      '}',
      '',
    ].join('\n'),
  };
}

function generatePolyglotFixture(targetRepo, options = {}) {
  const sharedPackageCount = Math.max(6, Number(options.sharedPackageCount || 18));

  writeFile(targetRepo, '.gitignore', ['node_modules', '.workflow/', '.turbo', 'dist', 'coverage', ''].join('\n'));
  writeFile(targetRepo, 'pnpm-workspace.yaml', ['packages:', '  - apps/*', '  - packages/*', ''].join('\n'));
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'polyglot-benchmark-fixture',
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    scripts: {
      test: 'pnpm -r test',
      lint: 'pnpm -r lint',
      release: 'changeset publish',
      'repo:format': 'prettier -w .',
    },
  }, null, 2));
  writeFile(targetRepo, 'turbo.json', JSON.stringify({
    pipeline: {
      build: { dependsOn: ['^build'] },
      test: { dependsOn: ['^test'] },
      lint: { dependsOn: ['^lint'] },
    },
  }, null, 2));
  writeFile(targetRepo, 'CODEOWNERS', [
    '/apps/web @web-team',
    '/apps/mobile @mobile-team',
    '/apps/api @api-team',
    '/packages @shared-team',
    '/services/go-api @go-team',
    '/services/python-worker @ml-team',
    '/services/rust-engine @engine-team',
    '/services/java-audit @audit-team',
    '/tools/bazel-util @platform-team',
    '',
  ].join('\n'));

  writeFile(targetRepo, 'apps/web/package.json', JSON.stringify({
    name: '@fixture/web',
    private: true,
    dependencies: {
      next: '15.0.0',
      react: '19.0.0',
      'react-dom': '19.0.0',
      '@fixture/shared-00': 'workspace:*',
    },
    scripts: {
      build: 'next build',
      test: 'node --test',
    },
  }, null, 2));
  writeFile(targetRepo, 'apps/web/app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'apps/web/app/page.tsx', [
    "import { value0 } from '@fixture/shared-00';",
    'export default function Page() {',
    '  return <main>{value0()}</main>;',
    '}',
    '',
  ].join('\n'));

  writeFile(targetRepo, 'apps/mobile/package.json', JSON.stringify({
    name: '@fixture/mobile',
    private: true,
    dependencies: {
      expo: '52.0.0',
      'expo-router': '4.0.0',
      'react-native': '0.76.0',
      '@fixture/shared-01': 'workspace:*',
    },
    scripts: {
      test: 'node --test',
      start: 'expo start',
    },
  }, null, 2));
  writeFile(targetRepo, 'apps/mobile/app.json', JSON.stringify({ expo: { name: 'Polyglot' } }, null, 2));
  writeFile(targetRepo, 'apps/mobile/app/_layout.tsx', 'export default function Layout() { return null; }\n');
  writeFile(targetRepo, 'apps/mobile/app/home.tsx', [
    "import { value1 } from '@fixture/shared-01';",
    'export default function Home() {',
    '  return value1() as any;',
    '}',
    '',
  ].join('\n'));

  writeFile(targetRepo, 'apps/api/package.json', JSON.stringify({
    name: '@fixture/api',
    private: true,
    dependencies: {
      hono: '4.6.0',
      '@upstash/redis': '1.0.0',
      jsonwebtoken: '9.0.0',
      'firebase-admin': '13.0.0',
      '@fixture/shared-02': 'workspace:*',
    },
    scripts: {
      test: 'node --test',
      verify: 'node --test && echo ok',
    },
  }, null, 2));
  writeFile(targetRepo, 'apps/api/src/server.ts', [
    "import { Hono } from 'hono';",
    "import { Redis } from '@upstash/redis';",
    "import jwt from 'jsonwebtoken';",
    "import { value2 } from '@fixture/shared-02';",
    'const redis = new Redis({ url: process.env.UPSTASH_URL || \"\", token: process.env.UPSTASH_TOKEN || \"\" });',
    'const app = new Hono();',
    "app.use('*', async (c, next) => {",
    '  const token = c.req.header(\"authorization\") || value2();',
    '  if (token) jwt.decode(token);',
    '  await next();',
    '});',
    "app.get('/health', (c) => c.json({ ok: true }));",
    "app.post('/bids', async (c) => { await redis.set('lastBid', '1'); return c.json({ ok: true }); });",
    'export default app;',
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

  for (let index = 0; index < sharedPackageCount; index += 1) {
    const spec = defaultSharedPackage(index);
    writeFile(targetRepo, `${spec.relativePath}/package.json`, JSON.stringify(spec.manifest, null, 2));
    writeFile(targetRepo, `${spec.relativePath}/src/index.ts`, spec.source);
  }

  writeFile(targetRepo, 'go.work', 'go 1.22\nuse ./services/go-api\n');
  writeFile(targetRepo, 'services/go-api/go.mod', 'module example.com/go-api\ngo 1.22\n');
  writeFile(targetRepo, 'services/go-api/main.go', [
    'package main',
    '',
    'func main() {}',
    '',
  ].join('\n'));

  writeFile(targetRepo, 'services/python-worker/pyproject.toml', [
    '[project]',
    'name = "python-worker"',
    'version = "0.1.0"',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'services/python-worker/app/main.py', 'def run():\n    return "ok"\n');

  writeFile(targetRepo, 'services/rust-engine/Cargo.toml', [
    '[package]',
    'name = "rust-engine"',
    'version = "0.1.0"',
    'edition = "2021"',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'services/rust-engine/src/main.rs', 'fn main() {}\n');

  writeFile(targetRepo, 'services/java-audit/pom.xml', [
    '<project>',
    '  <modelVersion>4.0.0</modelVersion>',
    '  <groupId>example</groupId>',
    '  <artifactId>java-audit</artifactId>',
    '  <version>1.0.0</version>',
    '</project>',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'services/java-audit/src/main/java/AuditMain.java', 'class AuditMain {}\n');

  writeFile(targetRepo, 'MODULE.bazel', 'module(name = "polyglot_fixture")\n');
  writeFile(targetRepo, 'tools/bazel-util/BUILD.bazel', 'exports_files(["tool.sh"])\n');
  writeFile(targetRepo, 'tools/bazel-util/tool.sh', '#!/usr/bin/env bash\necho ok\n');

  return targetRepo;
}

module.exports = {
  generatePolyglotFixture,
};
