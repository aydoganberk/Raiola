const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  buildImportGraph,
  IMPORT_GRAPH_LIMITATIONS,
  IMPORT_GRAPH_METHOD,
  parseImports,
} = require('../scripts/workflow/import_graph');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-import-graph-'));
}

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('parseImports captures literal imports including commented dynamic imports', () => {
  const imports = parseImports([
    'import { Button } from "./Button";',
    'export { Card as Surface } from "./Card";',
    'await import(/* webpackChunkName: "chart" */ "./Chart");',
    'const util = require("./util");',
  ].join('\n'));

  assert.deepEqual(imports, ['./Button', './Card', './Chart', './util']);
});

test('buildImportGraph publishes explicit analysis caveats alongside edges', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, 'package.json', JSON.stringify({ name: 'graph-fixture', private: true }, null, 2));
  writeFile(targetRepo, 'src/Button.ts', 'export const Button = () => null;\n');
  writeFile(targetRepo, 'src/util.ts', 'export const util = 1;\n');
  writeFile(targetRepo, 'src/app.ts', [
    'import { Button } from "./Button";',
    'const util = require("./util");',
    'await import(/* webpackChunkName: "button" */ "./Button");',
    'await import(`./${name}`);',
  ].join('\n'));

  const graph = buildImportGraph(targetRepo, {
    refreshMode: 'full',
    writeFiles: false,
  });

  assert.equal(graph.analysis.method, IMPORT_GRAPH_METHOD);
  assert.deepEqual(graph.analysis.limitations, [...IMPORT_GRAPH_LIMITATIONS]);
  assert.ok(graph.edges.some((edge) => edge.from === 'src/app.ts' && edge.to === 'src/Button.ts'));
  assert.ok(graph.edges.some((edge) => edge.from === 'src/app.ts' && edge.to === 'src/util.ts'));
  assert.ok(!graph.entries['src/app.ts'].externalImports.some((specifier) => /\$\{name\}/.test(specifier)));
});
