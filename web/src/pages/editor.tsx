import PhotoAnnotator from "../photo-annotator";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Step, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

import type { Picto } from "../api";

const PICTO_PRESETS: { kind: string; label: string; color: string }[] = [
  { kind: "attention", label: "Attention", color: "#f5a623" },
  { kind: "danger", label: "Danger", color: "#d0021b" },
  { kind: "epi", label: "EPI obligatoire", color: "#1f4e9c" },
  { kind: "electrique", label: "Risque électrique", color: "#7b16c9" },
  { kind: "point-chaud", label: "Point chaud", color: "#d0021b" },
  { kind: "outil", label: "Outillage spécifique", color: "#108c5e" },
  { kind: "info", label: "Information", color: "#5b7285" },
];

export async function compressImage(file: File, maxSize = 1280, quality = 0.82): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [category, setCategory] = useState("");
  const [family, setFamily] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const isNew = id === "new";

  useEffect(() => {
    if (isNew) return;
    api.getWorkflow(id!)
      .then((w) => {
        setWf(w); setSteps(w.steps);
        setTitle(w.title); setReference(w.reference);
        setCategory(w.category); setFamily(w.family ?? ""); setDescription(w.description);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id, isNew]);

  useEffect(() => {
    if (user?.role === "reader") navigate("/", { replace: true });
  }, [user, navigate]);

  async function createWorkflow() {
    setError(null);
    try {
      const created = await api.createWorkflow({ title: title.trim(), reference: reference.trim(), category, family, description });
      navigate(`/workflow/${created.id}/edit`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Création impossible");
    }
  }

  async function saveMeta() {
    if (!wf) return;
    setError(null);
    try {
      await api.updateWorkflow(wf.id, { title, category, family, description });
      setNotice("Enregistré");
      setTimeout(() => setNotice(null), 1500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible");
    }
  }

  async function addStep() {
    if (!wf) return;
    const s = await api.addStep(wf.id, { title: "Nouvelle étape" });
    setSteps((arr) => [...arr, { ...s, photos: [], pictos: [] as Picto[] }]);
  }

  async function patchStep(step: Step, data: Partial<Step>) {
    setError(null);
    try {
      const updated = await api.updateStep(step.id, data as object);
      // L’API renvoie pictos en tableau ; code défensif au cas où une
      // réponse au format brut (chaîne JSON) arriverait malgré tout.
      const rawPictos = Array.isArray(updated.pictos) ? updated.pictos : JSON.parse(String(updated.pictos));
      const pictos: Picto[] = rawPictos.map((x: Picto | string) =>
        typeof x === "string" ? { kind: x, label: x, color: "#f5a623" } : x
      );
      setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...updated, pictos, photos: s.photos } : s)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible");
    }
  }

  async function removeStep(step: Step) {
    await api.deleteStep(step.id);
    setSteps((arr) => arr.filter((s) => s.id !== step.id));
  }

  async function moveStep(from: number, to: number) {
    const ids = steps.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setSteps((arr) => {
      const copy = [...arr];
      const [m] = copy.splice(from, 1);
      copy.splice(to, 0, m);
      return copy.map((s, i) => ({ ...s, position: i }));
    });
    try {
      await api.reorderSteps(wf!.id, ids);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Réordonnancement impossible");
      const w = await api.getWorkflow(wf!.id);
      setSteps(w.steps);
    }
  }

  async function uploadPhoto(step: Step, file: File, alt: string) {
    setError(null);
    try {
      const compressed = file.size > 200 * 1024 ? await compressImage(file) : file;
      const photo = await api.uploadPhoto(step.id, compressed, alt);
      setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, photos: [...s.photos, photo] } : s)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Envoi impossible");
    }
  }

  async function removePhoto(step: Step, photoId: number) {
    await api.deletePhoto(photoId);
    setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, photos: s.photos.filter((p) => p.id !== photoId) } : s)));
  }

  async function publish() {
    if (!wf) return;
    setError(null);
    try {
      const { number } = await api.publishWorkflow(wf.id);
      setNotice(`Publié en V${number}`);
      setTimeout(() => setNotice(null), 2500);
      navigate(`/workflow/${wf.id}/read`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Publication impossible");
    }
  }

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "820px", margin: "0 auto", padding: "1rem", display: "grid", gap: "1rem" }}>
        {error && <p role="alert" style={{ color: "var(--error-text)", background: "var(--error-bg)", padding: "0.5rem 0.8rem", borderRadius: "6px" }}>{error}</p>}
        {notice && <p style={{ color: "var(--ok-text)", background: "var(--ok-bg)", padding: "0.5rem 0.8rem", borderRadius: "6px" }}>{notice}</p>}

        <section style={{ background: "var(--surface)", borderRadius: "10px", padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "grid", gap: "0.6rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.2rem" }}>{isNew ? "Nouveau mode opératoire" : "Modifier"}</h1>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label style={label}>Titre
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="Remplacement courroie" />
            </label>
            {isNew ? (
              <label style={label}>Référence
                <input value={reference} onChange={(e) => setReference(e.target.value)} style={input} placeholder="MO-001" />
              </label>
            ) : (
              <p style={{ margin: 0, color: "var(--text-muted)" }}><code>{wf?.reference}</code> — {wf?.state === "published" ? `publié (V${wf.current_version})` : "brouillon"}</p>
            )}
            <label style={label}>Famille
              <input value={family} onChange={(e) => setFamily(e.target.value)} style={input} placeholder="Mécanique / Électrique / Qualité…" />
            </label>
            <label style={label}>Type
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={input} placeholder="Maintenance, Contrôle…" />
            </label>
            <label style={label}>Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={input} />
            </label>
          </div>
          {isNew ? (
            <button onClick={createWorkflow} disabled={!title.trim() || !reference.trim()} style={primaryBtn}>Créer</button>
          ) : (
            <button onClick={saveMeta} style={primaryBtn}>Enregistrer</button>
          )}
        </section>

        {!isNew && (
          <section style={{ display: "grid", gap: "0.6rem" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.5rem 0.8rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
              <h2 style={{ margin: 0, fontSize: "1rem", marginRight: "auto", minWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "30%" }}>Étapes — {title || "sans titre"}</h2>
              {steps.length > 1 && (
                <>
                  <button onClick={() => setOpenSteps(new Set(steps.map((st) => st.id)))} style={secondaryBtn}>Tout ouvrir</button>
                  <button onClick={() => setOpenSteps(new Set())} style={secondaryBtn}>Tout replier</button>
                  <select
                    value=""
                    onChange={(e) => {
                      const stepId = Number(e.target.value);
                      // On ouvre d'abord l'étape (son contenu change la hauteur
                      // de page), puis on ne déclenche le défilement qu'une fois
                      // la mise en page stabilisée : sinon la cible glisse sous
                      // le pli pendant le scroll et apparaît en bas (issue #3).
                      setOpenSteps((prev) => new Set([...prev, stepId]));
                      setTimeout(() => {
                        document.getElementById(`edit-step-${stepId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 80);
                    }}
                    aria-label="Aller à une étape"
                    style={{ padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--border)" }}
                  >
                    <option value="">Aller à…</option>
                    {steps.map((st, si) => <option key={st.id} value={st.id}>{si + 1}. {st.title}</option>)}
                  </select>
                </>
              )}
            </div>
            {steps.length === 0 && <p style={{ color: "var(--text-muted)" }}>Aucune étape. Ajoutez la première.</p>}
            <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.6rem" }}>
              {steps.map((step, i) => (
                <li
                  key={step.id}
                  id={`edit-step-${step.id}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndex !== null && dragIndex !== i) void moveStep(dragIndex, i); setDragIndex(null); }}
                  style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "grid", gap: "0.5rem", outline: dragIndex === i ? "2px dashed var(--accent)" : "none", scrollMarginTop: "4rem" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragEnd={() => setDragIndex(null)}
                      title="Glisser pour réordonner"
                      role="button"
                      aria-label={`Réordonner l'étape ${i + 1} (glisser)`}
                      style={{ cursor: "grab", color: "var(--text-muted)", padding: "0.2rem 0.3rem", touchAction: "none" }}
                    >
                      ⠿
                    </span>
                    <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
                      <button
                        onClick={() => { if (i > 0) void moveStep(i, i - 1); }}
                        disabled={i === 0}
                        aria-label={`Monter l'étape ${i + 1}`}
                        style={{ border: "none", background: "none", fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.05rem 0.2rem", cursor: i === 0 ? "default" : "pointer" }}
                      >▲</button>
                      <button
                        onClick={() => { if (i < steps.length - 1) void moveStep(i, i + 1); }}
                        disabled={i === steps.length - 1}
                        aria-label={`Descendre l'étape ${i + 1}`}
                        style={{ border: "none", background: "none", fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.05rem 0.2rem", cursor: i === steps.length - 1 ? "default" : "pointer" }}
                      >▼</button>
                    </span>
                    <input
                      value={step.title}
                      onChange={(e) => setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, title: e.target.value } : s)))}
                      onBlur={() => patchStep(step, { title: step.title })}
                      style={{ ...input, fontWeight: 600, flex: 1 }}
                      aria-label={`Titre étape ${i + 1}`}
                      onFocus={() => setOpenSteps((prev) => new Set([...prev, step.id]))}
                    />
                    <button
                      onClick={() => setOpenSteps((prev) => { const n = new Set(prev); if (n.has(step.id)) n.delete(step.id); else n.add(step.id); return n; })}
                      aria-expanded={openSteps.has(step.id)}
                      aria-label={openSteps.has(step.id) ? `Replier l'étape ${i + 1}` : `Ouvrir l'étape ${i + 1}`}
                      style={{ border: "none", background: "var(--surface-2)", color: "var(--text)", borderRadius: "6px", padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}
                    >
                      {openSteps.has(step.id) ? "▾" : "▸"}
                    </button>
                    <button onClick={() => removeStep(step)} style={dangerBtn} aria-label={`Supprimer étape ${i + 1}`}>🗑</button>
                  </div>
                  {openSteps.has(step.id) && (
                  <>
                  <textarea
                    value={step.body}
                    rows={2}
                    placeholder="Description de l'opération…"
                    onChange={(e) => setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, body: e.target.value } : s)))}
                    onBlur={() => patchStep(step, { body: step.body })}
                    style={input}
                    aria-label={`Description étape ${i + 1}`}
                  />
                  <div style={{ display: "grid", gap: "0.4rem" }}>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {PICTO_PRESETS.map((preset) => {
                        const idx = step.pictos.findIndex((x) => x.kind === preset.kind);
                        const on = idx >= 0;
                        return (
                          <button
                            key={preset.kind}
                            onClick={() =>
                              patchStep(step, {
                                pictos: on
                                  ? step.pictos.filter((_, i) => i !== idx)
                                  : [...step.pictos, { kind: preset.kind, label: preset.label, color: preset.color }],
                              })
                            }
                            style={{
                              padding: "0.2rem 0.55rem", borderRadius: "4px", fontSize: "0.8rem",
                              border: on ? `2px solid ${preset.color}` : "1px solid var(--border)",
                              background: on ? `${preset.color}22` : "var(--surface)",
                              color: "var(--text)",
                            }}
                            aria-pressed={on}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    {step.pictos.map((ph, pi) => (
                      <div key={pi} style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          type="color"
                          value={ph.color}
                          onChange={(e) => {
                            const next = step.pictos.map((x, i) => (i === pi ? { ...x, color: e.target.value } : x));
                            setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, pictos: next } : s)));
                          }}
                          onBlur={() => patchStep(step, { pictos: step.pictos })}
                          aria-label={`Couleur du pictogramme ${pi + 1}`}
                        />
                        <input
                          value={ph.label}
                          onChange={(e) => {
                            const next = step.pictos.map((x, i) => (i === pi ? { ...x, label: e.target.value } : x));
                            setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, pictos: next } : s)));
                          }}
                          onBlur={() => patchStep(step, { pictos: step.pictos })}
                          placeholder="Texte de l'avertissement"
                          style={{ flex: 1, minWidth: "160px", padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)" }}
                          aria-label={`Texte du pictogramme ${pi + 1}`}
                        />
                        <button
                          onClick={() => patchStep(step, { pictos: step.pictos.filter((_, i) => i !== pi) })}
                          style={dangerBtn}
                          aria-label="Retirer ce pictogramme"
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: "0.4rem" }}>
                    {step.photos.map((ph) => (
                      <div key={ph.id} style={{ display: "grid", gap: "0.4rem", border: "1px solid var(--border-soft)", borderRadius: "8px", padding: "0.6rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--text-muted)" }}>{ph.alt}</span>
                          <button onClick={() => removePhoto(step, ph.id)} style={dangerBtn} aria-label="Supprimer la photo">🗑</button>
                        </div>
                        <div
                          onDragStart={(e) => e.preventDefault()}
                          onDragEnter={(e) => e.stopPropagation()}
                        >
                          <PhotoAnnotator photoId={ph.id} filename={ph.filename} alt={ph.alt} initialAnnotations={ph.annotations} initialSize={ph.display_size} initialAlign={ph.display_align} />
                        </div>
                      </div>
                    ))}
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        ref={(el) => { fileRefs.current[step.id] = el; }}
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) await uploadPhoto(step, f, "");
                          e.target.value = "";
                        }}
                      />
                      <button onClick={() => fileRefs.current[step.id]?.click()} style={secondaryBtn}>📷 Photo…</button>
                    </div>
                  </div>
                  </>
                  )}
                </li>
              ))}
            </ol>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button onClick={addStep} style={secondaryBtn}>+ Ajouter une étape</button>
              {steps.length > 0 && (
                <button onClick={publish} style={primaryBtn} title="Publie une nouvelle version">
                  {wf?.state === "published" ? `Publier V${(wf.current_version ?? 0) + 1}` : "Publier V1"}
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

const label: React.CSSProperties = { display: "grid", gap: "0.25rem", fontSize: "0.9rem", color: "var(--text-muted)" };
const input: React.CSSProperties = { padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "1rem", fontFamily: "inherit" };
const primaryBtn: React.CSSProperties = { padding: "0.6rem 1rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white", fontSize: "1rem" };
const secondaryBtn: React.CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem" };
const dangerBtn: React.CSSProperties = { padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--text)", fontSize: "0.9rem" };
