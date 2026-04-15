#!/usr/bin/env node
const { main } = require('../scripts/workflow/mcp_server');
Promise.resolve(main()).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
