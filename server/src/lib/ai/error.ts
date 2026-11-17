// C-108 (V14 #1) — erreurs du socle IA : status HTTP de sortie explicite
// (422 = config absente côté appelant, 502 = moteur en erreur, 504 = lent).
export class AiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}
