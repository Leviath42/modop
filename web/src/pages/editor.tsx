import StepCanvas, { COLORS } from "../step-canvas";
import type { Shape } from "../annotated-photo";
import { Camera, ChevronDown, ChevronRight, FoldVertical, GripVertical, Image as ImageIcon, Trash2, TriangleAlert, UnfoldVertical } from "lucide-react";
import { EditorBottomBar } from "../editor/bottom-bar";
import type { PictoPreset, ToolContext } from "../editor/tools/registry";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Step, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Alert, Modal } from "../components/ui/dialog";
import { Input, Label, Select, Textarea } from "../components/ui/input";
import { cn } from "../lib/utils";

import type { Picto } from "../api";

export async function compressImage(file: File, maxSize = 1280, quality = 0.82): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // B-A5 : fichier non parsable côté client — envoi du brut (le serveur valide le contenu réel)
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

// Boutons de la palette : classe et habillage portés par la barre basse
// (web/src/editor/bottom-bar.tsx) depuis la refonte palette d'outils.

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
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<Step | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [reviewDue, setReviewDue] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  // #5 : suggestions de responsable — recherche par nom ET email (les
  // datalists natifs ne montraient pas les Prénom/Nom de façon fiable).
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [changelog, setChangelog] = useState("");
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false);
  const [confirmDeleteDoc2, setConfirmDeleteDoc2] = useState(false);
  const [deleteAck, setDeleteAck] = useState(false); // C-46 : case décochée par défaut
  const [metaSaved, setMetaSaved] = useState(true);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // C-42 : input dédié appareil photo (capture natif du navigateur, sans
  // couche supplémentaire) à côté de l'input galerie
  const cameraRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const isNew = id === "new";
  // C-45 : liste des comptes actifs pour le sélecteur de responsable
  const [accounts, setAccounts] = useState<{ id: number; email: string; first_name?: string; last_name?: string; role: string }[]>([]);
  useEffect(() => {
    if (isNew) return;
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: number; email: string; first_name: string; last_name: string; role: string; active: number }[]) =>
        setAccounts(list.filter((u) => u.active === 1)))
      .catch(() => setAccounts([]));
  }, [isNew]);

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
  // B-A2 : autosave des métadonnées (RF-16) — 800 ms après la dernière
  // frappe ; bandeau "Enregistrement…" pendant la requête, restauration de
  // l'indicateur si elle échoue.
  const wfId = wf?.id;
  useEffect(() => {
    if (isNew || !wfId || metaSaved) return;
    const t = setTimeout(async () => {
      try {
        await api.updateWorkflow(wfId, { title, category, family, description, review_due: reviewDue || null, owner_email: ownerEmail });
        setMetaSaved(true);
      } catch {
        /* l'indicateur reste "à enregistrer" ; la publication retentera */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [wfId, isNew, metaSaved, title, category, family, description, reviewDue, ownerEmail]);

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
      // L’API renvoie pictos en tableau ; code défensif au cas où une
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

  const [uploadProgress, setUploadProgress] = useState<{ stepId: number; done: number; total: number } | null>(null);
  async function uploadPhotos(step: Step, files: FileList) {
    const list = Array.from(files).filter((f) => !f.type || f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploadProgress({ stepId: step.id, done: 0, total: list.length });
    // B-A3 : uploads parallèles (tous d'un coup — le serveur tient n connexions),
    // chaque fichier est indépendant : un échec n'interrompt pas les autres.
    let done = 0;
    let firstError: string | null = null;
    await Promise.all(list.map(async (f) => {
      try {
        await uploadPhoto(step, f, "");
      } catch {
        if (!firstError) firstError = f.name;
      } finally {
        done++;
        setUploadProgress({ stepId: step.id, done, total: list.length });
      }
    }));
    setUploadProgress(null);
    if (firstError) setError(`Photo(s) non envoyée(s) : ${firstError}${list.length > 1 ? " (les autres ont été envoyées)" : ""}`);
  }

  // — Actions exposées à la barre basse d'outils (registre de commandes,
  // docs/spec-palette-outils.md) : les outils ne voient QUE ce contexte. —
  function openPhotoSource(which: "gallery" | "camera") {
    const target = activeStepId ?? steps[0]?.id;
    if (target == null) return;
    if (!openSteps.has(target)) { setOpenSteps((prev) => new Set([...prev, target])); setActiveStepId(target); }
    (which === "gallery" ? fileRefs : cameraRefs).current[target]?.click();
  }
  function selectInsertTool(t: Shape["type"] | null) {
    setInsertTool(t);
    const target = activeStepId ?? steps[0]?.id;
    if (t && target != null && !openSteps.has(target)) { setOpenSteps((prev) => new Set([...prev, target])); setActiveStepId(target); }
  }
  function togglePreset(preset: PictoPreset) {
    const target = activeStepId ?? steps[0]?.id;
    if (target == null) return;
    const stp = steps.find((x) => x.id === target);
    if (!stp) return;
    if (!openSteps.has(target)) { setOpenSteps((prev) => new Set([...prev, target])); setActiveStepId(target); }
    const idx = stp.pictos.findIndex((x) => x.kind === preset.kind);
    void patchStep(stp, { pictos: idx >= 0 ? stp.pictos.filter((_, k) => k !== idx) : [...stp.pictos, { kind: preset.kind, label: preset.label, color: preset.color }] });
  }
  function deleteActiveStep() {
    const target = activeStepId ?? steps[0]?.id;
    if (target == null) return;
    const stp = steps.find((x) => x.id === target);
    if (stp) setConfirmDeleteStep(stp);
  }
  function deleteCanvasSelection() { canvasDeleteRef.current?.(); }

  const ownerSuggestions = useMemo(() => {
    const q = ownerEmail.trim().toLowerCase();
    const list = q
      ? accounts.filter((u) => `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(q))
      : accounts;
    return list.slice(0, 6);
  }, [ownerEmail, accounts]);

  const toolCtx: ToolContext = {
    isNew, steps, activeStepId, insertTool, insertColor, canvasSelection,
    actions: { addStep, openPhotoSource, setInsertTool: selectInsertTool, setInsertColor, togglePreset, deleteActiveStep, deleteCanvasSelection },
  };

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
      <main className="mx-auto grid w-full min-w-0 max-w-[820px] gap-4 p-4 pb-28">
        {error && <Alert variant="error">{error}</Alert>}
        {notice && <Alert variant="ok">{notice}</Alert>}

        <section className="sticky top-[var(--nav-h,2.9rem)] z-30 grid min-w-0 gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-md">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="m-0 min-w-0 max-w-full flex-1 basis-32 truncate text-base">
              {isNew ? "Nouveau mode opératoire" : (title || "Sans titre")}{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.8em]">{reference || wf?.reference}</code>
            </h1>
            {!isNew && !metaSaved && (
              <Badge variant="warn" role="status" className="font-semibold">Enregistrement…</Badge>
            )}
            {!isNew && (
              <Button onClick={() => setShowMeta((v) => !v)} aria-expanded={showMeta} variant="outline" size="sm">
                {showMeta ? "Masquer les détails" : "Détails"}
              </Button>
            )}
            {!isNew && steps.length > 0 && (
              <Button onClick={() => setConfirmPublish(true)} variant="brand" size="sm" className="ml-auto" title="Publier une nouvelle version" aria-label="Publier">
                Publier
              </Button>
            )}
          </div>
          {(isNew || showMeta) && (
          <div className="grid gap-2">
            <Label className="grid min-w-0 gap-1 text-muted-foreground">Titre
              <Input value={title} onChange={(e) => { setTitle(e.target.value); setMetaSaved(false); }} placeholder="Remplacement courroie" />
            </Label>
            {isNew ? (
              <Label className="grid min-w-0 gap-1 text-muted-foreground">Référence
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MO-001" />
              </Label>
            ) : (
              <p className="m-0 text-muted-foreground"><code>{wf?.reference}</code> — {wf?.state === "published" ? `publié (V${wf.current_version})` : "brouillon"}</p>
            )}
            <Label className="grid min-w-0 gap-1 text-muted-foreground">Famille
              <Input value={family} onChange={(e) => { setFamily(e.target.value); setMetaSaved(false); }} placeholder="Mécanique / Électrique / Qualité…" />
            </Label>
            <Label className="grid min-w-0 gap-1 text-muted-foreground">Type
              <Input value={category} onChange={(e) => { setCategory(e.target.value); setMetaSaved(false); }} placeholder="Maintenance, Contrôle…" />
            </Label>
            <Label className="grid min-w-0 gap-1 text-muted-foreground">Description
              <Textarea value={description} onChange={(e) => { setDescription(e.target.value); setMetaSaved(false); }} rows={2} className="min-h-0" />
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Label className="grid min-w-0 gap-1 text-muted-foreground">À revoir le
                <Input type="date" value={reviewDue} onChange={(e) => { setReviewDue(e.target.value); setMetaSaved(false); }} />
              </Label>
              <div className="relative grid min-w-0 gap-1">
                <Label htmlFor="owner-email" className="text-muted-foreground">Responsable</Label>
                <Input
                  id="owner-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => { setOwnerEmail(e.target.value); setMetaSaved(false); setOwnerOpen(true); }}
                  onFocus={() => setOwnerOpen(true)}
                  onBlur={() => setTimeout(() => setOwnerOpen(false), 150)}
                  placeholder="Rechercher un responsable…"
                  aria-label="Responsable — rechercher parmi les comptes"
                  autoComplete="off"
                />
                {ownerOpen && ownerSuggestions.length > 0 && (
                  <div role="listbox" aria-label="Comptes responsables" className="absolute top-full z-40 grid max-h-48 w-full min-w-0 gap-0.5 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg">
                    {ownerSuggestions.map((u) => (
                      <button key={u.id} type="button" role="option" aria-selected={u.email === ownerEmail}
                        onMouseDown={(e) => { e.preventDefault(); setOwnerEmail(u.email); setMetaSaved(false); setOwnerOpen(false); }}
                        className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                        <span className="truncate font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "(sans nom)"}</span>
                        <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
          {isNew && (
            <Button onClick={createWorkflow} disabled={!title.trim() || !reference.trim()}>
              Créer
            </Button>
          )}
          {!isNew && (
            <div className="relative flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible border-t border-border-soft pt-2">
              <Select
                value={activeStepId ?? steps[0]?.id ?? ""}
                onChange={(e) => {
                  const stepId = Number(e.target.value);
                  if (!stepId) return;
                  setOpenSteps((prev) => new Set([...prev, stepId]));
                  setActiveStepId(stepId);
                  setTimeout(() => { document.getElementById(`edit-step-${stepId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
                }}
                aria-label="Étape affichée — choisir pour y aller"
                title="Étape active — choisir pour y aller"
                className="m-0 h-auto min-w-0 max-w-full flex-1 basis-24 py-1 text-sm font-semibold"
              >
                {steps.map((st, si) => {
                  const isActive = st.id === (activeStepId ?? steps[0]?.id);
                  return <option key={st.id} value={st.id}>{isActive ? "▶ " : ""}{si + 1}. {st.title}</option>;
                })}
              </Select>
              <Button
                onClick={() => {
                  if (steps.length === 0) return;
                  if (openSteps.size === steps.length) setOpenSteps(new Set());
                  else setOpenSteps(new Set(steps.map((st) => st.id)));
                }}
                variant="outline"
                size="icon"
                title={openSteps.size === steps.length && steps.length > 0 ? "Tout replier" : "Tout ouvrir"}
                aria-label="Tout replier ou ouvrir"
              >{openSteps.size === steps.length && steps.length > 0 ? <FoldVertical size={16} /> : <UnfoldVertical size={16} />}</Button>
            </div>
            )}
        </section>


        {!isNew && (
        <>
          {steps.length === 0 && <p className="text-muted-foreground">Aucune étape. Ajoutez la première.</p>}
            <ol className="grid gap-2.5">
              {steps.map((step, i) => (
                <li
                  key={step.id}
                  id={`edit-step-${step.id}`}
                  className={cn("grid min-w-0 gap-2 scroll-mt-32 rounded-lg bg-surface p-3 px-4 shadow-sm", dragIndex === i ? "outline-2 outline-dashed outline-primary" : "outline-none")}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                          // #7 : relâcher sur la zone « supprimer » ouvre la
                          // confirmation (jamais de suppression directe).
                          if (el?.closest?.("[data-step-delete]")) {
                            const stp = steps[from];
                            dragFromRef.current = null;
                            setDragIndex(null);
                            setDragCursor(null);
                            if (stp) setConfirmDeleteStep(stp);
                            return;
                          }
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
                      className="cursor-grab select-none px-1.5 py-1 text-muted-foreground"
                      style={{ touchAction: "none" }}
                    >
                      <GripVertical size={16} aria-hidden="true" />
                    </span>
                    
                    <span aria-hidden="true" className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">{i + 1}</span>
                    <Input
                      value={step.title}
                      onChange={(e) => { setActiveStepId(step.id); setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, title: e.target.value } : s))); }}
                      onBlur={() => patchStep(step, { title: step.title })}
                      className="min-w-0 flex-1 basis-32 font-semibold"
                      aria-label={`Titre étape ${i + 1}`}
                      onClick={() => { if (!openSteps.has(step.id)) setOpenSteps((prev) => new Set([...prev, step.id])); setActiveStepId(step.id); }}
                    />
                    <Button
                      onClick={() => setOpenSteps((prev) => { const n = new Set(prev); if (n.has(step.id)) n.delete(step.id); else { n.add(step.id); setActiveStepId(step.id); } return n; })}
                      aria-expanded={openSteps.has(step.id)}
                      aria-label={openSteps.has(step.id) ? `Replier l'étape ${i + 1}` : `Ouvrir l'étape ${i + 1}`}
                      variant="outline"
                      size="sm"
                      className={cn("min-w-9 px-2.5", openSteps.has(step.id) && "bg-accent")}
                    >
                      {openSteps.has(step.id) ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    </Button>
                    
                  </div>
                  {openSteps.has(step.id) && (
                  <>
                  <Textarea
                    value={step.body}
                    rows={2}
                    placeholder="Description de l'opération…"
                    onChange={(e) => { setActiveStepId(step.id); setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, body: e.target.value } : s))); }}
                    onBlur={() => patchStep(step, { body: step.body })}
                    className="min-h-0"
                    aria-label={`Description étape ${i + 1}`}
                  />
                  {uploadProgress?.stepId === step.id && (
                    <p role="status" className="m-0 text-sm text-muted-foreground">
                      Envoi des photos… {uploadProgress.done}/{uploadProgress.total}
                    </p>
                  )}
                  {(step.photos ?? []).length === 0 && (
                      <div role="note" className="flex flex-wrap items-center gap-1.5 rounded bg-warn-bg px-2 py-1 text-xs text-warn">
                        <span>Cette étape n'a pas de photo — une photo bien cadrée remplace un paragraphe de texte.</span>
                        <button onClick={() => fileRefs.current[step.id]?.click()} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground"><ImageIcon size={14} aria-hidden="true" /> Galerie</button>
                        <button onClick={() => cameraRefs.current[step.id]?.click()} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground"><Camera size={14} aria-hidden="true" /> Prendre une photo</button>
                      </div>
                    )}
           <div className="grid gap-1.5">
                    <StepCanvas
                      stepId={step.id}
                      tool={activeStepId === step.id ? insertTool : null}
                      color={insertColor}
                      onToolDone={() => setInsertTool(null)}
                      onSelectionChange={activeStepId === step.id ? (n) => setCanvasSelection(n) : undefined}
                      deleteActionRef={activeStepId === step.id ? (fn) => { canvasDeleteRef.current = fn; } : undefined}
                      photos={(step.photos ?? []).map((ph) => {
                        const w = typeof ph.display_w === "number" ? ph.display_w : ph.display_size === "full" ? 1 : ph.display_size === "large" ? 0.85 : ph.display_size === "small" ? 0.35 : 1;
                        return {
                          photo: ph,
                          x: typeof ph.display_x === "number" ? ph.display_x : 0,
                          y: typeof ph.display_y === "number" ? ph.display_y : 0.05,
                          w,
                        };
                      })}
                      canvasShapes={step.canvas ?? []}
                      onInteract={() => { if (activeStepId !== step.id) setActiveStepId(step.id); }}
                      onPhotosChanged={async () => { const w = await api.getWorkflow(id!); setSteps(w.steps); }}
                    />
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        ref={(el) => { fileRefs.current[step.id] = el; }}
                        className="hidden"
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) await uploadPhotos(step, files);
                          e.target.value = "";
                        }}
                      />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        ref={(el) => { cameraRefs.current[step.id] = el; }}
                        className="hidden"
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
          {!isNew && user?.role === "admin" && (
            <section className="mt-5 grid gap-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-3.5" aria-label="Suppression du mode opératoire">
              {!confirmDeleteDoc ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="min-w-40 flex-1 text-sm text-muted-foreground">Supprimer ce mode opératoire (étapes, photos, versions)</span>
                  <Button onClick={() => { setConfirmDeleteDoc(true); setConfirmDeleteDoc2(false); }} variant="outline" size="sm" className="border-danger-border bg-surface text-error hover:bg-danger-bg">Supprimer le mode opératoire…</Button>
                </div>
              ) : !confirmDeleteDoc2 ? (
                <div className="grid gap-2">
                  <p className="m-0 text-sm font-semibold">
                    <span className="inline-flex items-center gap-1.5"><TriangleAlert size={16} aria-hidden="true" /> Supprimer « {title || wf?.title} »</span> ({reference || wf?.reference}) ?
                  </p>
                  <p className="m-0 text-sm text-muted-foreground">
                    Toutes les étapes, photos, versions et exports seront définitivement supprimés. Cette action est irréversible.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => setConfirmDeleteDoc(false)} variant="outline" size="sm">Annuler</Button>
                    <Button onClick={() => { setConfirmDeleteDoc2(true); setDeleteAck(false); }} variant="outline" size="sm" className="border-danger-border bg-surface font-semibold text-error hover:bg-danger-bg">Continuer…</Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <p className="m-0 text-sm font-semibold text-error">
                    Dernière confirmation — cochez pour valider la suppression définitive :
                  </p>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={deleteAck} onChange={(e) => setDeleteAck(e.target.checked)} />
                    Je comprends que « {title || wf?.title} » et tout son historique seront supprimés sans possibilité de retour
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => { setConfirmDeleteDoc(false); setConfirmDeleteDoc2(false); setDeleteAck(false); }} variant="outline" size="sm">Annuler</Button>
                    <Button onClick={() => void deleteWorkflow()} disabled={!deleteAck} variant="destructive" size="sm">Supprimer définitivement</Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
        )}
      </main>
      {!isNew && <EditorBottomBar ctx={toolCtx} />}
      {dragIndex !== null && (
        <div
          data-step-delete
          aria-hidden="true"
          className="fixed bottom-28 left-1/2 z-[210] -translate-x-1/2 inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-danger-border bg-danger-bg px-4 py-2.5 text-sm font-semibold text-error shadow-xl"
        >
          <Trash2 size={16} aria-hidden="true" /> Relâchez ici pour supprimer l'étape
        </div>
      )}
      {dragIndex !== null && dragCursor && (
        <div ref={dragGhostRef} aria-hidden="true" className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-[120%] rounded-md bg-primary px-2.5 py-1 text-sm text-primary-foreground shadow-lg" style={{ left: dragCursor.x, top: dragCursor.y }}>
          Déplacer « {steps[dragIndex]?.title ?? ""} »
        </div>
      )}
      {confirmDeleteStep && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Confirmer la suppression de l'étape">
          <div className="grid max-w-[400px] gap-3 rounded-lg border border-border bg-surface p-5 text-foreground">
            <h2 className="m-0 text-lg">Supprimer l'étape « {confirmDeleteStep.title} » ?</h2>
            <p className="m-0 text-sm text-muted-foreground">
              Ses photos et annotations seront supprimées. Cette action est irréversible sans version publiée.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmDeleteStep(null)} variant="outline" size="sm">Annuler</Button>
              <Button onClick={() => void removeStep(confirmDeleteStep)} variant="destructive" size="sm">Supprimer</Button>
            </div>
          </div>
        </div>
      )}
      {wf && (
        <Modal
          open={confirmPublish}
          onClose={() => setConfirmPublish(false)}
          title={wf.state === "published" ? `Publier V${(wf.current_version ?? 0) + 1} ?` : "Publier en V1 ?"}
          footer={
            <>
              <Button onClick={() => setConfirmPublish(false)} variant="outline">Annuler</Button>
              <Button onClick={() => { setConfirmPublish(false); void publish(); }} variant="brand">Confirmer la publication</Button>
            </>
          }
        >
          <p className="m-0 text-sm text-muted-foreground">
            Un snapshot immuable de cette version sera créé ({steps.length} étape{steps.length > 1 ? "s" : ""}). La version restera consultable et exportable même après vos modifications suivantes.
          </p>
          <Label className="mt-3 grid gap-1 text-muted-foreground">
            Modifications apportées (visible dans l'historique)
            <Textarea value={changelog} onChange={(e) => setChangelog(e.target.value)} rows={2} className="min-h-0" placeholder="Ex. : ajout de l'étape de contrôle final, photo arrière remplacée" />
          </Label>
        </Modal>
      )}
    </>
  );
}
