module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Every suite boots its own in-memory MongoDB. Running suites in parallel makes
  // several mongod instances start at once, which regularly blows past the default
  // 5s hook timeout on CI and produces flaky failures (and knock-on E11000 errors
  // when a seeding hook dies half way). One worker plus a generous timeout keeps
  // the pre-deploy validation job deterministic.
  maxWorkers: 1,
  testTimeout: 30000
};
