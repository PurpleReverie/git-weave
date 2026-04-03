export function resolveRepoUrl(repo: string, alias?: string): string {
  if (!alias) return repo;

  const override = process.env[alias];
  if (!override) return repo;

  return override;
}
