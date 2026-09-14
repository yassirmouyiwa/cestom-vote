/** Base D1 : schéma, paramètres et règles de l'élection. */
import { dateEnFrancais, heureMaroc, instantMaroc, joursEntre } from "./heure";
import { jeton } from "./session";

export const POSTES = [
  ["SG", "Secrétaire Général(e)"],
  ["SGA", "Secrétaire Général(e) Adjoint(e)"],
  ["TG", "Trésorier(e) Général(e)"],
  ["TGA", "Trésorier(e) Général(e) Adjoint(e)"],
  ["CASS", "Chargé(e) aux Affaires Socio-culturelles et Sportives"],
  ["CC", "Chargé(e) de Communication"],
] as const;
export const INTITULES: Record<string, string> = Object.fromEntries(POSTES);

export const STATUTS = { preparation: "En préparation", ouvert: "Vote en cours", clos: "Vote clôturé" } as const;
export type Statut = keyof typeof STATUTS;

export const STATUTS_CANDIDATURE = { attente: "En attente", validee: "Validée", rejetee: "Rejetée" } as const;
export type StatutCandidature = keyof typeof STATUTS_CANDIDATURE;

export const ESSAIS_MAX = 10;
const FENETRE_ESSAIS = 15 * 60_000;

// Sans 0/O ni 1/I/L pour éviter les confusions à la lecture.
const ALPHABET_CODES = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface Parametres {
  titre: string;
  statut: Statut;
  date_limite: string; // heure du Maroc, « AAAA-MM-JJTHH:MM »
}

const PARAMETRES_DEFAUT: Parametres = {
  titre: "Élections du Bureau CESTOM Tétouan 2026-2027",
  statut: "preparation",
  date_limite: "2026-09-20T23:59",
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS candidats (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     poste TEXT NOT NULL,
     nom TEXT NOT NULL,
     detail TEXT NOT NULL DEFAULT '',
     motivation TEXT NOT NULL DEFAULT '',
     telephone TEXT NOT NULL DEFAULT '',
     photo TEXT NOT NULL DEFAULT '',
     statut TEXT NOT NULL DEFAULT 'attente',
     depose_le TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS codes (
     code TEXT PRIMARY KEY,
     membre TEXT NOT NULL DEFAULT '',
     telephone TEXT NOT NULL DEFAULT '',
     cree_le TEXT NOT NULL,
     utilise_le TEXT,
     marque TEXT)`,
  // Bulletins anonymes : aucune colonne ne renvoie au code utilisé, pas d'horodatage, et un
  // identifiant aléatoire en clé primaire (WITHOUT ROWID) : l'ordre d'arrivée n'est pas conservé.
  `CREATE TABLE IF NOT EXISTS voix (
     bulletin TEXT NOT NULL,
     poste TEXT NOT NULL,
     candidat_id INTEGER,
     PRIMARY KEY (bulletin, poste)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS tentatives (ip TEXT NOT NULL, moment INTEGER NOT NULL)`,
];

/** Paramètres de l'élection ; crée les tables à la première utilisation de la base. */
export async function chargerParametres(db: D1Database, schemaCree = false): Promise<Parametres> {
  try {
    const { results } = await db.prepare("SELECT cle, valeur FROM parametres").all<{ cle: string; valeur: string }>();
    return { ...PARAMETRES_DEFAUT, ...Object.fromEntries(results.map((l) => [l.cle, l.valeur])) };
  } catch (erreur) {
    if (schemaCree || !String(erreur).includes("no such table")) throw erreur;
    await db.batch([
      ...SCHEMA.map((sql) => db.prepare(sql)),
      db.prepare("INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?), (?, ?), (?, ?)")
        .bind(...Object.entries(PARAMETRES_DEFAUT).flat()),
    ]);
    return chargerParametres(db, true);
  }
}

export function definirParametre(db: D1Database, cle: keyof Parametres, valeur: string) {
  return db
    .prepare("INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
    .bind(cle, valeur);
}

// --- Date limite des candidatures --------------------------------------------

export function dateLimite(parametres: Parametres): number {
  return instantMaroc(parametres.date_limite) ?? instantMaroc(PARAMETRES_DEFAUT.date_limite)!;
}

export function candidaturesOuvertes(parametres: Parametres, maintenant = Date.now()): boolean {
  // La minute de la date limite est encore acceptée (23h59 incluse).
  return parametres.statut === "preparation" && maintenant < dateLimite(parametres) + 60_000;
}

export function joursRestants(parametres: Parametres, maintenant = Date.now()): number {
  return joursEntre(maintenant, dateLimite(parametres));
}

export function dateLimiteTexte(parametres: Parametres): string {
  return dateEnFrancais(heureMaroc(dateLimite(parametres)));
}

// --- Codes de vote -----------------------------------------------------------

export function nouveauCode(): string {
  let brut = "";
  while (brut.length < 6) {
    for (const octet of crypto.getRandomValues(new Uint8Array(8))) {
      // 248 = 8 × 31 : on écarte les octets qui biaiseraient le tirage.
      if (octet < 248 && brut.length < 6) brut += ALPHABET_CODES[octet % 31];
    }
  }
  return `${brut.slice(0, 3)}-${brut.slice(3)}`;
}

export function normaliserCode(saisie: string): string | null {
  const brut = saisie.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return brut.length === 6 ? `${brut.slice(0, 3)}-${brut.slice(3)}` : null;
}

export function normaliserTelephone(saisie: string): string {
  let chiffres = saisie.replace(/\D/g, "");
  if (chiffres.startsWith("00")) {
    chiffres = chiffres.slice(2);
  } else if (chiffres.length === 10 && chiffres.startsWith("0")) {
    chiffres = "212" + chiffres.slice(1); // numéro marocain local : 06… / 07…
  }
  return chiffres;
}

/** Crée un code par membre [nom, téléphone], en une seule transaction. */
export async function creerCodes(db: D1Database, membres: [string, string][]) {
  const codes = new Set<string>();
  while (codes.size < membres.length) codes.add(nouveauCode());
  const maintenant = new Date().toISOString();
  const lignes = [...codes].map((code, i) => [code, membres[i][0], membres[i][1], maintenant]);
  const requetes = [];
  for (let i = 0; i < lignes.length; i += 25) { // 100 paramètres au plus par requête
    const lot = lignes.slice(i, i + 25);
    requetes.push(
      db.prepare(`INSERT INTO codes (code, membre, telephone, cree_le) VALUES ${lot.map(() => "(?, ?, ?, ?)").join(", ")}`)
        .bind(...lot.flat()),
    );
  }
  await db.batch(requetes);
}

// --- Limitation des essais ---------------------------------------------------

export async function essaisBloques(db: D1Database, ip: string): Promise<boolean> {
  const [, compte] = await db.batch<{ n: number }>([
    db.prepare("DELETE FROM tentatives WHERE moment < ?").bind(Date.now() - FENETRE_ESSAIS),
    db.prepare("SELECT COUNT(*) AS n FROM tentatives WHERE ip = ?").bind(ip),
  ]);
  return compte.results[0].n >= ESSAIS_MAX;
}

export function noterEchec(db: D1Database, ip: string) {
  return db.prepare("INSERT INTO tentatives (ip, moment) VALUES (?, ?)").bind(ip, Date.now()).run();
}

// --- Candidats, vote et résultats --------------------------------------------

export interface Candidat {
  id: number;
  poste: string;
  nom: string;
  detail: string;
  motivation: string;
  telephone: string;
  photo: string;
  statut: StatutCandidature;
  depose_le: string;
}
export type CandidatPublic = Pick<Candidat, "id" | "poste" | "nom" | "detail" | "photo">;

export interface Poste<T> {
  code: string;
  intitule: string;
  candidats: T[];
}

export function grouperParPoste<T extends { poste: string }>(lignes: T[], inclureVides = true): Poste<T>[] {
  return POSTES
    .map(([code, intitule]) => ({ code, intitule, candidats: lignes.filter((l) => l.poste === code) }))
    .filter((poste) => inclureVides || poste.candidats.length > 0);
}

/** Postes dans l'ordre officiel avec leurs candidats validés. */
export async function postesAvecCandidats(db: D1Database, inclureVides = false) {
  const { results } = await db
    .prepare("SELECT id, poste, nom, detail, photo FROM candidats WHERE statut = 'validee' ORDER BY nom COLLATE NOCASE")
    .all<CandidatPublic>();
  return grouperParPoste(results, inclureVides);
}

export async function nombreEnAttente(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM candidats WHERE statut = 'attente'").first<number>("n")) ?? 0;
}

export async function participation(db: D1Database) {
  const ligne = await db
    .prepare("SELECT COUNT(*) AS inscrits, COUNT(utilise_le) AS votants FROM codes")
    .first<{ inscrits: number; votants: number }>();
  const { inscrits, votants } = ligne ?? { inscrits: 0, votants: 0 };
  return { inscrits, votants, taux: inscrits ? Math.round((votants * 1000) / inscrits) / 10 : 0 };
}

/** Enregistre un bulletin si le code est encore valable et le vote ouvert : tout ou rien. */
export async function enregistrerVote(db: D1Database, code: string, choix: [string, number | null][]) {
  if (choix.length === 0) return false;
  // La marque aléatoire relie, le temps de la transaction, l'insertion des voix au
  // marquage du code ; elle est effacée aussitôt et n'est jamais copiée dans les voix.
  const marque = jeton();
  const bulletin = jeton();
  const [marquage] = await db.batch([
    db.prepare(
      `UPDATE codes SET utilise_le = ?, marque = ?
       WHERE code = ? AND utilise_le IS NULL
         AND (SELECT valeur FROM parametres WHERE cle = 'statut') = 'ouvert'`,
    ).bind(new Date().toISOString(), marque, code),
    db.prepare(
      `INSERT INTO voix (bulletin, poste, candidat_id)
       SELECT column1, column2, column3 FROM (VALUES ${choix.map(() => "(?, ?, ?)").join(", ")})
       WHERE EXISTS (SELECT 1 FROM codes WHERE code = ? AND marque = ?)`,
    ).bind(...choix.flatMap(([poste, candidat]) => [bulletin, poste, candidat]), code, marque),
    db.prepare("UPDATE codes SET marque = NULL WHERE code = ?").bind(code),
  ]);
  return marquage.meta.changes === 1;
}

export interface ResultatPoste {
  code: string;
  intitule: string;
  candidats: (CandidatPublic & { voix: number; pourcentage: number; elu: boolean })[];
  blancs: number;
  exprimes: number;
  egalite: boolean;
}

export async function resultats(db: D1Database): Promise<ResultatPoste[]> {
  const [scores, blancs] = await db.batch([
    db.prepare(
      `SELECT c.id, c.poste, c.nom, c.detail, c.photo, COUNT(v.bulletin) AS voix
       FROM candidats c LEFT JOIN voix v ON v.candidat_id = c.id AND v.poste = c.poste
       WHERE c.statut = 'validee' GROUP BY c.id ORDER BY voix DESC, c.nom COLLATE NOCASE`,
    ),
    db.prepare("SELECT poste, COUNT(*) AS n FROM voix WHERE candidat_id IS NULL GROUP BY poste"),
  ]);
  const blancsParPoste = Object.fromEntries(
    (blancs.results as { poste: string; n: number }[]).map((l) => [l.poste, l.n]),
  );
  const lignes = scores.results as (CandidatPublic & { voix: number })[];
  return grouperParPoste(lignes, false).map((poste) => {
    const exprimes = poste.candidats.reduce((total, c) => total + c.voix, 0);
    const meilleur = poste.candidats[0].voix;
    const enTete = poste.candidats.filter((c) => meilleur > 0 && c.voix === meilleur);
    return {
      code: poste.code,
      intitule: poste.intitule,
      blancs: blancsParPoste[poste.code] ?? 0,
      exprimes,
      egalite: enTete.length > 1,
      candidats: poste.candidats.map((c) => ({
        ...c,
        pourcentage: exprimes ? Math.round((c.voix * 1000) / exprimes) / 10 : 0,
        elu: enTete.length === 1 && c.id === enTete[0].id,
      })),
    };
  });
}
