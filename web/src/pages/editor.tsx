import StepCanvas, { TOOLS, COLORS } from "../step-canvas";
import type { Shape } from "../annotated-photo";
import { PhotoIcon, ArrowIcon, RectIcon, TextIcon, PlusIcon, PublishIcon, CollapseIcon, ExpandIcon } from "../icons";
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
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const [dragCursor, setDragCursor] = useState<{ x: number; y: number } | null>(null);
  const [canvasSelection, setCanvasSelection] = useState(0);
  const canvasDeleteRef = useRef<(() => void) | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());
  const [showMeta, setShowMeta] = useState(false);
  const [insertTool, setInsertTool] = useState<Shape["type"] | null>(null);
  const [insertColor, setInsertColor] = useState(COLORS[0]);
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [showPictos, setShowPictos] = useState(false);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<Step | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [reviewDue, setReviewDue] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [changelog, setChangelog] = useState("");
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false);
  const [confirmDeleteDoc2, setConfirmDeleteDoc2] = useState(false);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const pictosMenuRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!showPictos) return;
    const onDown = (e: PointerEvent) => {
      if (pictosMenuRef.current && !pictosMenuRef.current.contains(e.target as Node)) setShowPictos(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPictos(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showPictos]);

  const isNew = id === "new";

  useEffect(() => {
    if (isNew) return;
    api.getWorkflow(id!)
      .then((w) => {
        setWf(w); setSteps(w.steps);
        setTitle(w.title); setReference(w.reference);
        setCategory(w.category); setFamily(w.family ?? ""); setDescription(w.description);
        setReviewDue(w.review_due ?? ""); setOwnerEmail(w.owner_email ?? "");
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


  async function deleteWorkflow() {
    if (!wf) return;
    try {
      await api.deleteWorkflow(wf.id);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Suppression impossible");
      setConfirmDeleteDoc(false);
      setConfirmDeleteDoc2(false);
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
    setConfirmDeleteStep(null);
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

  async function uploadPhotos(step: Step, files: FileList) {
    for (const f of Array.from(files)) {
      if (f.type && !f.type.startsWith("image/")) continue;
      await uploadPhoto(step, f, "");
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
      await api.updateWorkflow(wf.id, { title, category, family, description, review_due: reviewDue || null, owner_email: ownerEmail });
      const { number } = await api.publishWorkflow(wf.id, changelog);
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
      <main style={{ maxWidth: "820px", width: "100%", margin: "0 auto", padding: "1rem", display: "grid", gap: "1rem", boxSizing: "border-box", minWidth: 0 }}>
        {error && <p role="alert" style={{ color: "var(--error-text)", background: "var(--error-bg)", padding: "0.5rem 0.8rem", borderRadius: "6px" }}>{error}</p>}
        {notice && <p style={{ color: "var(--ok-text)", background: "var(--ok-bg)", padding: "0.5rem 0.8rem", borderRadius: "6px" }}>{notice}</p>}

        <section style={{ position: "sticky", top: "var(--nav-h, 2.9rem)", zIndex: 30, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "0.6rem 0.8rem", boxShadow: "0 2px 6px rgba(0,0,0,0.15)", display: "grid", gap: "0.5rem", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "1rem", flex: "1 1 8rem", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {isNew ? "Nouveau mode opératoire" : (title || "Sans titre")}{" "}
              <code style={{ fontSize: "0.8em", background: "var(--surface-2)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{reference || wf?.reference}</code>
            </h1>
            {!isNew && (
              <button onClick={() => setShowMeta((v) => !v)} aria-expanded={showMeta} style={secondaryBtn}>
                {showMeta ? "Masquer les détails" : "Détails"}
              </button>
            )}
            {!isNew && steps.length > 0 && (
              <button onClick={() => setConfirmPublish(true)} style={{ ...primaryBtn, marginLeft: "auto" }} title="Publier une nouvelle version" aria-label="Publier">
                Publier
              </button>
            )}
          </div>
          {(isNew || showMeta) && (
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
            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr 1fr" }}>
              <label style={label}>À revoir le
                <input type="date" value={reviewDue} onChange={(e) => setReviewDue(e.target.value)} style={input} />
              </label>
              <label style={label}>Responsable
                <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} style={input} placeholder="resp@usine.fr" />
              </label>
            </div>
          </div>
          )}
          {isNew && (
            <button onClick={createWorkflow} disabled={!title.trim() || !reference.trim()} style={primaryBtn}>
              Créer
            </button>
          )}
          {!isNew && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexWrap: "wrap", minWidth: 0, paddingTop: "0.4rem", borderTop: "1px solid var(--border-soft)" }}>
              <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, flex: "1 1 6rem", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, color: "var(--text)" }}>
                {(() => { const st = steps.find((x) => x.id === (activeStepId ?? steps[0]?.id)); return st ? st.title : (title || "sans titre"); })()}
              </h2>
              <button
                onClick={() => {
                  if (steps.length === 0) return;
                  if (openSteps.size === steps.length) setOpenSteps(new Set());
                  else setOpenSteps(new Set(steps.map((st) => st.id)));
                }}
                style={iconBtn}
                title={openSteps.size === steps.length && steps.length > 0 ? "Tout replier" : "Tout ouvrir"}
                aria-label="Tout replier ou ouvrir"
              >{openSteps.size === steps.length && steps.length > 0 ? <CollapseIcon /> : <ExpandIcon />}</button>
              <button
                onClick={() => { setShowTools((v) => !v); const target = activeStepId ?? steps[0]?.id; if (steps.length > 0 && !openSteps.has(target)) { setOpenSteps((prev) => new Set([...prev, target])); setActiveStepId(target); } }}
                style={{ ...iconBtn, background: showTools || insertTool ? "var(--accent-bg)" : "var(--surface)", borderColor: showTools || insertTool ? "var(--accent)" : "var(--border)" }}
                aria-expanded={showTools}
                title="Insertion : photos, flèches, zones, textes, pictogrammes"
                aria-label="Insertion"
              ><PlusIcon /></button>
              {steps.length > 1 && (
                <select value="" onChange={(e) => {
                  const stepId = Number(e.target.value);
                  setOpenSteps((prev) => new Set([...prev, stepId]));
                  setActiveStepId(stepId);
                  setTimeout(() => { document.getElementById(`edit-step-${stepId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
                }} aria-label="Aller à une étape" style={{ padding: "0.2rem 0.3rem", borderRadius: "6px", border: "1px solid var(--border)", maxWidth: "100%", width: "2.6rem", minWidth: 0, fontSize: "0.8rem", background: "var(--surface)", color: "var(--text)" }}
                >
                  <option value="">…</option>
                  {steps.map((st, si) => <option key={st.id} value={st.id}>{si + 1}. {st.title}</option>)}
                </select>
              )}
              {showTools && steps.length > 0 && (
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", alignItems: "center", flexBasis: "100%", minWidth: 0, paddingTop: "0.25rem", borderTop: "1px solid var(--border-soft)" }}>
                  <button
                    onClick={() => {
                      const target = activeStepId ?? steps[0].id;
                      if (!openSteps.has(target)) { setOpenSteps((prev) => new Set([...prev, target])); setActiveStepId(target); }
                      fileRefs.current[target]?.click();
                    }}
                    style={iconBtn} title="Photos" aria-label="Photos"
                  ><PhotoIcon /></button>
                  {TOOLS.map((t) => (
                    <button
                      key={t.kind}
                      onClick={() => { setInsertTool(insertTool === t.kind ? null : t.kind); const target = activeStepId ?? steps[0].id; if (!openSteps.has(target)) { setOpenSteps((prev) => new Set([...prev, target])); setActiveStepId(target); } }}
                      style={{ ...iconBtn, background: insertTool === t.kind ? "var(--accent-bg)" : "var(--surface)", borderColor: insertTool === t.kind ? "var(--accent)" : "var(--border)" }}
                      aria-pressed={insertTool === t.kind}
                      title={t.label}
                    >{t.kind === "arrow" ? <ArrowIcon /> : t.kind === "rect" ? <RectIcon /> : <TextIcon />}</button>
                  ))}
                  {insertTool && insertTool !== "text" && COLORS.map((c) => (
                    <button key={c} onClick={() => setInsertColor(c)} aria-label={`Couleur ${c}`}
                      style={{ width: "18px", height: "18px", borderRadius: "50%", background: c, border: insertColor === c ? "2px solid var(--text)" : "1px solid var(--border)", padding: 0, cursor: "pointer", boxSizing: "border-box" }} />
                  ))}
                  <span style={{ width: "1px", height: "20px", background: "var(--border)" }} aria-hidden="true" />
                  <button onClick={addStep} style={iconBtn} title="Ajouter une étape" aria-label="Ajouter une étape"><PlusIcon /><span style={{ fontSize: "0.75rem" }}>étape</span></button>
                  <span style={{ width: "1px", height: "20px", background: "var(--border)" }} aria-hidden="true" />
                  <span ref={pictosMenuRef} style={{ position: "relative" }}>
                    {(() => {
                      const st = steps.find((x) => x.id === (activeStepId ?? steps[0].id));
                      const activeCount = st ? st.pictos.length : 0;
                      return (
                        <>
                          <button
                            onClick={() => setShowPictos((v) => !v)}
                            aria-expanded={showPictos}
                            aria-haspopup="menu"
                            title="Indications de l'étape (attention, danger, EPI…)"
                            style={{ ...iconBtn, background: showPictos || activeCount > 0 ? "var(--accent-bg)" : "var(--surface)", borderColor: showPictos || activeCount > 0 ? "var(--accent)" : "var(--border)" }}
                          >⚠{activeCount > 0 ? ` (${activeCount})` : ""}</button>
                          {showPictos && (
                            <div role="menu" aria-label="Indications" style={{ position: "absolute", left: 0, top: "calc(100% + 0.35rem)", zIndex: 120, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 6px 24px rgba(0,0,0,0.2)", padding: "0.3rem", display: "grid", gap: "0.15rem", minWidth: "10rem" }}>
                              {PICTO_PRESETS.map((preset) => {
                                const on = st ? st.pictos.some((x) => x.kind === preset.kind) : false;
                                return (
                                  <button
                                    key={preset.kind}
                                    role="menuitemcheckbox"
                                    aria-checked={on}
                                    onClick={() => {
                                      const target = activeStepId ?? steps[0].id;
                                      const stp = steps.find((x) => x.id === target);
                                      if (!stp) return;
                                      if (!openSteps.has(target)) { setOpenSteps((prev) => new Set([...prev, target])); setActiveStepId(target); }
                                      const idx = stp.pictos.findIndex((x) => x.kind === preset.kind);
                                      void patchStep(stp, { pictos: idx >= 0 ? stp.pictos.filter((_, k) => k !== idx) : [...stp.pictos, { kind: preset.kind, label: preset.label, color: preset.color }] });
                                    }}
                                    style={{ display: "flex", alignItems: "center", gap: "0.45rem", width: "100%", padding: "0.35rem 0.55rem", borderRadius: "6px", border: "1px solid transparent", background: on ? `${preset.color}22` : "transparent", color: "var(--text)", fontSize: "0.8rem", textAlign: "left", cursor: "pointer" }}
                                  >
                                    <span aria-hidden="true" style={{ width: "0.7rem", height: "0.7rem", borderRadius: "50%", background: preset.color, flexShrink: 0 }} />
                                    {preset.label}
                                    {on && <span aria-hidden="true" style={{ marginLeft: "auto", color: "var(--ok-text)" }}>✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </span>
                  <span style={{ width: "1px", height: "20px", background: "var(--border)" }} aria-hidden="true" />
                  <button
                    onClick={() => {
                      const target = activeStepId ?? steps[0].id;
                      const stp = steps.find((x) => x.id === target);
                      if (stp) setConfirmDeleteStep(stp);
                    }}
                    style={{ ...iconBtn, borderColor: "var(--danger-border)", background: "var(--danger-bg)", color: "var(--error-text)" }}
                    title="Supprimer l'étape affichée (confirmation demandée)"
                    aria-label="Supprimer l'étape affichée"
                  >Supprimer l'étape</button>
                  {canvasSelection > 0 && (
                    <button
                      onClick={() => canvasDeleteRef.current?.()}
                      style={{ ...iconBtn, borderColor: "var(--danger-border)", background: "var(--danger-bg)", color: "var(--error-text)" }}
                      title="Supprimer les objets sélectionnés du canevas de l'étape affichée"
                      aria-label="Supprimer les objets sélectionnés"
                    >🗑 Objets ({canvasSelection})</button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
        {!isNew && (
        <>
          {steps.length === 0 && <p style={{ color: "var(--text-muted)" }}>Aucune étape. Ajoutez la première.</p>}
            <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.6rem" }}>
              {steps.map((step, i) => (
                <li
                  key={step.id}
                  id={`edit-step-${step.id}`}
                  style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "grid", gap: "0.5rem", outline: dragIndex === i ? "2px dashed var(--accent)" : "none", scrollMarginTop: "8rem" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span
                      onPointerDown={(e) => {
                        if (e.button !== 0 && e.pointerType === "mouse") return;
                        e.preventDefault();
                        const from = i;
                        dragFromRef.current = from;
                        setDragIndex(from);
                        setDragCursor({ x: e.clientX, y: e.clientY });
                        const onMove = (ev: PointerEvent) => { setDragCursor({ x: ev.clientX, y: ev.clientY }); };
                        const finish = (ev: PointerEvent) => {
                          window.removeEventListener("pointermove", onMove);
                          window.removeEventListener("pointerup", onUp);
                          window.removeEventListener("pointercancel", onCancel);
                          const el = document.elementFromPoint(ev.clientX, ev.clientY);
                          const li = el?.closest?.("li");
                          let to: number | null = null;
                          if (li) {
                            const stepId = Number(String(li.id).replace("edit-step-", ""));
                            const idx = steps.findIndex((st) => st.id === stepId);
                            if (idx >= 0) to = idx;
                          }
                          dragFromRef.current = null;
                          setDragIndex(null);
                          setDragCursor(null);
                          if (to !== null && to !== from) void moveStep(from, to);
                        };
                        const onUp = (ev: PointerEvent) => finish(ev);
                        const onCancel = () => {
                          window.removeEventListener("pointermove", onMove);
                          window.removeEventListener("pointerup", onUp);
                          window.removeEventListener("pointercancel", onCancel);
                          dragFromRef.current = null;
                          setDragIndex(null);
                          setDragCursor(null);
                        };
                        window.addEventListener("pointermove", onMove, { passive: true });
                        window.addEventListener("pointerup", onUp);
                        window.addEventListener("pointercancel", onCancel);
                      }}
                      title="Glisser pour réordonner"
                      role="button"
                      aria-label={`Réordonner l'étape ${i + 1} (glisser)`}
                      style={{ cursor: "grab", color: "var(--text-muted)", padding: "0.3rem 0.4rem", touchAction: "none", userSelect: "none" }}
                    >
                      ⠿
                    </span>
                    
                    <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "1.5rem", height: "1.5rem", borderRadius: "50%", background: "var(--accent-bg)", color: "var(--accent)", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <input
                      value={step.title}
                      onChange={(e) => setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, title: e.target.value } : s)))}
                      onBlur={() => patchStep(step, { title: step.title })}
                      style={{ ...input, fontWeight: 600, flex: "1 1 8rem" }}
                      aria-label={`Titre étape ${i + 1}`}
                      onClick={() => { if (!openSteps.has(step.id)) setOpenSteps((prev) => new Set([...prev, step.id])); setActiveStepId(step.id); }}
                    />
                    <button
                      onClick={() => setOpenSteps((prev) => { const n = new Set(prev); if (n.has(step.id)) n.delete(step.id); else { n.add(step.id); setActiveStepId(step.id); } return n; })}
                      aria-expanded={openSteps.has(step.id)}
                      aria-label={openSteps.has(step.id) ? `Replier l'étape ${i + 1}` : `Ouvrir l'étape ${i + 1}`}
                      style={{ border: "1px solid var(--border)", background: openSteps.has(step.id) ? "var(--accent-bg)" : "var(--surface-2)", color: "var(--text)", borderRadius: "6px", padding: "0.35rem 0.8rem", fontSize: "0.95rem", minWidth: "2.2rem" }}
                    >
                      {openSteps.has(step.id) ? "▾" : "▸"}
                    </button>
                    
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
                  {(step.photos ?? []).length === 0 && (
                      <p role="note" style={{ margin: 0, fontSize: "0.75rem", color: "var(--warn-text)", background: "var(--warn-bg)", padding: "0.15rem 0.45rem", borderRadius: "4px" }}>
                        Cette étape n'a pas de photo — une photo bien cadrée remplace un paragraphe de texte.
                      </p>
                    )}
           <div style={{ display: "grid", gap: "0.4rem" }}>
                    <StepCanvas
                      stepId={step.id}
                      tool={activeStepId === step.id ? insertTool : null}
                      color={insertColor}
                      onToolDone={() => setInsertTool(null)}
                      onSelectionChange={activeStepId === step.id ? (n) => setCanvasSelection(n) : undefined}
                      deleteActionRef={activeStepId === step.id ? (fn) => { canvasDeleteRef.current = fn; } : undefined}
                      photos={(step.photos ?? []).map((ph) => {
                        const w = typeof ph.display_w === "number" ? ph.display_w : ph.display_size === "full" ? 1 : ph.display_size === "large" ? 0.85 : ph.display_size === "small" ? 0.35 : 0.6;
                        return {
                          photo: ph,
                          x: typeof ph.display_x === "number" ? ph.display_x : 0,
                          y: typeof ph.display_y === "number" ? ph.display_y : 0.05,
                          w,
                        };
                      })}
                      canvasShapes={step.canvas ?? []}
                      onPhotosChanged={async () => { const w = await api.getWorkflow(id!); setSteps(w.steps); }}
                    />
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        ref={(el) => { fileRefs.current[step.id] = el; }}
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) await uploadPhotos(step, files);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                  </>
                  )}
                </li>
              ))}
            </ol>
          {!isNew && (
            <section style={{ marginTop: "1.2rem", padding: "0.9rem 1rem", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: "10px", display: "grid", gap: "0.5rem" }} aria-label="Suppression du mode opératoire">
              {!confirmDeleteDoc ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", flex: 1, minWidth: "10rem" }}>Supprimer ce mode opératoire (étapes, photos, versions)</span>
                  <button onClick={() => { setConfirmDeleteDoc(true); setConfirmDeleteDoc2(false); }} style={{ fontSize: "0.85rem", padding: "0.35rem 0.8rem", borderRadius: "6px", border: "1px solid var(--danger-border)", background: "var(--surface)", color: "var(--error-text)", cursor: "pointer" }}>Supprimer le mode opératoire…</button>
                </div>
              ) : !confirmDeleteDoc2 ? (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
                    ⚠ Supprimer « {title || wf?.title} » ({reference || wf?.reference}) ?
                  </p>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Toutes les étapes, photos, versions et exports seront définitivement supprimés. Cette action est irréversible.
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "end" }}>
                    <button onClick={() => setConfirmDeleteDoc(false)} style={{ padding: "0.35rem 0.8rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.85rem" }}>Annuler</button>
                    <button onClick={() => setConfirmDeleteDoc2(true)} style={{ padding: "0.35rem 0.8rem", borderRadius: "6px", border: "1px solid var(--danger-border)", background: "var(--surface)", color: "var(--error-text)", fontSize: "0.85rem", fontWeight: 600 }}>Continuer…</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--error-text)" }}>
                    Dernière confirmation — cochez pour valider la suppression définitive :
                  </p>
                  <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={confirmDeleteDoc2} onChange={(e) => setConfirmDeleteDoc2(e.target.checked)} />
                    Je comprends que « {title || wf?.title} » et tout son historique seront supprimés sans possibilité de retour
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "end" }}>
                    <button onClick={() => { setConfirmDeleteDoc(false); setConfirmDeleteDoc2(false); }} style={{ padding: "0.35rem 0.8rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.85rem" }}>Annuler</button>
                    <button onClick={() => void deleteWorkflow()} disabled={!confirmDeleteDoc2} style={{ padding: "0.35rem 0.8rem", borderRadius: "6px", border: "none", background: "var(--error-text)", color: "white", fontSize: "0.85rem", fontWeight: 600 }}>Supprimer définitivement</button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
        )}
      </main>
      {dragIndex !== null && dragCursor && (
        <div ref={dragGhostRef} aria-hidden="true" style={{ position: "fixed", left: dragCursor.x, top: dragCursor.y, transform: "translate(-50%, -120%)", pointerEvents: "none", zIndex: 200, background: "var(--accent)", color: "white", padding: "0.25rem 0.6rem", borderRadius: "6px", fontSize: "0.85rem", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          Déplacer « {steps[dragIndex]?.title ?? ""} »
        </div>
      )}
      {confirmDeleteStep && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 100 }} role="dialog" aria-modal="true" aria-label="Confirmer la suppression de l'étape">
          <div style={{ background: "var(--surface)", color: "var(--text)", borderRadius: "10px", padding: "1.2rem", maxWidth: "400px", display: "grid", gap: "0.8rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Supprimer l'étape « {confirmDeleteStep.title} » ?</h2>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Ses photos et annotations seront supprimées. Cette action est irréversible sans version publiée.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "end" }}>
              <button onClick={() => setConfirmDeleteStep(null)} style={secondaryBtn}>Annuler</button>
              <button onClick={() => void removeStep(confirmDeleteStep)} style={{ ...primaryBtn, background: "var(--error-text)" }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
      {confirmPublish && wf && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 100 }} role="dialog" aria-modal="true" aria-label="Confirmer la publication">
          <div style={{ background: "var(--surface)", color: "var(--text)", borderRadius: "10px", padding: "1.2rem", maxWidth: "400px", display: "grid", gap: "0.8rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
              {wf.state === "published" ? `Publier V${(wf.current_version ?? 0) + 1} ?` : "Publier en V1 ?"}
            </h2>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Un snapshot immuable de cette version sera créé ({steps.length} étape{steps.length > 1 ? "s" : ""}). La version restera consultable et exportable même après vos modifications suivantes.
            </p>
            <label style={label}>
              Modifications apportées (visible dans l'historique)
              <textarea value={changelog} onChange={(e) => setChangelog(e.target.value)} rows={2} style={input} placeholder="Ex. : ajout de l'étape de contrôle final, photo arrière remplacée" />
            </label>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "end" }}>
              <button onClick={() => setConfirmPublish(false)} style={secondaryBtn}>Annuler</button>
              <button onClick={() => { setConfirmPublish(false); void publish(); }} style={primaryBtn}>Confirmer la publication</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Base mobile-first : tout champ occupe 100% de la largeur disponible et
// ne peut jamais élargir son conteneur (min-width: 0 est la clé anti-
// débordement des flex/grid).
const label: React.CSSProperties = { display: "grid", gap: "0.25rem", fontSize: "0.9rem", color: "var(--text-muted)", minWidth: 0 };
const input: React.CSSProperties = { padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "1rem", fontFamily: "inherit", width: "100%", minWidth: 0, boxSizing: "border-box", maxWidth: "100%" };
const primaryBtn: React.CSSProperties = { padding: "0.35rem 0.7rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white", fontSize: "0.85rem" };
const secondaryBtn: React.CSSProperties = { padding: "0.35rem 0.7rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.85rem" };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.8rem", lineHeight: 1.2, minWidth: 0, cursor: "pointer" };
const toolBtn: React.CSSProperties = { padding: "0.25rem 0.55rem", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.85rem", lineHeight: 1.2, minWidth: 0 };
const dangerBtn: React.CSSProperties = { padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--text)", fontSize: "0.9rem" };
