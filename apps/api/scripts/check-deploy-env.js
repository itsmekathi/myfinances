// Runs before `prisma migrate deploy` in the container (see apps/api/Dockerfile).
// Catches database URL mistakes that otherwise show up as a confusing
// advisory-lock timeout (P1002) during migrations.
if (process.env.NODE_ENV !== 'production') process.exit(0);

const fail = (msg) => {
  console.error(`\n[deploy check] ${msg}\n`);
  process.exit(1);
};

const direct = process.env.DIRECT_DATABASE_URL;
if (!direct) {
  fail(
    'DIRECT_DATABASE_URL is not set. Migrations would fall back to DATABASE_URL (the pooled ' +
      'connection), which breaks the migration lock. Set it to the direct (non-pooled) ' +
      'connection string.',
  );
}

let host;
try {
  host = new URL(direct).hostname;
} catch {
  fail('DIRECT_DATABASE_URL is not a valid URL.');
}
if (host.includes('-pooler')) {
  fail(
    `DIRECT_DATABASE_URL points at a connection pooler (${host}). Use the direct connection ` +
      'string (host without "-pooler"); keep the pooled one in DATABASE_URL.',
  );
}
