// V16 (V7 #4) : pré-cache complet des MO publiés pour la lecture hors ligne.
import { precacheUrls, precacheReport } from "./offline";
import { api, type Workflow } from "../api";

export async function precacheAll(): Promise<{ ok: boolean; done: number; failed: number; message: string }> {
  const workflows: Workflow[] = await api.listWorkflows();
  const lastVersions: Record<number, number | undefined> = {};
  await Promise.all(
    workflows
      .filter((w: Workflow) => w.state === "published")
      .map(async (w: Workflow) => {
        const versionsList = await api.versions(w.id);
        // liste triée : la dernière entrée = version publiée la plus récente.
        if (versionsList.length > 0) {
          lastVersions[w.id] = versionsList[versionsList.length - 1].number;
        }
      })
  );
  const urls = precacheUrls(workflows, lastVersions);
  const failures: string[] = [];
  await Promise.all(
    urls.map(async (url: string) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) failures.push(url);
      } catch {
        failures.push(url);
      }
    })
  );
  return precacheReport(urls, failures);
}
