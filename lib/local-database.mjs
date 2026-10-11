/**
 * A local test URL must describe the actual connection target. node-postgres
 * accepts query parameters such as ?host= that override the visible hostname;
 * test connections deliberately do not accept any query parameters.
 * @param {string | undefined} value
 */
export function isLocalDatabaseUrl(value) {
  try {
    const url = new URL(value ?? "");
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname.length > 1 &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/**
 * Check before opening any connection or running a destructive test.
 * @param {string | undefined} value
 * @param {"browser" | "migration"} suite
 */
export function assertTestDatabaseUrl(value, suite) {
  const pattern =
    suite === "migration"
      ? /^\/budget_migration_test(?:_[a-z0-9_]+)?$/
      : /^\/budget_(?:e2e|ledger)_test(?:_[a-z0-9_]+)?$/;
  if (
    typeof value !== "string" ||
    !isLocalDatabaseUrl(value) ||
    !pattern.test(new URL(value).pathname)
  )
    throw new Error(
      `${suite} tests require a disposable local budget_${suite === "migration" ? "migration" : "e2e"}_test database URL without query parameters.`,
    );
  return value;
}
