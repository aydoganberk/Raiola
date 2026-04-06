const { main } = require('./review');

main(['--mode', 'review-mode', ...process.argv.slice(2)]).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
