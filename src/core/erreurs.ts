/**
 * Erreurs métier typées. Toute route qui échoue de manière prévisible lève l'une
 * de ces classes ; le gestionnaire d'erreurs central (voir server.ts) les traduit
 * dans le format de réponse uniforme :
 *   { succes: false, erreur: { code, message, details? } }
 */
export class ErreurMetier extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statut = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ErreurMetier";
  }
}

export class ErreurNonTrouve extends ErreurMetier {
  constructor(entite: string, id?: string) {
    super("NON_TROUVE", `${entite} introuvable${id ? ` (${id})` : ""}`, 404);
  }
}

export class ErreurNonAutorise extends ErreurMetier {
  constructor(message = "Authentification requise") {
    super("NON_AUTORISE", message, 401);
  }
}

export class ErreurAccesRefuse extends ErreurMetier {
  constructor(message = "Accès refusé") {
    super("ACCES_REFUSE", message, 403);
  }
}

export class ErreurConflit extends ErreurMetier {
  constructor(message: string) {
    super("CONFLIT", message, 409);
  }
}

export class ErreurValidation extends ErreurMetier {
  constructor(message: string, details?: unknown) {
    super("VALIDATION", message, 422, details);
  }
}
