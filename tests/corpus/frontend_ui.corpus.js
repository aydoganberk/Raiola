const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function updatePackageJson(targetRepo, updater) {
  const filePath = path.join(targetRepo, 'package.json');
  const pkg = readJson(filePath);
  updater(pkg);
  fs.writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function addCoreNextApp(targetRepo, { withShadcn = false } = {}) {
  updatePackageJson(targetRepo, (pkg) => {
    pkg.dependencies = {
      ...(pkg.dependencies || {}),
      next: '15.0.0',
      react: '19.0.0',
      'react-dom': '19.0.0',
    };
  });
  writeFile(targetRepo, 'app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main><h1>Dashboard</h1><p>Ready</p></main>; }\n');
  writeFile(targetRepo, 'components/Button.tsx', 'export function Button({ children }) { return <button type="button" className="rounded-md px-4 py-2">{children}</button>; }\n');
  if (withShadcn) {
    writeFile(targetRepo, 'components.json', '{ "style": "default" }\n');
  }
}

function addMilestoneContextLink(targetRepo, link) {
  const contextPath = path.join(targetRepo, 'docs', 'workflow', 'CONTEXT.md');
  const context = fs.readFileSync(contextPath, 'utf8');
  const next = context.replace('## User Intent', `## User Intent\n\n- \`${link}\``);
  fs.writeFileSync(contextPath, next);
}

function buildFrontendUiCorpus() {
  return [
    {
      id: 'next-shadcn-minimal',
      title: 'Next app with shadcn and no browser evidence',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
      },
      expectations: {
        frontendActive: true,
        debtIncludes: ['evidence', 'missing states'],
        inventoryMin: 1,
      },
    },
    {
      id: 'next-preview-playwright',
      title: 'Preview-ready Next app with Playwright',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
        updatePackageJson(targetRepo, (pkg) => {
          pkg.devDependencies = {
            ...(pkg.devDependencies || {}),
            '@playwright/test': '1.52.0',
          };
        });
        writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1><button>Ship</button></main></body></html>\n');
      },
      expectations: {
        frontendActive: true,
        debtExcludes: ['browser automation', 'evidence'],
        browserArtifactsMin: 1,
      },
    },
    {
      id: 'shared-tailwind-inventory',
      title: 'Tailwind with several shared components',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
        updatePackageJson(targetRepo, (pkg) => {
          pkg.devDependencies = {
            ...(pkg.devDependencies || {}),
            tailwindcss: '4.0.0',
          };
        });
        writeFile(targetRepo, 'tailwind.config.ts', 'export default {};\n');
        writeFile(targetRepo, 'components/Card.tsx', 'export function Card({ children }) { return <section className="rounded-xl border p-6">{children}</section>; }\n');
        writeFile(targetRepo, 'components/Table.tsx', 'export function Table() { return <div className="grid gap-4 md:grid-cols-2">Table</div>; }\n');
      },
      expectations: {
        stylingIncludes: ['Tailwind'],
        inventoryMin: 3,
      },
    },
    {
      id: 'local-only-ui',
      title: 'Single page UI without shared component depth',
      setup(targetRepo) {
        addCoreNextApp(targetRepo);
        writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main><section>Local only</section></main>; }\n');
        fs.rmSync(path.join(targetRepo, 'components'), { recursive: true, force: true });
      },
      expectations: {
        debtIncludes: ['component reuse'],
      },
    },
    {
      id: 'missing-states-absent',
      title: 'Core states are missing from the UI tree',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
      },
      expectations: {
        missingIncludes: ['loading', 'error', 'disabled'],
      },
    },
    {
      id: 'missing-states-complete',
      title: 'Core states are explicitly represented',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
        writeFile(targetRepo, 'app/loading.tsx', 'export default function Loading() { return <div>loading...</div>; }\n');
        writeFile(targetRepo, 'app/error.tsx', 'export default function Error() { return <div>try again after error</div>; }\n');
        writeFile(targetRepo, 'components/Status.tsx', 'export function Status() { return <div aria-disabled="true">empty success disabled hover focus active</div>; }\n');
      },
      expectations: {
        missingExcludes: ['loading', 'error', 'success', 'disabled', 'interaction'],
      },
    },
    {
      id: 'token-drift-inline-style',
      title: 'Inline style and hard-coded tokens are present',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
        writeFile(targetRepo, 'components/Card.tsx', 'export function Card() { return <div style={{ color: "#ff00aa", borderRadius: "18px" }}>Card</div>; }\n');
      },
      expectations: {
        debtIncludes: ['token drift'],
        tokenIssuesMin: 2,
      },
    },
    {
      id: 'token-clean',
      title: 'Token usage stays utility-first and shared',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
        writeFile(targetRepo, 'components/Card.tsx', 'export function Card() { return <div className="rounded-lg border bg-white px-6 py-4 text-slate-900">Card</div>; }\n');
      },
      expectations: {
        tokenIssuesMax: 0,
      },
    },
    {
      id: 'storybook-present',
      title: 'Storybook reduces preview debt',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
        updatePackageJson(targetRepo, (pkg) => {
          pkg.devDependencies = {
            ...(pkg.devDependencies || {}),
            '@storybook/react': '8.0.0',
          };
        });
        writeFile(targetRepo, '.storybook/main.ts', 'export default {};\n');
      },
      expectations: {
        debtExcludes: ['component preview'],
      },
    },
    {
      id: 'figma-linked',
      title: 'A linked Figma contract removes design-contract debt',
      setup(targetRepo) {
        addCoreNextApp(targetRepo, { withShadcn: true });
        addMilestoneContextLink(targetRepo, 'https://www.figma.com/file/demo/frontend-audit');
      },
      expectations: {
        debtExcludes: ['design contract'],
      },
    },
    {
      id: 'radix-ui-detected',
      title: 'Radix usage is recognized as a UI system signal',
      setup(targetRepo) {
        addCoreNextApp(targetRepo);
        updatePackageJson(targetRepo, (pkg) => {
          pkg.dependencies = {
            ...(pkg.dependencies || {}),
            '@radix-ui/react-dialog': '1.1.0',
          };
        });
      },
      expectations: {
        uiSystemIncludes: ['Radix'],
      },
    },
    {
      id: 'css-modules-detected',
      title: 'CSS modules show up in the styling profile',
      setup(targetRepo) {
        addCoreNextApp(targetRepo);
        writeFile(targetRepo, 'components/Hero.module.css', '.hero { color: #111827; }\n');
      },
      expectations: {
        stylingIncludes: ['CSS Modules'],
      },
    },
  ];
}

module.exports = {
  buildFrontendUiCorpus,
};
