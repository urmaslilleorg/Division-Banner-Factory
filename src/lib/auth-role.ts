// Auth is temporarily disabled — all users are treated as division_admin
// Clerk will be re-enabled once the rate limit clears and auth is restored

export async function getUserRole(): Promise<string> {
  return "division_admin";
}

export async function getUserId(): Promise<string | null> {
  return "mock-user-id";
}
