export function precacheUrls(workflows: { id: number; state: string }[], lastVersions: Record<number, number | undefined> = {}, limit = 200): string[] {
  const urls: string[] = [];
  workflows.filter(w => w.state === "published").slice(0, limit).forEach(w => {
    urls.push(`/api/workflows/${w.id}/versions`);
    if (lastVersions[w.id] !== undefined) {
      urls.push(`/api/workflows/${w.id}/versions/${lastVersions[w.id]}`);
    }
  });
  return urls;
}

export function precacheReport(urls: string[], failures: string[]): { ok: boolean; done: number; failed: number; message: string } {
  const done = urls.length - failures.length;
  const failed = failures.length;
  const ok = failed === 0;
  let message = `Pré-cache terminé : ${done} URLs mises en cache`;
  if (failed > 0) {
    message += `, ${failed} échecs`;
  }
  return { ok, done, failed, message };
}