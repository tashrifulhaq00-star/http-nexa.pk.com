'use strict';
/**
 * Nexora Digital — production entry point.
 * The app self-initializes the SQLite schema and seeds demo content on first run.
 */
const config = require('./src/config');
const app = require('./src/app');

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log('');
  console.log('  ███╗   ██╗███████╗██╗  ██╗ ██████╗ ██████╗  █████╗');
  console.log('  ████╗  ██║██╔════╝╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗');
  console.log('  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║██████╔╝███████║');
  console.log('  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██╔══██╗██╔══██║');
  console.log('  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║');
  console.log('  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝');
  console.log('');
  console.log(`  Nexora Digital · ${config.env} mode`);
  console.log(`  Listening on http://0.0.0.0:${config.port}`);
  console.log(`  Database: ${config.dbPath}`);
  console.log('');
});

const shutdown = (signal) => {
  console.log(`\n[server] ${signal} received — shutting down gracefully…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
