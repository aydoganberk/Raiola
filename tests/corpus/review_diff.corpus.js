function createFileDiff(filePath, beforeLines, afterLines) {
  const before = beforeLines.length > 0 ? beforeLines.map((line) => `-${line}`).join('\n') : '-placeholder';
  const after = afterLines.length > 0 ? afterLines.map((line) => `+${line}`).join('\n') : '+placeholder';
  return `diff --git a/${filePath} b/${filePath}
--- a/${filePath}
+++ b/${filePath}
@@
${before}
${after}
`;
}

function createLargeAfterLines(count) {
  return Array.from({ length: count }, (_, index) => `export const line${index + 1} = ${index + 1};`);
}

function buildReviewDiffCorpus() {
  return [
    {
      id: 'dependency-bump-no-tests',
      diffText: createFileDiff('package.json', ['"version": "1.0.0"'], ['"version": "1.0.1"', '"react": "19.0.0"']),
      expectedCategories: ['regression', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'dependency-bump-with-test',
      diffText: [
        createFileDiff('package-lock.json', ['"lockfileVersion": 2'], ['"lockfileVersion": 3']),
        createFileDiff('tests/smoke.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      ].join('\n'),
      expectedCategories: ['regression'],
      maxBlockers: 0,
    },
    {
      id: 'frontend-page-no-evidence',
      diffText: createFileDiff('app/page.tsx', ['export default function Page() { return <main>Old</main>; }'], ['export default function Page() { return <main>New</main>; }']),
      expectedCategories: ['frontend ux/a11y', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'frontend-page-todo',
      diffText: createFileDiff('app/page.tsx', ['export default function Page() { return <main>Old</main>; }'], ['export default function Page() { return <main>TODO improve copy</main>; }']),
      expectedCategories: ['frontend ux/a11y', 'maintainability', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'source-console-log',
      diffText: createFileDiff('src/service.ts', ['export function run() { return true; }'], ['export function run() { console.log("debug"); return true; }']),
      expectedCategories: ['maintainability', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'source-todo',
      diffText: createFileDiff('src/cache.ts', ['export const ttl = 60;'], ['export const ttl = 60; // TODO tighten later']),
      expectedCategories: ['maintainability', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'source-secret',
      diffText: createFileDiff('src/auth.ts', ['export const token = process.env.API_TOKEN;'], ['export const token = "secret-token";']),
      expectedCategories: ['security', 'test gap'],
      minBlockers: 2,
    },
    {
      id: 'workflow-readfilesync',
      diffText: createFileDiff('scripts/workflow/custom.js', ['module.exports = () => null;'], ['const fs = require("node:fs");', 'module.exports = () => fs.readFileSync("x", "utf8");']),
      expectedCategories: ['performance', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'workflow-statsync-with-test',
      diffText: [
        createFileDiff('scripts/workflow/custom.js', ['module.exports = () => null;'], ['const fs = require("node:fs");', 'module.exports = () => fs.statSync("x");']),
        createFileDiff('tests/custom.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      ].join('\n'),
      expectedCategories: ['performance'],
      maxBlockers: 0,
    },
    {
      id: 'large-source-file',
      diffText: createFileDiff('src/big-file.ts', ['export const oldLine = 0;'], createLargeAfterLines(170)),
      expectedCategories: ['architecture', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'sql-migration-drop-table',
      diffText: createFileDiff('db/migrations/001_drop_users.sql', ['SELECT 1;'], ['DROP TABLE users;']),
      expectedCategories: ['data/migration', 'test gap'],
      minBlockers: 2,
    },
    {
      id: 'prisma-migration-with-test',
      diffText: [
        createFileDiff('prisma/migrations/20260406_init/migration.sql', ['SELECT 1;'], ['ALTER TABLE accounts ADD COLUMN role TEXT;']),
        createFileDiff('tests/migration.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      ].join('\n'),
      expectedCategories: ['data/migration'],
      minBlockers: 1,
    },
    {
      id: 'api-route-no-test',
      diffText: createFileDiff('app/api/items/route.ts', ['export async function GET() { return Response.json([]); }'], ['export async function POST() { return Response.json({ ok: true }); }']),
      expectedCategories: ['API drift', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'controller-with-test',
      diffText: [
        createFileDiff('src/controllers/users.controller.ts', ['export const listUsers = () => [];'], ['export const listUsers = (limit = 20) => [];']),
        createFileDiff('tests/users.controller.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      ].join('\n'),
      expectedCategories: ['API drift'],
      maxBlockers: 0,
    },
    {
      id: 'frontend-console-log',
      diffText: createFileDiff('components/Hero.tsx', ['export function Hero() { return <section>Old</section>; }'], ['export function Hero() { console.log("debug"); return <section>New</section>; }']),
      expectedCategories: ['frontend ux/a11y', 'maintainability', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'dependency-plus-secret',
      diffText: [
        createFileDiff('package.json', ['"version": "1.0.0"'], ['"version": "1.0.2"', '"next": "15.0.0"']),
        createFileDiff('src/config.ts', ['export const key = process.env.KEY;'], ['export const key = "password-123";']),
      ].join('\n'),
      expectedCategories: ['regression', 'security', 'test gap'],
      minBlockers: 2,
    },
    {
      id: 'workflow-todo-and-sync',
      diffText: createFileDiff('scripts/workflow/doctor_extra.js', ['module.exports = () => null;'], ['const fs = require("node:fs");', 'module.exports = () => { /* TODO improve */ return fs.readdirSync("."); };']),
      expectedCategories: ['maintainability', 'performance', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'frontend-large-diff',
      diffText: createFileDiff('app/dashboard/page.tsx', ['export default function Page() { return <main>Old</main>; }'], createLargeAfterLines(165)),
      expectedCategories: ['frontend ux/a11y', 'architecture', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'docs-only',
      diffText: createFileDiff('docs/workflow/STATUS.md', ['- Old'], ['- New']),
      expectedCategories: [],
      maxBlockers: 0,
    },
    {
      id: 'test-only',
      diffText: createFileDiff('tests/feature.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      expectedCategories: [],
      maxBlockers: 0,
    },
    {
      id: 'source-with-test-clean',
      diffText: [
        createFileDiff('src/parser.ts', ['export const parse = (value) => value.trim();'], ['export const parse = (value) => value.trim().toLowerCase();']),
        createFileDiff('tests/parser.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      ].join('\n'),
      expectedCategories: [],
      maxBlockers: 0,
    },
    {
      id: 'graphql-api-change',
      diffText: createFileDiff('src/api/graphql/schema.ts', ['export const schema = `type Query { ping: String }`;'], ['export const schema = `type Query { ping(limit: Int): String }`;']),
      expectedCategories: ['API drift', 'test gap'],
      minBlockers: 1,
    },
    {
      id: 'migration-and-api',
      diffText: [
        createFileDiff('db/migrations/002_add_orders.sql', ['SELECT 1;'], ['CREATE TABLE orders (id INT);']),
        createFileDiff('app/api/orders/route.ts', ['export async function GET() { return Response.json([]); }'], ['export async function POST() { return Response.json({ created: true }); }']),
      ].join('\n'),
      expectedCategories: ['data/migration', 'API drift', 'test gap'],
      minBlockers: 2,
    },
    {
      id: 'dependency-and-console-with-test',
      diffText: [
        createFileDiff('package.json', ['"version": "1.0.0"'], ['"version": "1.0.3"', '"swr": "2.3.0"']),
        createFileDiff('src/client.ts', ['export const fetcher = () => "ok";'], ['export const fetcher = () => { console.log("debug"); return "ok"; };']),
        createFileDiff('tests/client.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      ].join('\n'),
      expectedCategories: ['regression', 'maintainability'],
      maxBlockers: 0,
    },
    {
      id: 'security-config-with-test',
      diffText: [
        createFileDiff('src/env.ts', ['export const password = process.env.DB_PASSWORD;'], ['export const password = "credential";']),
        createFileDiff('tests/env.test.js', ['test("old", () => {});'], ['test("new", () => {});']),
      ].join('\n'),
      expectedCategories: ['security'],
      minBlockers: 1,
    },
    {
      id: 'frontend-inline-style',
      diffText: createFileDiff('components/Card.tsx', ['export function Card() { return <div className="rounded-md">Old</div>; }'], ['export function Card() { return <div style={{ color: "#ff00aa", borderRadius: "18px" }}>New</div>; }']),
      expectedCategories: ['frontend ux/a11y', 'test gap'],
      minBlockers: 1,
    },
  ];
}

module.exports = {
  buildReviewDiffCorpus,
};
