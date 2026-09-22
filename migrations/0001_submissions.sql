CREATE TABLE IF NOT EXISTS submissions (
 id TEXT PRIMARY KEY,
 data TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
 createdAt TEXT NOT NULL,
 reviewedAt TEXT,
 note TEXT,
 fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status, createdAt);
CREATE TABLE IF NOT EXISTS submission_limits (
 key TEXT NOT NULL,
 bucket INTEGER NOT NULL,
 n INTEGER NOT NULL,
 PRIMARY KEY(key,bucket)
);
