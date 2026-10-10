# Types partagés — CONTRAT FIGÉ (vague 0)

Tout fichier de ce dossier fait partie du contrat figé. Aucun worker ne peut le modifier.
Toute évolution passe par le chef de projet, sur `beta`, avant lancement d'une vague.

## Rôles (RF-2, RF-3)
type Role = "reader" | "author" | "admin";

interface User {
  id: number;
  email: string;
  role: Role;
}

## Mode opératoire (RF-10)
type WorkflowState = "draft" | "published";

interface Workflow {
  id: number;
  title: string;
  reference: string;
  description: string;
  category: string;
  state: WorkflowState;
  currentVersion: number; // 0 = jamais publié
  createdAt: string;
  updatedAt: string;
}

## Étape (RF-11, RF-12)
interface Step {
  id: number;
  workflowId: number;
  position: number;
  title: string;
  body: string;
  pictos: string[];
}

## Photo (RF-13)
interface Photo {
  id: number;
  stepId: number;
  filename: string;
  alt: string;
}

## Version (RF-20 à RF-23)
interface WorkflowVersion {
  id: number;
  workflowId: number;
  number: number; // 1, 2, 3…
  snapshot: string; // JSON complet du workflow au moment de la publication
  authorEmail: string;
  publishedAt: string;
}

## Format d'erreur API standard
interface ApiError {
  error: string;
  message: string;
}
