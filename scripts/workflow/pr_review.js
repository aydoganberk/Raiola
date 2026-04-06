const { main } = require('./review');

main(['--mode', 'pr-review', ...process.argv.slice(2)]).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
