import StepCanvas, { COLORS } from "../step-canvas";
import { PhotoMeta } from "../photo-meta";
import StepComments from "../step-comments";
import ReviewPanel from "../review-panel";
import type { Shape } from "../annotated-photo";
import { Camera, ChevronDown, ChevronRight, FoldVertical, GripVertical, Image as ImageIcon, Trash2, TriangleAlert, UnfoldVertical } from "lucide-react";
import { EditorBottomBar } from "../editor/bottom-bar";
import { pushHistory, canUndo, canRedo, undo as undoHistory, redo as redoHistory, resetHistory } from "../editor/history";
import { filterImageFiles, pasteImageFromClipboard } from "../editor/drop-paste";
import type { PictoPreset, ToolContext } from "../editor/tools/registry";
import { PICTO_PRESETS } from "../editor/tools/registry";
import { DOCUMENT_TEMPLATES } from "../templates";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type AppSettings, type Category, type EditorialStatus, type Photo, type Step, type Workflow, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Alert, Modal } from "../components/ui/dialog";
import { Input, Label, Select, Textarea } from "../components/ui/input";
import { buildTree, flattenTree } from "../lib/categories-tree";
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
  const [searchParams] = useSearchParams();
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
  const [canvasSel, setCanvasSel] = useState<{ photos: number[]; shapes: number[] }>({ photos: [], shapes: [] });
  // C-73 : rognage — demande depuis la barre + pile de retour arrière
  // (l'ancien fichier reste sur le disque : annulation tant que l'éditeur est ouvert).
  const [cropTick, setCropTick] = useState(0);
  // V15 : undo/redo global — la pile vit dans editor/history.ts ; histTick
  // force le re-rendu des boutons apres chaque push/undo/redo.
  const [histTick, setHistTick] = useState(0);
  void histTick;
  // C-98 (V13 #5) : avertissements de publication (photos sans description IA).
  const [publishWarnings, setPublishWarnings] = useState<{ number: number; warnings: string[] } | null>(null);
  // C-99 : photo ouverte dans le panneau d'édition (vignettes sous le canevas)
  const [metaSel, setMetaSel] = useState<{ stepId: number; photoId: number } | null>(null);
  const canvasDeleteRef = useRef<(() => void) | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());
  const [showMeta, setShowMeta] = useState(false);
  const [insertTool, setInsertTool] = useState<Shape["type"] | null>(null);
  const [insertColor, setInsertColor] = useState(COLORS[0]);
  const [insertWidth, setInsertWidth] = useState(5); // C-74 : défaut 5 (paramètre admin)
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<Step | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  // C-71 (#4) : abandon du brouillon -> restauration de la dernière publiée
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [reviewDue, setReviewDue] = useState("");
  // C-86 : le préremplissage ne doit jamais écraser une saisie manuelle
  // (date posée ou champ volontairement vidé).
  const [reviewTouched, setReviewTouched] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  // C-72 (#3) : le champ AFFICHE « Prénom Nom », la donnée stockée reste
  // l'email. Un responsable inconnu est interdit : la saisie libre filtre,
  // seules les suggestions committent ; sinon le champ se vide.
  const [ownerDisplay, setOwnerDisplay] = useState("");
  // #5 : suggestions de responsable — recherche par nom ET email (les
  // datalists natifs ne montraient pas les Prénom/Nom de façon fiable).
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [changelog, setChangelog] = useState("");
  // V17 (B4) : panneau de relecture du document.
  const [showReview, setShowReview] = useState(false);
  // C-97 (V12 #8) : indications métiers actives — chargées au montage, seed en
  // dur le temps du chargement (ou si l'appel échoue, mode hors-ligne).
  const [indications, setIndications] = useState<PictoPreset[]>(PICTO_PRESETS);
  // C-96 (V12 #5) : retours terrain ouverts visibles en édition — badge
  // global + badge par étape, lien vers la page de traitement.
  const [openFeedbacks, setOpenFeedbacks] = useState<{ id: number; step_id: number }[]>([]);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false);
  const [confirmDeleteDoc2, setConfirmDeleteDoc2] = useState(false);
  const [deleteAck, setDeleteAck] = useState(false); // C-46 : case décochée par défaut
  const [metaSaved, setMetaSaved] = useState(true);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // C-42 : input dédié appareil photo (capture natif du navigateur, sans
  // couche supplémentaire) à côté de l'input galerie
  const cameraRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const isNew = id === "new";
  useEffect(() => {
    if (isNew) return;
    api.listFeedback(Number(id))
      .then((fbs) => setOpenFeedbacks(fbs.filter((f) => f.status === "open").map((f) => ({ id: f.id, step_id: f.step_id }))))
      .catch(() => setOpenFeedbacks([]));
  }, [id, isNew]);
  useEffect(() => {
    api.getIndications()
      .then((list) => { if (list.length > 0) setIndications(list); })
      .catch(() => { /* seed conservé */ });
  }, []);
  // C-88 : unicité du numéro — vérification EN DIRECT en création (le
  // serveur reste le garde-fou final, insensible à la casse).
  const [refTaken, setRefTaken] = useState(false);
  const refCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isNew) return;
    const v = reference.trim();
    if (!v) { setRefTaken(false); return; }
    if (refCheckTimer.current) clearTimeout(refCheckTimer.current);
    refCheckTimer.current = setTimeout(() => {
      api.listWorkflows({ reference: v })
        .then((wfs) => setRefTaken(wfs.some((w) => w.reference.toLowerCase() === v.toLowerCase())))
        .catch(() => setRefTaken(false));
    }, 400);
    return () => { if (refCheckTimer.current) clearTimeout(refCheckTimer.current); };
  }, [reference, isNew]);
  // C-88 : Famille = liste de recherche — suggestions des familles
  // existantes (la saisie libre reste possible pour en créer une nouvelle).
  const [families, setFamilies] = useState<string[]>([]);
  const [familyOpen, setFamilyOpen] = useState(false);
  // C-94 : rattachement arborescence + document parent.
  const [cats, setCats] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [parentIdDoc, setParentIdDoc] = useState("");
  const [otherDocs, setOtherDocs] = useState<Workflow[]>([]);
  useEffect(() => {
    api.listWorkflows()
      .then((wfs) => setFamilies([...new Set(wfs.map((w) => w.family).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"))))
      .catch(() => { /* suggestions indisponibles : saisie libre conservée */ });
  }, []);
  const familySuggestions = useMemo(() => {
    const q = family.trim().toLowerCase();
    const list = q ? families.filter((f) => f.toLowerCase().includes(q)) : families;
    return list.slice(0, 8);
  }, [family, families]);
  // C-74 : épaisseur par défaut depuis les paramètres admin.
  // C-86 : le délai de revue par défaut arrive avec (préremplissage).
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    api.getSettings().then((s) => { setInsertWidth(s.default_stroke_width); setAppSettings(s); }).catch(() => { /* défauts conservés */ });
  }, []);
  // C-83 : lien « Mettre à jour la revue » depuis le lecteur — les détails
  // s'ouvrent directement sur le champ de date de revue.
  useEffect(() => {
    if (searchParams.get("revue") === "1") setShowMeta(true);
  }, [searchParams]);
  // C-45 : liste des comptes actifs pour le sélecteur de responsable.
  // C-85 : /api/users (author+) — l'ancien /api/admin/users renvoyait 403
  // aux auteurs : aucune suggestion de responsable ne s'affichait.
  // C-87 : chargée DÈS LA CRÉATION — le champ responsable est une recherche
  // aussi en mode création (avant : suggestions vides jusqu'au premier
  // chargement en édition).
  const [accounts, setAccounts] = useState<{ id: number; email: string; first_name?: string; last_name?: string; role: string }[]>([]);
  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: number; email: string; first_name: string; last_name: string; role: string }[]) => {
        if (Array.isArray(list)) setAccounts(list);
      })
      .catch(() => setAccounts([]));
  }, []);
  // C-94 : catégories (arborescence) + autres documents (parent possible).
  useEffect(() => {
    api.listCategories().then((list) => { if (Array.isArray(list)) setCats(list); }).catch(() => setCats([]));
    api.listWorkflows().then((wfs) => setOtherDocs(Array.isArray(wfs) ? wfs : [])).catch(() => setOtherDocs([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    api.getWorkflow(id!)
      .then((w) => {
        setWf(w); setSteps(w.steps);
        resetHistory();
        setTitle(w.title); setReference(w.reference);
        setCategory(w.category); setFamily(w.family ?? ""); setDescription(w.description);
        setReviewDue(w.review_due ?? ""); setOwnerEmail(w.owner_email ?? "");
        setCategoryId(w.category_id ? String(w.category_id) : ""); setParentIdDoc(w.parent_id ? String(w.parent_id) : "");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id, isNew]);

  useEffect(() => {
    if (user?.role === "reader") navigate("/", { replace: true });
  }, [user, navigate]);
  // C-86 : préremplissage de la date de revue — un MO sans date « À revoir
  // le » reçoit aujourd'hui + default_review_days (paramètre admin, 30 j
  // par défaut). Valeur affichée seulement : elle sera persistée à la
  // prochaine sauvegarde des métadonnées ou à la publication.
  // C-87 : actif AUSSI EN CRÉATION (avant : champ vide au premier affichage).
  useEffect(() => {
    if (reviewTouched || !appSettings || reviewDue) return;
    if (!isNew && !wf) return;
    const days = typeof appSettings.default_review_days === "number" && appSettings.default_review_days >= 1
      ? appSettings.default_review_days
      : 30;
    const d = new Date(Date.now() + days * 86400000);
    setReviewDue(d.toISOString().slice(0, 10));
  }, [wf, isNew, reviewTouched, appSettings, reviewDue]);
  // B-A2 : autosave des métadonnées (RF-16) — 800 ms après la dernière
  // frappe ; bandeau "Enregistrement…" pendant la requête, restauration de
  // l'indicateur si elle échoue.
  const wfId = wf?.id;
  useEffect(() => {
    if (isNew || !wfId || metaSaved) return;
    const t = setTimeout(async () => {
      try {
        await api.updateWorkflow(wfId, { title, category, family, description, review_due: reviewDue || null, owner_email: ownerEmail || null, category_id: categoryId ? Number(categoryId) : null, parent_id: parentIdDoc ? Number(parentIdDoc) : null });
        setMetaSaved(true);
      } catch {
        /* l'indicateur reste "à enregistrer" ; la publication retentera */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [wfId, isNew, metaSaved, title, category, family, description, reviewDue, ownerEmail, categoryId, parentIdDoc]);

  async function createWorkflow() {
    setError(null);
    try {
      // C-87 : la date de revue et le responsable saisis en CRÉATION sont
      // transmis au POST (avant : perdus au passage en édition, les champs
      // se vidaient au rechargement).
      const created = await api.createWorkflow({
        title: title.trim(),
        reference: reference.trim(),
        category,
        family,
        description,
        review_due: reviewDue || null,
        owner_email: ownerEmail || null,
        category_id: categoryId ? Number(categoryId) : null,
        parent_id: parentIdDoc ? Number(parentIdDoc) : null,
      });
      // V15 : si un template qualité est choisi (modale de la liste), ses
      // étapes sont créées d'un coup — l'éditeur rechargé les affiche.
      const tplId = searchParams.get("template");
      const tpl = tplId ? DOCUMENT_TEMPLATES.find((t) => t.id === tplId) : undefined;
      if (tpl) {
        for (const s of tpl.steps) {
          await api.addStep(created.id, { title: s.title, body: s.body });
        }
      }
      // pas d'autosave fantôme : les valeurs viennent d'être enregistrées,
      // le rechargement en édition resynchronisera l'état.
      setMetaSaved(true);
      // C-87 : le panneau de détails reste OUVERT après la création — les
      // champs date/responsable viennent d'être remplis, ils ne doivent pas
      // disparaître derrière le bouton « Détails » au passage en édition.
      setShowMeta(true);
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
    pushHist({
      label: "Ajouter une étape",
      undo: async () => { await api.deleteStep(s.id); },
      redo: async () => { await api.addStep(wf!.id, { title: "Nouvelle étape" }); },
    });
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
      const before: Partial<Step> = {};
      if ("title" in data) before.title = step.title;
      if ("body" in data) before.body = step.body;
      if ("pictos" in data) before.pictos = step.pictos;
      pushHist({
        label: "Modifier l'étape",
        undo: async () => { await api.updateStep(step.id, before as object); },
        redo: async () => { await api.updateStep(step.id, data as object); },
      }, "patch:" + step.id + ":" + Object.keys(data).sort().join("+"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible");
    }
  }

  async function removeStep(step: Step) {
    // V15 : undo best-effort — le DELETE cascade les photos (pas de corbeille) :
    // l'undo recree l'etape (titre/corps/pictos/canevas/position) mais PAS les photos.
    const snapshot = {
      title: step.title, body: step.body, pictos: step.pictos,
      canvas: step.canvas ?? [],
      position: steps.findIndex((s) => s.id === step.id),
    };
    await api.deleteStep(step.id);
    setConfirmDeleteStep(null);
    setSteps((arr) => arr.filter((s) => s.id !== step.id));
    let recreatedId: number | null = null;
    pushHist({
      label: "Supprimer l'étape (les photos supprimées ne reviennent pas)",
      undo: async () => {
        const s2 = await api.addStep(wf!.id, { title: snapshot.title });
        recreatedId = s2.id;
        await api.updateStep(s2.id, { body: snapshot.body, pictos: snapshot.pictos } as object);
        if (snapshot.canvas.length > 0) {
          await fetch("/api/steps/" + s2.id + "/canvas", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ shapes: snapshot.canvas }),
          });
        }
        const w = await api.getWorkflow(id!);
        const ids = w.steps.map((s) => s.id);
        const last = ids.pop()!;
        ids.splice(Math.min(snapshot.position, ids.length), 0, last);
        await api.reorderSteps(wf!.id, ids);
      },
      redo: async () => { if (recreatedId != null) await api.deleteStep(recreatedId); },
    });
  }

  async function moveStep(from: number, to: number) {
    const beforeIds = steps.map((s) => s.id);
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
      pushHist({
        label: "Déplacer une étape",
        undo: async () => { await api.reorderSteps(wf!.id, beforeIds); },
        redo: async () => { await api.reorderSteps(wf!.id, ids); },
      });
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
      pushHist({
        label: "Ajouter une photo",
        undo: async () => { await api.deletePhoto(photo.id); },
        redo: async () => { await api.uploadPhoto(step.id, compressed, alt); },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Envoi impossible");
    }
  }

  const [uploadProgress, setUploadProgress] = useState<{ stepId: number; done: number; total: number } | null>(null);
  async function uploadPhotos(step: Step, files: FileList | File[]) {
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

  // V8 #1 : glisser-déposer et copier-coller d'images — les fichiers
  // atterrissent sur l'étape active (ou la première). Le collage est
  // ignoré pendant la saisie de texte (input/textarea/contentEditable).
  async function dropOrPasteFiles(files: File[]) {
    if (files.length === 0) return;
    const target = activeStepId ?? steps[0]?.id;
    const step = steps.find((s) => s.id === target);
    if (!step) return;
    await uploadPhotos(step, files);
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as Element | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as HTMLElement).isContentEditable)) return;
      const files = pasteImageFromClipboard(e);
      if (files.length > 0) {
        e.preventDefault();
        void dropOrPasteFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

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
    const q = ownerDisplay.trim().toLowerCase();
    const list = q
      ? accounts.filter((u) => `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(q))
      : accounts;
    return list.slice(0, 6);
  }, [ownerDisplay, accounts]);
  const ownerNameOf = (email: string) => {
    const u = accounts.find((x) => x.email === email);
    return u ? ([u.first_name, u.last_name].filter(Boolean).join(" ") || u.email) : email;
  };
  // quand l'email commis change (chargement, restauration) ou que les
  // comptes arrivent, l'affichage se resynchronise sur le nom.
  useEffect(() => {
    setOwnerDisplay(ownerEmail ? ownerNameOf(ownerEmail) : "");
  }, [ownerEmail, accounts]);

  const toolCtx: ToolContext = {
    isNew, steps, activeStepId, insertTool, insertColor, insertWidth, indications,
    canvasSelection: canvasSel.photos.length + canvasSel.shapes.length,
    photoSelected: canvasSel.photos.length, canUndoCrop: false, canUndo: canUndo(), canRedo: canRedo(),
    actions: { addStep, openPhotoSource, setInsertTool: selectInsertTool, setInsertColor, setInsertWidth, togglePreset, deleteActiveStep, deleteCanvasSelection, requestCrop: () => setCropTick((t) => t + 1), undo: () => void doUndo(), redo: () => void doRedo() },
  };

  async function revertDraft() {
    if (!wf) return;
    setError(null);
    try {
      // C-97 (V12 #9) : MO jamais publié → purge du brouillon (route dédiée,
      // sert même si les étapes sont corrompues) ; sinon retour à la
      // dernière version publiée (comportement historique).
      if ((wf.current_version ?? 0) === 0) {
        await api.resetDraft(wf.id);
      } else {
        await api.restoreVersion(wf.id, wf.current_version);
      }
      const w = await api.getWorkflow(id!);
      setWf(w); setSteps(w.steps);
      setTitle(w.title); setReference(w.reference);
      setCategory(w.category); setFamily(w.family ?? ""); setDescription(w.description);
      setReviewDue(w.review_due ?? ""); setOwnerEmail(w.owner_email ?? "");
      setCategoryId(w.category_id ? String(w.category_id) : ""); setParentIdDoc(w.parent_id ? String(w.parent_id) : "");
      setNotice((wf.current_version ?? 0) === 0 ? `Brouillon réinitialisé — étapes et photos non publiées supprimées` : `Brouillon abandonné — retour à V${w.current_version}`);
      setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Restauration impossible");
    }
  }

  // C-72 (#1) : remplace une photo par sa version rognée — la nouvelle
  // photo HÉRITE de la position/taille de l'ancienne, puis l'ancienne est
  // supprimée (le fichier original reste couvert par les versions publiées).
  // C-73 : remplace le FICHIER de la photo — même ligne, donc même position
  // et même taille ; l'ancien fichier reste pour le retour arrière.
  // V15 : helpers historique global — refresh resynchronise depuis l'API,
  // bumpHist force le re-rendu des boutons Annuler/Refaire.
  async function refresh() {
    const w = await api.getWorkflow(id!);
    setSteps(w.steps);
  }
  function bumpHist() { setHistTick((t) => t + 1); }
  async function doUndo() { await undoHistory(); await refresh(); bumpHist(); }
  async function doRedo() { await redoHistory(); await refresh(); bumpHist(); }
  function pushHist(cmd: { label: string; undo: () => Promise<void>; redo: () => Promise<void> }, coalesceKey?: string) {
    pushHistory(cmd, coalesceKey);
    bumpHist();
  }
  function pushCanvasHist(cmd: { label: string; undo: () => Promise<void>; redo: () => Promise<void> }) {
    pushHist(cmd);
  }

  // C-73 : remplace le FICHIER de la photo — même ligne, donc même position
  // et même taille ; l'ancien fichier reste pour le retour arrière.
  // V15 : le rognage entre dans l'historique global (plus de pile dédiée).
  async function cropPhoto(photo: Photo, file: File) {
    setError(null);
    try {
      await api.replacePhotoFile(photo.id, file);
      pushHist({
        label: "Rogner la photo",
        undo: async () => { await api.repointPhotoFile(photo.id, photo.filename); await refresh(); },
        redo: async () => { await api.replacePhotoFile(photo.id, file); await refresh(); },
      });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Recadrage impossible");
    }
  }

  // V17 (B4) : statut éditorial — boucle brouillon → relecture → validé.
  async function changeStatus(status: EditorialStatus) {
    if (!wf || isNew) return;
    setError(null);
    try {
      await api.setEditorialStatus(wf.id, status);
      setWf((w) => (w ? { ...w, editorial_status: status } : w));
      const labels: Record<EditorialStatus, string> = { draft: "Brouillon", in_review: "En relecture", validated: "Validé", obsolete: "Obsolète" };
      setNotice(`Statut éditorial : ${labels[status]}`);
      setTimeout(() => setNotice(null), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Changement de statut impossible");
    }
  }

  async function publish() {
    if (!wf) return;
    setError(null);
    try {
      await api.updateWorkflow(wf.id, { title, category, family, description, review_due: reviewDue || null, owner_email: ownerEmail || null });
      const { number, warnings } = await api.publishWorkflow(wf.id, changelog);
      setChangelog(""); // C-96 (V12 #6) : jamais de commentaire hérité à la publication suivante
      // C-99 : rafraîchir wf.state/current_version pour que le dialog de
      // confirmation affiche le bon numéro à la publication suivante
      // (avant : « Publier V1 ? » restait affiché après une première publication).
      setWf((w) => (w ? { ...w, state: "published", current_version: number } : w));
      // C-98/C-99 (V13 #5) : publication RÉUSSIE mais photos sans description
      // d'image — on reste sur l'éditeur (non bloquant) pour les compléter.
      if ((warnings ?? []).length > 0) {
        setPublishWarnings({ number, warnings: warnings ?? [] });
        setNotice(null);
        return;
      }
      setPublishWarnings(null);
      setNotice(`Publié en V${number}`);
      setTimeout(() => setNotice(null), 2500);
      navigate(`/workflow/${wf.id}/read`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "validation_required") {
        // V17 (B2) : l’instance exige un statut « Validé » — on ouvre le
        // panneau de relecture pour traiter le point bloquant.
        setShowReview(true);
        setError(e.message);
        return;
      }
      setError(e instanceof ApiError ? e.message : "Publication impossible");
    }
  }

  return (
    <>
      <NavBar />
      <main
        className="mx-auto grid w-full min-w-0 max-w-[820px] gap-4 p-4 pb-28"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void dropOrPasteFiles(filterImageFiles(e.dataTransfer.files));
        }}
      >
        {error && <Alert variant="error">{error}</Alert>}
        {notice && <Alert variant="ok">{notice}</Alert>}
        {publishWarnings && (
          <Alert variant="warn" title={`Publié en V${publishWarnings.number} — ${publishWarnings.warnings.length} photo(s) sans description d'image (non bloquant)`}>
            <ul className="mb-2 list-disc pl-4">
              {publishWarnings.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
            Cliquez sur la vignette d'une photo sous le canevas de son étape pour compléter sa description (enregistrement automatique), puis republiez.
          </Alert>
        )}

        <section className="sticky top-[var(--nav-h,2.9rem)] z-30 grid min-w-0 gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-md">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="m-0 min-w-0 max-w-full flex-1 basis-32 truncate text-base">
              {isNew ? "Nouveau mode opératoire" : (title || "Sans titre")}{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.8em]">{reference || wf?.reference}</code>
            </h1>
            {!isNew && !metaSaved && (
              <Badge variant="warn" role="status" className="font-semibold">Enregistrement…</Badge>
            )}
            {!isNew && openFeedbacks.length > 0 && (
              <Link to={`/workflow/${id}/feedbacks`} className="no-underline" title="Traiter les retours terrain">
                <Badge variant="warn" role="status" className="font-semibold">{openFeedbacks.length} retour{openFeedbacks.length > 1 ? "s" : ""} terrain à traiter</Badge>
              </Link>
            )}
            {!isNew && (
              <Button onClick={() => setShowMeta((v) => !v)} aria-expanded={showMeta} variant="outline" size="sm">
                {showMeta ? "Masquer les détails" : "Détails"}
              </Button>
            )}
            {!isNew && wf?.state === "draft" && (
              <Button onClick={() => setConfirmRevert(true)} variant="outline" size="sm" title={(wf.current_version ?? 0) > 0 ? "Abandonner le brouillon et revenir à la dernière version publiée" : "Réinitialiser le brouillon : supprime les étapes et photos non publiées (aucune version publiée)"} aria-label="Abandonner le brouillon">
                {(wf.current_version ?? 0) > 0 ? "Abandonner le brouillon" : "Réinitialiser le brouillon"}
              </Button>
            )}
            {!isNew && (
              <Select
                value={wf?.editorial_status ?? "draft"}
                onChange={(e) => void changeStatus(e.target.value as EditorialStatus)}
                aria-label="Statut éditorial du document"
                title="Statut éditorial — boucle de relecture et de validation"
                className="m-0 h-auto py-1 text-xs font-semibold"
              >
                <option value="draft">Brouillon</option>
                <option value="in_review">En relecture</option>
                <option value="validated">Validé</option>
                <option value="obsolete">Obsolète</option>
              </Select>
            )}
            {!isNew && (wf?.editorial_status ?? "draft") !== "in_review" && (
              <Button onClick={() => void changeStatus("in_review")} variant="outline" size="sm" title="Passer le document « En relecture »" aria-label="Demander une relecture">
                Demander une relecture
              </Button>
            )}
            {!isNew && (
              <Button onClick={() => setShowReview((v) => !v)} variant="outline" size="sm" aria-expanded={showReview} title="Ouvrir le fil de relecture du document">
                Relecture
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
              // C-88 : le numéro est vérifié en direct — deux documents ne
              // peuvent pas partager la même référence (casse ignorée).
              <Label className="grid min-w-0 gap-1 text-muted-foreground">Référence
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MO-001" aria-label="Référence du mode opératoire (unique)" />
                {refTaken && (
                  <p role="alert" className="m-0 text-xs font-semibold text-error">Cette référence est déjà utilisée par un autre document.</p>
                )}
              </Label>
            ) : (
              <p className="m-0 text-muted-foreground"><code>{wf?.reference}</code> — {wf?.state === "published" ? `publié (V${wf.current_version})` : "brouillon"}</p>
            )}
            <div className="relative grid min-w-0 gap-1">
              <Label htmlFor="wf-family" className="text-muted-foreground">Famille</Label>
              <Input
                id="wf-family"
                value={family}
                onChange={(e) => { setFamily(e.target.value); setMetaSaved(false); setFamilyOpen(true); }}
                onFocus={() => setFamilyOpen(true)}
                onBlur={() => setTimeout(() => setFamilyOpen(false), 150)}
                placeholder="Mécanique / Électrique / Qualité… (recherche)"
                aria-label="Famille — rechercher parmi les familles existantes"
                autoComplete="off"
              />
              {familyOpen && familySuggestions.length > 0 && (
                <div role="listbox" aria-label="Familles existantes" className="absolute top-full z-40 grid max-h-48 w-full min-w-0 gap-0.5 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg">
                  {familySuggestions.map((f) => (
                    <button key={f} type="button" role="option" aria-selected={f === family}
                      onMouseDown={(e) => { e.preventDefault(); setFamily(f); setMetaSaved(false); setFamilyOpen(false); }}
                      className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <span className="truncate font-medium">{f}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Label className="grid min-w-0 gap-1 text-muted-foreground">Type
              <Input value={category} onChange={(e) => { setCategory(e.target.value); setMetaSaved(false); }} placeholder="Maintenance, Contrôle…" />
            </Label>
            {cats.length > 0 && (
              <Label className="grid min-w-0 gap-1 text-muted-foreground">Emplacement (arborescence)
                <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setMetaSaved(false); }} aria-label="Emplacement dans l'arborescence">
                  <option value="">— Non classé —</option>
                  {flattenTree(buildTree(cats)).map((r) => (
                    <option key={r.id} value={String(r.id)}>{" ".repeat(r.depth * 2)}{r.name}</option>
                  ))}
                </Select>
                {user?.role === "admin" && <Link to="/categories" className="text-xs text-link hover:underline">Gérer l'arborescence</Link>}
              </Label>
            )}
            {!isNew && (
              <Label className="grid min-w-0 gap-1 text-muted-foreground">Document parent
                <Select value={parentIdDoc} onChange={(e) => { setParentIdDoc(e.target.value); setMetaSaved(false); }} aria-label="Document parent">
                  <option value="">— Aucun —</option>
                  {otherDocs.filter((d) => d.id !== wf?.id).map((d) => (
                    <option key={d.id} value={String(d.id)}>{d.reference} — {d.title}</option>
                  ))}
                </Select>
              </Label>
            )}
            <Label className="grid min-w-0 gap-1 text-muted-foreground">Description
              <Textarea value={description} onChange={(e) => { setDescription(e.target.value); setMetaSaved(false); }} rows={2} className="min-h-0" />
            </Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
              <Label className="grid min-w-0 gap-1 text-muted-foreground">À revoir le
                <Input type="date" value={reviewDue} onChange={(e) => { setReviewDue(e.target.value); setReviewTouched(true); setMetaSaved(false); }} />
              </Label>
              <div className="relative grid min-w-0 gap-1">
                <Label htmlFor="owner-email" className="text-muted-foreground">Responsable</Label>
                <Input
                  id="owner-email"
                  type="text"
                  value={ownerDisplay}
                  onChange={(e) => { setOwnerDisplay(e.target.value); setOwnerEmail(""); setMetaSaved(false); setOwnerOpen(true); }}
                  onFocus={() => setOwnerOpen(true)}
                  onBlur={() => {
                    // C-72 (#3) : seul un compte CONNU peut être responsable —
                    // une saisie non résolue vide le champ (plutôt qu'un email
                    // libre jamais attribuable).
                    const raw = ownerDisplay.trim().toLowerCase();
                    const resolved = raw
                      ? accounts.find((u) => u.email.toLowerCase() === raw || [u.first_name, u.last_name].filter(Boolean).join(" ").toLowerCase() === raw)
                      : undefined;
                    if (resolved) {
                      setOwnerEmail(resolved.email);
                      setOwnerDisplay([resolved.first_name, resolved.last_name].filter(Boolean).join(" ") || resolved.email);
                      setMetaSaved(false);
                    } else if (raw) {
                      setOwnerDisplay("");
                      setOwnerEmail("");
                      setMetaSaved(false);
                    }
                    setTimeout(() => setOwnerOpen(false), 150);
                  }}
                  placeholder="Rechercher un responsable (nom ou prénom)…"
                  aria-label="Responsable — rechercher parmi les comptes"
                  autoComplete="off"
                />
                {ownerOpen && ownerSuggestions.length > 0 && (
                  <div role="listbox" aria-label="Comptes responsables" className="absolute top-full z-40 grid max-h-48 w-full min-w-0 gap-0.5 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg">
                    {ownerSuggestions.map((u) => (
                      <button key={u.id} type="button" role="option" aria-selected={u.email === ownerEmail}
                        onMouseDown={(e) => { e.preventDefault(); setOwnerEmail(u.email); setOwnerDisplay([u.first_name, u.last_name].filter(Boolean).join(" ") || u.email); setMetaSaved(false); setOwnerOpen(false); }}
                        className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                        {/* #8 : seulement Prénom Nom — l'email remplit le champ à la sélection */}
                        <span className="truncate font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "(sans nom)"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
          {isNew && (
            <Button onClick={createWorkflow} disabled={!title.trim() || !reference.trim() || refTaken}>
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
        {wf && showReview && (
          <ReviewPanel workflowId={wf.id} />
        )}


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
                    {openFeedbacks.filter((f) => f.step_id === step.id).length > 0 && (
                      <Link to={`/workflow/${id}/feedbacks`} aria-label="Retours terrain à traiter sur cette étape" title="Retours terrain à traiter sur cette étape" className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-warn-bg px-1.5 text-xs font-bold text-warn no-underline">
                        ⚑ {openFeedbacks.filter((f) => f.step_id === step.id).length}
                      </Link>
                    )}
                  </div>
                  {openSteps.has(step.id) && (
                  <>

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
                      strokeWidth={insertWidth}
                      onToolDone={() => setInsertTool(null)}
                      onSelectionChange={activeStepId === step.id ? setCanvasSel : undefined}
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
                      onHistory={pushCanvasHist}
                      onCropFile={(photo, file) => cropPhoto(photo, file)}
                      cropRequest={activeStepId === step.id ? cropTick : 0}
                      onPhotosChanged={async () => { const w = await api.getWorkflow(id!); setSteps(w.steps); }}
                    />
                    {(step.photos ?? []).length > 0 && (() => {
                      // C-99 : vignettes cliquables sous le canevas — la sélection
                      // canevas seule ne suffisait pas (race avec activeStepId,
                      // découverte de la sélection impossible pour l'utilisateur).
                      const photos = step.photos ?? [];
                      const sel = (activeStepId === step.id && canvasSel.photos.length === 1
                        ? photos.find((ph) => ph.id === canvasSel.photos[0])
                        : undefined
                      ) ?? (metaSel?.stepId === step.id ? photos.find((ph) => ph.id === metaSel.photoId) : undefined);
                      return (
                        <div className="grid gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Photos de l'étape — cliquez pour éditer alt et description :</span>
                            {photos.map((ph) => (
                              <button
                                key={ph.id}
                                type="button"
                                onClick={() => setMetaSel(sel?.id === ph.id ? null : { stepId: step.id, photoId: ph.id })}
                                title={ph.alt || ph.filename}
                                className={`h-14 overflow-hidden rounded-md border ${sel?.id === ph.id ? "border-2 border-foreground" : "border-border"}`}
                              >
                                <img src={"/photos/" + ph.filename} alt={ph.alt || ph.filename} className="h-full w-auto" />
                              </button>
                            ))}
                          </div>
                          {sel && (
                            <PhotoMeta
                              photo={sel}
                              onSaved={(p) => setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, photos: (s.photos ?? []).map((ph) => (ph.id === p.id ? p : ph)) } : s)))}
                            />
                          )}
                        </div>
                      );
                    })()}
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
                  {/* C-93 : images d'abord, texte de l'étape en dessous —
                      même ordre que le mode lecture (Vague 12 #1). */}
                  <Textarea
                    value={step.body}
                    rows={2}
                    placeholder="Description de l'opération…"
                    onChange={(e) => { setActiveStepId(step.id); setSteps((arr) => arr.map((s) => (s.id === step.id ? { ...s, body: e.target.value } : s))); }}
                    onBlur={() => patchStep(step, { body: step.body })}
                    className="min-h-0"
                    aria-label={`Description étape ${i + 1}`}
                  />
                  {/* #12 : indications rendues à l'identique du mode lecture —
                      effet immédiat visible pendant l'édition. */}
                  {step.pictos.length > 0 && (
                    <div className="grid gap-1.5">
                      {step.pictos.map((p, k) => (
                        <p key={k} className="m-0 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-foreground" style={{ background: `${p.color}1f`, borderLeft: `5px solid ${p.color}` }}>
                          <TriangleAlert size={16} aria-hidden="true" style={{ color: p.color }} /> {p.label}
                        </p>
                      ))}
                    </div>
                  )}
                  <StepComments stepId={step.id} />
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
              <Button onClick={() => { setConfirmPublish(false); void publish(); }} variant="brand" disabled={!!reviewDue && reviewDue < new Date().toISOString().slice(0, 10)}>Confirmer la publication</Button>
            </>
          }
        >
          {reviewDue && reviewDue < new Date().toISOString().slice(0, 10) && (
            <p role="alert" className="m-0 mb-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
              La date de revue ({reviewDue}) est dépassée — mettez-la à jour dans les détails avant de publier.
            </p>
          )}
          <p className="m-0 text-sm text-muted-foreground">
            Un snapshot immuable de cette version sera créé ({steps.length} étape{steps.length > 1 ? "s" : ""}). La version restera consultable et exportable même après vos modifications suivantes.
          </p>
          <Label className="mt-3 grid gap-1 text-muted-foreground">
            Modifications apportées (visible dans l'historique)
            <Textarea value={changelog} onChange={(e) => setChangelog(e.target.value)} rows={2} className="min-h-0" placeholder="Ex. : ajout de l'étape de contrôle final, photo arrière remplacée" />
          </Label>
        </Modal>
      )}
      {wf && (
        <Modal
          open={confirmRevert}
          onClose={() => setConfirmRevert(false)}
          title={(wf.current_version ?? 0) > 0 ? "Abandonner le brouillon ?" : "Réinitialiser le brouillon ?"}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmRevert(false)}>Annuler</Button>
              <Button variant="destructive" onClick={() => { setConfirmRevert(false); void revertDraft(); }}>
                {(wf.current_version ?? 0) > 0 ? `Revenir à V${wf.current_version}` : "Vider le brouillon"}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm text-muted-foreground">
            {(wf.current_version ?? 0) > 0
              ? `Le brouillon en cours sera remplacé par la dernière version publiée (V${wf.current_version}). Toutes les modifications non publiées seront perdues — cette action ne peut pas être annulée.`
              : "Aucune version n'a encore été publiée : toutes les étapes, photos et commentaires de rédaction du brouillon seront supprimés. Le mode opératoire reste, à neuf — cette action ne peut pas être annulée."}
          </p>
        </Modal>
      )}
    </>
  );
}
