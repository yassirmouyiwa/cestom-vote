/** Espace du comité électoral. */
import { Hono, type Context } from "hono";
import {
  POSTES, STATUTS_CANDIDATURE, creerCodes, dateLimiteTexte, definirParametre, essaisBloques, grouperParPoste,
  nombreEnAttente, normaliserTelephone, noterEchec, participation, postesAvecCandidats,
} from "./db";
import type { Candidat, Statut, StatutCandidature } from "./db";
import { dateCourte, dateEnFrancais, heureMaroc, instantMaroc } from "./heure";
import { commun, ipClient, ligne, rendre, texte } from "./outils";
import { egaliteConstante, jeton, message } from "./session";
import type { AppEnv } from "./types";
import { Candidatures, Codes, Connexion, Tableau, type CandidatureAdmin } from "./vues/admin";

export const admin = new Hono<AppEnv>({ strict: false });

const TRANSITIONS: Record<string, [Statut, Statut, string]> = {
  ouvrir: ["preparation", "ouvert", "Le vote est ouvert : les membres peuvent voter avec leur code."],
  cloturer: ["ouvert", "clos", "Le vote est clôturé : les résultats sont publiés."],
  rouvrir: ["clos", "ouvert", "Le vote est rouvert : les résultats sont de nouveau masqués."],
};

const PAGES_LIBRES = ["/admin/connexion", "/admin/deconnexion"];
const MAX_CODES = 500;

admin.use(async (c, next) => {
  if (!c.get("session").admin && !PAGES_LIBRES.includes(c.req.path)) {
    return c.redirect("/admin/connexion", 303);
  }
  await next();
});

admin.on(["GET", "POST"], "/connexion", async (c) => {
  const motDePasse = c.env.ADMIN_PASSWORD ?? "";
  if (c.req.method === "POST" && motDePasse) {
    const ip = ipClient(c);
    const saisi = texte(await c.req.parseBody(), "mot_de_passe");
    if (await essaisBloques(c.env.DB, ip)) {
      message(c, "Trop d'essais. Réessayez dans 15 minutes.", "erreur");
    } else if (egaliteConstante(saisi, motDePasse)) {
      c.set("session", { csrf: jeton(), admin: true });
      return c.redirect("/admin", 303);
    } else {
      await noterEchec(c.env.DB, ip);
      message(c, "Mot de passe incorrect.", "erreur");
    }
  }
  return rendre(c, <Connexion commun={commun(c)} configure={Boolean(motDePasse)} />);
});

admin.post("/deconnexion", (c) => {
  c.set("session", { csrf: jeton() });
  return c.redirect("/", 303);
});

admin.get("/", async (c) => {
  const db = c.env.DB;
  const parametres = c.get("parametres");
  const [postes, chiffres, enAttente] = await Promise.all([postesAvecCandidats(db), participation(db), nombreEnAttente(db)]);
  const pourvus = new Set(postes.map((p) => p.code));
  return rendre(c, (
    <Tableau commun={commun(c)} participation={chiffres} candidatsValides={postes.length > 0}
      postesVides={POSTES.filter(([code]) => !pourvus.has(code)).map(([, intitule]) => intitule)}
      enAttente={enAttente} dateLimite={parametres.date_limite} dateLimiteTexte={dateLimiteTexte(parametres)}
      heureMaroc={dateEnFrancais(heureMaroc(Date.now()))} />
  ));
});

admin.post("/parametres", async (c) => {
  const db = c.env.DB;
  const corps = await c.req.parseBody();
  const titre = ligne(texte(corps, "titre"), 120);
  const limite = texte(corps, "date_limite").slice(0, 16); // « AAAA-MM-JJTHH:MM »
  if (!titre || instantMaroc(limite) === null) {
    message(c, "Indiquez un titre et une date limite valides.", "erreur");
  } else {
    await db.batch([definirParametre(db, "titre", titre), definirParametre(db, "date_limite", limite)]);
    message(c, "Paramètres enregistrés.", "succes");
  }
  return c.redirect("/admin", 303);
});

admin.post("/statut", async (c) => {
  const db = c.env.DB;
  const action = texte(await c.req.parseBody(), "action");
  const transition = Object.hasOwn(TRANSITIONS, action) ? TRANSITIONS[action] : null;
  if (!transition || c.get("parametres").statut !== transition[0]) {
    message(c, "Action impossible dans l'état actuel du vote.", "erreur");
  } else if (transition[1] === "ouvert" && (await nombreEnAttente(db)) > 0) {
    message(c, "Validez ou rejetez les candidatures en attente avant d'ouvrir le vote.", "erreur");
  } else if (transition[1] === "ouvert" && (await postesAvecCandidats(db)).length === 0) {
    message(c, "Validez au moins une candidature avant d'ouvrir le vote.", "erreur");
  } else if (transition[1] === "ouvert" && (await participation(db)).inscrits === 0) {
    message(c, "Générez les codes de vote avant d'ouvrir le vote.", "erreur");
  } else {
    await definirParametre(db, "statut", transition[1]).run();
    message(c, transition[2], "succes");
  }
  return c.redirect("/admin", 303);
});

admin.post("/reinitialiser", async (c) => {
  const db = c.env.DB;
  if (c.get("parametres").statut === "ouvert") {
    message(c, "Clôturez le vote avant de réinitialiser.", "erreur");
  } else if (texte(await c.req.parseBody(), "confirmation").trim().toUpperCase() !== "REINITIALISER") {
    message(c, "Tapez REINITIALISER pour confirmer.", "erreur");
  } else {
    const { results } = await db.prepare("SELECT photo FROM candidats WHERE photo != ''").all<{ photo: string }>();
    await db.batch([
      db.prepare("DELETE FROM voix"),
      db.prepare("DELETE FROM codes"),
      db.prepare("DELETE FROM candidats"),
      definirParametre(db, "statut", "preparation"),
    ]);
    await Promise.all(results.map((l) => c.env.PHOTOS.delete(l.photo)));
    message(c, "Élection réinitialisée : pensez à mettre à jour le titre et la date limite.", "succes");
  }
  return c.redirect("/admin", 303);
});

// --- Candidatures ------------------------------------------------------------

function candidaturesModifiables(c: Context<AppEnv>): boolean {
  if (c.get("parametres").statut === "preparation") return true;
  message(c, "Les candidatures sont figées une fois le vote ouvert.", "erreur");
  return false;
}

admin.get("/candidats", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT * FROM candidats ORDER BY statut = 'rejetee', depose_le")
    .all<Candidat>();
  const candidatures: CandidatureAdmin[] = results.map((l) => ({
    ...l,
    depose: l.depose_le ? dateCourte(heureMaroc(Date.parse(l.depose_le))) : "",
  }));
  const compte: Record<StatutCandidature, number> = { attente: 0, validee: 0, rejetee: 0 };
  for (const candidature of candidatures) compte[candidature.statut] += 1;
  return rendre(c, (
    <Candidatures commun={commun(c)} postes={grouperParPoste(candidatures)} compte={compte}
      dateLimite={dateLimiteTexte(c.get("parametres"))} />
  ));
});

admin.post("/candidats/:id{[0-9]+}/statut", async (c) => {
  const id = Number(c.req.param("id"));
  const statut = texte(await c.req.parseBody(), "statut");
  if (candidaturesModifiables(c) && Object.hasOwn(STATUTS_CANDIDATURE, statut)) {
    await c.env.DB.prepare("UPDATE candidats SET statut = ? WHERE id = ?").bind(statut, id).run();
    message(c, `Candidature marquée « ${STATUTS_CANDIDATURE[statut as StatutCandidature]} ».`, "succes");
  }
  return c.redirect(`/admin/candidats#candidature-${id}`, 303);
});

admin.post("/candidats/:id{[0-9]+}/supprimer", async (c) => {
  if (candidaturesModifiables(c)) {
    const supprimee = await c.env.DB.prepare("DELETE FROM candidats WHERE id = ? RETURNING photo")
      .bind(Number(c.req.param("id"))).first<{ photo: string }>();
    if (supprimee) {
      if (supprimee.photo) await c.env.PHOTOS.delete(supprimee.photo);
      message(c, "Candidature supprimée.", "succes");
    }
  }
  return c.redirect("/admin/candidats", 303);
});

// --- Codes de vote -----------------------------------------------------------

type LigneCode = { code: string; membre: string; telephone: string; utilise_le: string | null };

const REQUETE_CODES = "SELECT code, membre, telephone, utilise_le FROM codes";
const ORDRE_CODES = "ORDER BY membre = '', membre COLLATE NOCASE, cree_le";

function lienWhatsapp(ligneCode: LigneCode, titre: string, lien: string): string {
  const bonjour = ligneCode.membre ? `Bonjour ${ligneCode.membre} 👋` : "Bonjour 👋";
  const texteMessage = `${bonjour}\n\nVoici ton code personnel pour voter (${titre}) : *${ligneCode.code}*\n\n`
    + `Vote ici : ${lien}\n\nCe code est secret et ne sert qu'une seule fois. Ton vote reste anonyme.`;
  return `https://wa.me/${ligneCode.telephone}?text=${encodeURIComponent(texteMessage)}`;
}

admin.get("/codes", async (c) => {
  const filtre = c.req.query("filtre") ?? "tous";
  const condition = filtre === "attente" ? "WHERE utilise_le IS NULL"
    : filtre === "votes" ? "WHERE utilise_le IS NOT NULL" : "";
  const [{ results }, chiffres] = await Promise.all([
    c.env.DB.prepare(`${REQUETE_CODES} ${condition} ${ORDRE_CODES}`).all<LigneCode>(),
    participation(c.env.DB),
  ]);
  const titre = c.get("parametres").titre;
  const lien = new URL("/", c.req.url).href;
  return rendre(c, (
    <Codes commun={commun(c)} filtre={filtre} participation={chiffres}
      codes={results.map((l) => ({ ...l, whatsapp: lienWhatsapp(l, titre, lien) }))} />
  ));
});

admin.post("/codes/generer", async (c) => {
  if (c.get("parametres").statut === "clos") {
    message(c, "Le vote est clôturé : impossible de créer des codes.", "erreur");
    return c.redirect("/admin/codes", 303);
  }
  const corps = await c.req.parseBody();
  const membres: [string, string][] = [];
  // Une ligne par membre : « Nom » ou « Nom ; téléphone ».
  for (const brute of texte(corps, "membres").split(/\r?\n/)) {
    const separateur = brute.search(/[;,\t]/);
    const nom = ligne(separateur < 0 ? brute : brute.slice(0, separateur), 80);
    if (nom) membres.push([nom, normaliserTelephone(separateur < 0 ? "" : brute.slice(separateur + 1))]);
  }
  const anonymes = Math.min(Math.max(Math.trunc(Number(texte(corps, "nombre")) || 0), 0), MAX_CODES);
  const tous = [...membres, ...Array.from({ length: anonymes }, (): [string, string] => ["", ""])].slice(0, MAX_CODES);
  if (tous.length === 0) {
    message(c, "Indiquez des noms de membres ou un nombre de codes.", "erreur");
  } else {
    try {
      await creerCodes(c.env.DB, tous);
      message(c, `${tous.length} code(s) créé(s).`, "succes");
    } catch (erreur) {
      console.error(erreur);
      message(c, "La création des codes a échoué : réessayez.", "erreur");
    }
  }
  return c.redirect("/admin/codes", 303);
});

admin.post("/codes/:code{[A-Z0-9-]+}/supprimer", async (c) => {
  const code = c.req.param("code");
  const { meta } = await c.env.DB.prepare("DELETE FROM codes WHERE code = ? AND utilise_le IS NULL").bind(code).run();
  if (meta.changes) {
    message(c, `Code ${code} supprimé.`, "succes");
  } else {
    message(c, "Ce code a déjà servi : il ne peut pas être supprimé.", "erreur");
  }
  return c.redirect("/admin/codes", 303);
});

admin.get("/codes.csv", async (c) => {
  const { results } = await c.env.DB.prepare(`${REQUETE_CODES} ${ORDRE_CODES}`).all<LigneCode>();
  const cellule = (valeur: string) => (/[;"\r\n]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur);
  const lignes = [
    ["Code", "Membre", "Téléphone", "A voté"],
    ...results.map((l) => [l.code, l.membre, l.telephone, l.utilise_le ? "oui" : "non"]),
  ];
  const csv = "\ufeff" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n"; // BOM : accents corrects dans Excel
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=codes-vote.csv",
  });
});
