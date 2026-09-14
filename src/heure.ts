/** Heure légale du Maroc et dates en français. */

// Le Maroc repasse à l'heure GMT le 20/09/2026 à 2h (décret n° 2.26.530) ; avant, GMT+1.
// La règle est écrite ici plutôt que demandée à Intl, dont les données de fuseaux
// peuvent être antérieures à ce décret.
const PASSAGE_GMT = Date.UTC(2026, 8, 20, 1, 0);
const MINUTE = 60_000;

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];

export interface HeureLocale {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
  jourSemaine: number;
}

/** Date et heure affichées au Maroc pour un instant (millisecondes UTC). */
export function heureMaroc(instant: number): HeureLocale {
  const decalage = instant < PASSAGE_GMT ? 60 : 0;
  const d = new Date(instant + decalage * MINUTE);
  return {
    annee: d.getUTCFullYear(),
    mois: d.getUTCMonth() + 1,
    jour: d.getUTCDate(),
    heure: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    jourSemaine: d.getUTCDay(),
  };
}

/** Instant UTC d'une heure marocaine saisie « AAAA-MM-JJTHH:MM », ou null si invalide. */
export function instantMaroc(valeur: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valeur);
  if (!m) return null;
  const [annee, mois, jour, heure, minute] = m.slice(1).map(Number);
  const brut = Date.UTC(annee, mois - 1, jour, heure, minute);
  const verif = new Date(brut);
  if (verif.getUTCMonth() !== mois - 1 || verif.getUTCDate() !== jour || heure > 23 || minute > 59) {
    return null;
  }
  const enGmt1 = brut - 60 * MINUTE;
  return enGmt1 < PASSAGE_GMT ? enGmt1 : brut;
}

const deux = (n: number) => String(n).padStart(2, "0");

export function dateEnFrancais(h: HeureLocale): string {
  return `${JOURS[h.jourSemaine]} ${h.jour} ${MOIS[h.mois - 1]} ${h.annee} à ${deux(h.heure)}h${deux(h.minute)}`;
}

export function dateCourte(h: HeureLocale): string {
  return `${deux(h.jour)}/${deux(h.mois)} à ${deux(h.heure)}h${deux(h.minute)}`;
}

/** Nombre de jours calendaires (au Maroc) entre deux instants. */
export function joursEntre(debut: number, fin: number): number {
  const a = heureMaroc(debut);
  const b = heureMaroc(fin);
  return Math.round((Date.UTC(b.annee, b.mois - 1, b.jour) - Date.UTC(a.annee, a.mois - 1, a.jour)) / (1440 * MINUTE));
}
