const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildFrontendProfile } = require('../scripts/workflow/map_frontend');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-frontend-depth-'));
}

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test('buildFrontendProfile surfaces deeper component intelligence and browser readiness', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'frontend-depth',
    private: true,
    dependencies: {
      next: '15.0.0',
      react: '19.0.0',
      'react-dom': '19.0.0',
    },
  }, null, 2));
  writeFile(targetRepo, 'components.json', '{ "style": "default" }\n');
  writeFile(targetRepo, 'app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', [
    'import { TableShell } from "../components/TableShell";',
    'import { SettingsForm } from "../components/SettingsForm";',
    'import { StatusBanner } from "../components/StatusBanner";',
    'export default function Page() {',
    '  return <main><h1>Dashboard</h1><StatusBanner /><SettingsForm /><TableShell /></main>;',
    '}',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'app/settings/page.tsx', [
    'import { TableShell } from "../../components/TableShell";',
    'import { StatusBanner } from "../../components/StatusBanner";',
    'export default function SettingsPage() {',
    '  return <main><h1>Settings</h1><StatusBanner /><TableShell /></main>;',
    '}',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'components/TableShell.tsx', 'export function TableShell() { return <table><thead><tr><th>Metric</th></tr></thead><tbody><tr><td>42</td></tr></tbody></table>; }\n');
  writeFile(targetRepo, 'components/SettingsForm.tsx', 'export interface SettingsFormProps { value?: string }\nexport function SettingsForm({ value }: SettingsFormProps) { return <form><label htmlFor="email">Email</label><input id="email" defaultValue={value} /><button type="submit">Save</button></form>; }\n');
  writeFile(targetRepo, 'components/StatusBanner.tsx', 'export function StatusBanner() { return <div aria-live="polite">loading success error retry saved</div>; }\n');
  writeFile(targetRepo, 'components/Modal.tsx', 'export function Modal() { return <dialog open><button type="button">Close</button></dialog>; }\n');
  writeFile(targetRepo, 'app/dashboard/_components/QuickAction.tsx', 'export function QuickAction() { return <button type="button">Run</button>; }\n');

  const rootDir = path.join(targetRepo, 'docs', 'workflow');
  const profile = buildFrontendProfile(targetRepo, rootDir, {
    scope: 'repo',
    allowMissingWorkflow: true,
    refresh: 'full',
  });

  assert.equal(profile.frontendMode.active, true);
  assert.ok(profile.componentIntelligence.totalComponents >= 5);
  assert.ok(profile.componentIntelligence.familyCounts.form >= 1);
  assert.ok(profile.componentIntelligence.familyCounts['data-display'] >= 1);
  assert.ok(profile.componentIntelligence.familyCounts.feedback >= 1);
  assert.equal(profile.componentIntelligence.reuse.verdict, 'pass');
  assert.ok(profile.componentIntelligence.topReusableComponents.some((item) => item.name === 'TableShell'));
  assert.ok(profile.componentIntelligence.stateCoverage.present.includes('loading'));
  assert.ok(profile.componentIntelligence.stateCoverage.present.includes('success'));
  assert.equal(profile.browserReadiness.recommendedLane, 'smoke-plus-manual');
  assert.ok(profile.browserReadiness.observationTargets.includes('data surface'));
  assert.ok(profile.browserReadiness.observationTargets.includes('form submit path'));
});
