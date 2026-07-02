// CLI : npm run deploy
require('dotenv').config();
const { deployCommands } = require('./lib/deployCommands');

console.log('[deploy] Demarrage...');

deployCommands((msg) => console.log('[deploy]', msg))
  .then(({ hadError }) => process.exit(hadError ? 1 : 0))
  .catch((err) => {
    console.error('[deploy] Crash :', err);
    process.exit(1);
  });
