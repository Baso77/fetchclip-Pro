const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'ADMIN_SECRET_KEY',
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error(`[ENV ERROR] Missing required environment variables:\n  ${missing.join('\n  ')}`);
    console.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  if (!process.env.FRONTEND_URL) {
    console.warn('[ENV WARNING] FRONTEND_URL not set, defaulting CORS to localhost:3000');
  }

  console.log('[ENV] All required environment variables present');
}

module.exports = { validateEnv };
