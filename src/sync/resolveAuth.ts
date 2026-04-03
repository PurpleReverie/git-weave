export function resolveRepoUrl(repo: string, alias?: string): string {
  if (!alias) return repo;

  const token = process.env[`${alias}_TOKEN`];
  if (!token) return repo;

  // Only inject token into HTTPS URLs — SSH URLs use the SSH agent
  const httpsMatch = repo.match(/^https:\/\/([^/]+)\/(.+)$/);
  if (!httpsMatch) return repo;

  return `https://${token}@${httpsMatch[1]}/${httpsMatch[2]}`;
}
