#!/usr/bin/env node
const { runAdapterHookFromProcess } = require('../../scripts/workflow/adapter_hooks_bridge');
const result = runAdapterHookFromProcess({
  adapter: 'claude',
  hook: 'SessionStart',
});
if (!result.ok) {
  process.exitCode = 1;
}
