import { useEffect, useState } from "react";
import { api, ApiError, type Photo } from "./api";

// C-98 (V13 #5) : édition du texte alternatif et de la description IA de la
// photo sélectionnée. Sauvegarde automatique à la sortie du champ (onBlur).
// La description IA alimente les exports Markdown/JSON et les outils IA —
// elle ne remplace pas l'alt d'accessibilité et n'apparaît pas au lecteur.
export function PhotoMeta({ photo, onSaved }: { photo: Photo; onSaved: (p: Photo) => void }) {
  const [alt, setAlt] = useState(photo.alt ?? "");
  const [ai, setAi] = useState(photo.ai_description ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // re-synchronisation quand une autre photo est sélectionnée
  useEffect(() => {
    setAlt(photo.alt ?? "");
    setAi(photo.ai_description ?? "");
    setState("idle");
  }, [photo.id]);

  async function save() {
    if (alt === (photo.alt ?? "") && ai === (photo.ai_description ?? "")) return;
    setState("saving");
    try {
      const updated = await api.updatePhotoMeta(photo.id, { alt, ai_description: ai });
      onSaved(updated);
      setState("saved");
    } catch (e) {
      setState("error");
      if (!(e instanceof ApiError)) throw e;
    }
  }

  return (
    <div className="mt-1.5 grid gap-2 rounded-md border border-border bg-surface p-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="font-medium text-foreground">Photo sélectionnée</span>
        {state === "saving" && <span>Enregistrement…</span>}
        {state === "saved" && <span>✓ Enregistré</span>}
        {state === "error" && <span className="text-error">Échec d'enregistrement</span>}
      </div>
      <label className="grid gap-1">
        <span>Texte alternatif (accessibilité)</span>
        <input
          value={alt}
          onChange={(e) => { setAlt(e.target.value); setState("idle"); }}
          onBlur={() => void save()}
          maxLength={200}
          className="rounded-md border border-border bg-surface px-2 py-1 text-foreground"
        />
      </label>
      <label className="grid gap-1">
        <span>Description IA (exports Markdown/JSON, outillage IA — 1000 caractères max)</span>
        <textarea
          value={ai}
          onChange={(e) => { setAi(e.target.value); setState("idle"); }}
          onBlur={() => void save()}
          rows={2}
          maxLength={1000}
          className="rounded-md border border-border bg-surface px-2 py-1 text-foreground"
        />
      </label>
    </div>
  );
}
