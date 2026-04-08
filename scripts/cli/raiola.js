#!/usr/bin/env node

const cli = require('./cwf');
const { main } = cli;

if (require.main === module) {
  main();
}

module.exports = cli;
