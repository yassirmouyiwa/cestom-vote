import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { ESSAIS_MAX, candidaturesOuvertes, normaliserCode, normaliserTelephone, telephoneValide } from "../src/db";
import { dateEnFrancais, heureMaroc, instantMaroc } from "../src/heure";
import { pourcent } from "../src/vues/commun";

type Champ = string | number | [Blob, string];

/** Navigateur de test : garde le cookie de session et lit le jeton CSRF qu'il contient. */
class Client {
  cookie = "";

  async requete(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("Cookie", this.cookie);
    const reponse = await exports.default.fetch(
      new Request(new URL(url, "https://vote.test").href, { ...init, headers, redirect: "manual" }),
    );
    const cookie = reponse.headers.get("Set-Cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return reponse;
  }

  async page(url: string): Promise<string> {
    const reponse = await this.requete(url);
    expect(reponse.status, url).toBe(200);
    return reponse.text();
  }

  csrf(): string {
    const donnees = this.cookie.slice("session=".length).split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(donnees), (c) => c.charCodeAt(0)))).csrf;
  }

  async post(url: string, champs: Record<string, Champ> = {}): Promise<Response> {
    if (!this.cookie) await this.requete("/resultats");
    const formulaire = new FormData();
    formulaire.set("csrf", this.csrf());
    for (const [cle, valeur] of Object.entries(champs)) {
      if (Array.isArray(valeur)) formulaire.set(cle, valeur[0], valeur[1]);
      else formulaire.set(cle, String(valeur));
    }
    return this.requete(url, { method: "POST", body: formulaire });
  }
}

const photoTest = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(7)])], { type: "image/jpeg" });

async function sql<T = Record<string, any>>(requete: string, ...params: unknown[]): Promise<T[]> {
  return (await env.DB.prepare(requete).bind(...params).all<T>()).results;
}
const statut = async () => (await sql<{ valeur: string }>("SELECT valeur FROM parametres WHERE cle = 'statut'"))[0].valeur;
const bulletins = async () => (await sql<{ n: number }>("SELECT COUNT(DISTINCT bulletin) AS n FROM voix"))[0].n;
const compter = async (table: string, condition = "") =>
  (await sql<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${condition}`))[0].n;
const definirDateLimite = (valeur: string) =>
  env.DB.prepare("UPDATE parametres SET valeur = ? WHERE cle = 'date_limite'").bind(valeur).run();
const photosStockees = async () => (await env.PHOTOS.list()).keys.length;

let votant: Client;
let comite: Client;

beforeEach(async () => {
  for (const table of ["parametres", "candidats", "codes", "voix", "tentatives"]) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
  }
  for (const { name } of (await env.PHOTOS.list()).keys) await env.PHOTOS.delete(name);
  await new Client().requete("/resultats"); // recrée les tables
  await definirDateLimite("2099-12-31T23:59");
  votant = new Client();
  comite = new Client();
});

async function connecterComite() {
  const reponse = await comite.post("/admin/connexion", { mot_de_passe: "secret" });
  expect(reponse.headers.get("Location")).toBe("/admin");
}

function deposer(client: Client, poste: string, nom: string, telephone: string, autres: Record<string, Champ> = {}) {
  return client.post("/candidature", {
    poste, nom, telephone,
    motivation: "Je souhaite servir la communauté avec rigueur et énergie.",
    photo: [photoTest(), "photo.jpg"],
    ...autres,
  });
}

const valider = (id: number, nouveauStatut = "validee") =>
  comite.post(`/admin/candidats/${id}/statut`, { statut: nouveauStatut });

async function preparer() {
  const depots: [string, string][] = [["SG", "Candidat Un"], ["SG", "Candidate Deux"], ["CC", "Candidat Trois"]];
  for (const [i, [poste, nom]] of depots.entries()) {
    const reponse = await deposer(votant, poste, nom, `060000000${i}`);
    expect(reponse.headers.get("Location")).toBe("/candidature/envoyee");
  }
  await connecterComite();
  for (const { id } of await sql<{ id: number }>("SELECT id FROM candidats")) await valider(id);
  await comite.post("/admin/codes/generer", { membres: "Ama ; 06 12 34 56 78\nKofi\nEdem" });
  await comite.post("/admin/statut", { action: "ouvrir" });
  expect(await statut()).toBe("ouvert");
  const codes = (await sql<{ code: string }>("SELECT code FROM codes ORDER BY membre")).map((l) => l.code);
  const ids = Object.fromEntries((await sql<{ nom: string; id: number }>("SELECT nom, id FROM candidats")).map((l) => [l.nom, l.id]));
  return { codes, ids };
}

async function voter(code: string, choix: Record<string, Champ>, client = votant) {
  expect((await client.post("/code", { code })).headers.get("Location")).toBe("/bulletin");
  expect(await (await client.post("/bulletin", choix)).text()).toContain("Vérifiez votre vote");
  return client.post("/voter", choix);
}

/** Inscrit un membre et renvoie le code affiché sur la page de confirmation. */
async function inscrire(client: Client, nom: string, telephone: string): Promise<string> {
  expect((await client.post("/inscription", { nom, telephone })).headers.get("Location")).toBe("/inscription/confirmee");
  return /class="code-affiche">([A-Z0-9]{3}-[A-Z0-9]{3})</.exec(await client.page("/inscription/confirmee"))![1];
}

describe("vote", () => {
  it("parcours complet : candidatures, codes, vote, résultats", async () => {
    const { codes, ids } = await preparer();
    for (const url of ["/", "/resultats", "/admin", "/admin/candidats", "/admin/codes"]) await comite.page(url);
    expect(await comite.page("/admin/codes")).toContain("wa.me/212612345678?text=");
    expect(await votant.page("/")).toContain('src="/photos/');

    const reponse = await voter(codes[0], { poste_SG: ids["Candidat Un"], poste_CC: ids["Candidat Trois"] });
    expect(reponse.headers.get("Location")).toBe("/merci");
    await voter(codes[1], { poste_SG: ids["Candidat Un"], poste_CC: "blanc" });
    await voter(codes[2], { poste_SG: ids["Candidate Deux"], poste_CC: ids["Candidat Trois"] });
    expect(await bulletins()).toBe(3);

    // Résultats secrets tant que le vote est ouvert, même pour le comité.
    expect(await votant.page("/resultats")).not.toContain("voix");
    expect(await comite.page("/admin")).not.toContain("voix ·");

    await comite.post("/admin/statut", { action: "cloturer" });
    const resultats = await votant.page("/resultats");
    expect(resultats).toMatch(/Candidat Un.*Élu\(e\).*2 voix · 66,7 %/s);
    expect(resultats).toContain("1 voix · 33,3 %");
    expect(resultats).toContain("1 vote(s) blanc(s)");
    expect(resultats).toContain("100 %");
    for (const url of ["/", "/admin", "/admin/candidats", "/admin/codes"]) await comite.page(url);
  });

  it("un code ne sert qu'une fois, même en renvoyant le bulletin", async () => {
    const { codes, ids } = await preparer();
    const choix = { poste_SG: ids["Candidat Un"], poste_CC: "blanc" };
    await voter(codes[0], choix);
    await votant.post("/code", { code: codes[0] });
    expect(await votant.page("/")).toContain("déjà servi");

    // Rejouer l'envoi final avec l'ancien cookie de session (qui contenait le code).
    const autre = new Client();
    await autre.post("/code", { code: codes[1] });
    const cookieAvecCode = autre.cookie;
    await autre.post("/voter", choix);
    autre.cookie = cookieAvecCode;
    await autre.post("/voter", choix);
    expect(await bulletins()).toBe(2);
  });

  it("les bulletins ne gardent aucun lien avec les codes", async () => {
    const colonnes = (await sql<{ name: string }>("PRAGMA table_info(voix)")).map((l) => l.name).sort();
    expect(colonnes).toEqual(["bulletin", "candidat_id", "poste"]);
  });

  it("refuse un choix invalide ou incomplet", async () => {
    const { codes, ids } = await preparer();
    await votant.post("/code", { code: codes[0] });
    await votant.post("/voter", { poste_SG: ids["Candidat Trois"], poste_CC: "blanc" });
    await votant.post("/voter", { poste_SG: ids["Candidat Un"] });
    expect(await bulletins()).toBe(0);
    expect(await compter("codes", "WHERE utilise_le IS NOT NULL")).toBe(0);
  });

  it("refuse le vote après la clôture", async () => {
    const { codes, ids } = await preparer();
    await votant.post("/code", { code: codes[0] });
    await comite.post("/admin/statut", { action: "cloturer" });
    await votant.post("/voter", { poste_SG: ids["Candidat Un"], poste_CC: "blanc" });
    expect(await bulletins()).toBe(0);
  });

  it("bloque après trop de codes incorrects", async () => {
    const { codes } = await preparer();
    for (let i = 0; i < ESSAIS_MAX; i++) await votant.post("/code", { code: "AAA-AAA" });
    const reponse = await votant.post("/code", { code: codes[0] });
    expect(reponse.headers.get("Location")).toBe("/");
    expect(await votant.page("/")).toContain("Trop de codes incorrects");
  });

  it("exige le jeton CSRF", async () => {
    await votant.requete("/resultats");
    const formulaire = new FormData();
    formulaire.set("code", "AAA-AAA");
    expect((await votant.requete("/code", { method: "POST", body: formulaire })).status).toBe(400);
  });
});

describe("membres", () => {
  it("un membre inscrit ne vote qu'après validation de son code par le comité", async () => {
    const { ids } = await preparer();
    const membre = new Client();
    const code = await inscrire(membre, "Afi", "06 11 22 33 44");
    expect(await sql("SELECT membre, telephone, statut FROM codes WHERE code = ?", code))
      .toEqual([{ membre: "Afi", telephone: "212611223344", statut: "attente" }]);

    await membre.post("/code", { code });
    expect(await membre.page("/")).toContain("pas encore été validée");

    const validation = await comite.post(`/admin/codes/${code}/statut`, { statut: "valide", retour: "/admin/codes?filtre=attente" });
    expect(validation.headers.get("Location")).toBe("/admin/codes?filtre=attente");
    await voter(code, { poste_SG: ids["Candidat Un"], poste_CC: "blanc" }, membre);
    expect(await bulletins()).toBe(1);
  });

  it("affiche le code avec un lien WhatsApp, pour ce navigateur seulement", async () => {
    const membre = new Client();
    await membre.post("/inscription", { nom: "Kossi", telephone: "+228 90 12 34 56" });
    const page = await membre.page("/inscription/confirmee");
    expect(page).toContain("wa.me/22890123456?text=");
    expect((await new Client().requete("/inscription/confirmee")).headers.get("Location")).toBe("/inscription");
  });

  it("n'inscrit un numéro qu'une fois, sans révéler le code existant", async () => {
    const code = await inscrire(new Client(), "Kodjo", "0611223344");
    const autre = new Client();
    const reponse = await autre.post("/inscription", { nom: "Imposteur", telephone: "+212 6 11 22 33 44" });
    const html = await reponse.text();
    expect(html).toContain("déjà inscrit");
    expect(html).not.toContain(code);
    expect(await compter("codes")).toBe(1);

    // Une inscription rejetée libère le numéro.
    await connecterComite();
    await comite.post(`/admin/codes/${code}/statut`, { statut: "rejete" });
    await inscrire(autre, "Kodjo", "0611223344");
    expect(await compter("codes", "WHERE statut = 'attente'")).toBe(1);
  });

  it("refuse un numéro sans indicatif ou un nom vide", async () => {
    const reponse = await votant.post("/inscription", { nom: "Yao", telephone: "90 12 34 56" });
    expect(await reponse.text()).toContain("indicatif");
    await votant.post("/inscription", { nom: " ", telephone: "0611223344" });
    expect(await compter("codes")).toBe(0);
  });

  it("ferme les inscriptions une fois le vote clôturé", async () => {
    await preparer();
    await comite.post("/admin/statut", { action: "cloturer" });
    await votant.post("/inscription", { nom: "Retardataire", telephone: "0611223344" });
    expect(await compter("codes", "WHERE membre = 'Retardataire'")).toBe(0);
  });

  it("code perdu : le comité remplace le code, l'ancien ne fonctionne plus", async () => {
    const { codes, ids } = await preparer();
    const ancien = codes[0];
    const reponse = await comite.post(`/admin/codes/${ancien}/nouveau`, { retour: "/admin/codes" });
    const location = reponse.headers.get("Location")!;
    const nouveau = decodeURIComponent(location.split("q=")[1]);
    expect(nouveau).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(nouveau).not.toBe(ancien);
    expect(await comite.page(location)).toContain(nouveau);

    await votant.post("/code", { code: ancien });
    expect(await votant.page("/")).toContain("Code inconnu");
    await voter(nouveau, { poste_SG: ids["Candidat Un"], poste_CC: "blanc" });
    expect(await bulletins()).toBe(1);

    await comite.post(`/admin/codes/${nouveau}/nouveau`);
    expect(await comite.page("/admin/codes")).toContain("déjà servi");
  });

  it("recherche et filtre les membres", async () => {
    await connecterComite();
    await inscrire(new Client(), "Essi Mensah", "+228 90 12 34 56");
    await comite.post("/admin/codes/generer", { membres: "Kofi ; 0677889900" });

    const parNom = await comite.page("/admin/codes?q=essi");
    expect(parNom).toContain("Essi Mensah");
    expect(parNom).not.toContain("Kofi");
    const parNumero = await comite.page("/admin/codes?q=90 12 34");
    expect(parNumero).toContain("Essi Mensah");
    expect(parNumero).not.toContain("Kofi");
    const aValider = await comite.page("/admin/codes?filtre=attente");
    expect(aValider).toContain("Essi Mensah");
    expect(aValider).not.toContain("Kofi");
  });

  it("affiche le WhatsApp du comité sur la page Code perdu", async () => {
    await connecterComite();
    await comite.post("/admin/parametres", { titre: "Élections", date_limite: "2099-12-31T23:59", whatsapp_comite: "06 55 44 33 22" });
    expect(await votant.page("/code-perdu")).toContain("wa.me/212655443322?text=");
  });

  it("met à jour une base créée par la version précédente du site", async () => {
    for (const table of ["parametres", "codes"]) await env.DB.prepare(`DROP TABLE ${table}`).run();
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)"),
      env.DB.prepare("INSERT INTO parametres (cle, valeur) VALUES ('statut', 'preparation'), ('date_limite', '2099-12-31T23:59')"),
      env.DB.prepare(`CREATE TABLE codes (code TEXT PRIMARY KEY, membre TEXT NOT NULL DEFAULT '', telephone TEXT NOT NULL DEFAULT '',
        cree_le TEXT NOT NULL, utilise_le TEXT, marque TEXT)`),
      env.DB.prepare("INSERT INTO codes (code, membre, cree_le) VALUES ('ABC-DEF', 'Ancien', '2026-09-14')"),
    ]);
    await votant.page("/");
    expect(await sql("SELECT statut FROM codes WHERE code = 'ABC-DEF'")).toEqual([{ statut: "valide" }]);
    expect(await sql("SELECT valeur FROM parametres WHERE cle = 'version_schema'")).toEqual([{ valeur: "2" }]);
  });
});

describe("comité", () => {
  it("protège l'espace du comité", async () => {
    expect((await comite.requete("/admin")).headers.get("Location")).toBe("/admin/connexion");
    const reponse = await comite.post("/admin/connexion", { mot_de_passe: "mauvais" });
    expect(await reponse.text()).toContain("Mot de passe incorrect");
    await comite.post("/admin/statut", { action: "ouvrir" });
    expect(await statut()).toBe("preparation");
  });

  it("n'ouvre le vote qu'avec des candidatures traitées et des membres validés", async () => {
    await deposer(votant, "SG", "Candidat Un", "0600000001");
    await connecterComite();
    await comite.post("/admin/statut", { action: "ouvrir" }); // candidature en attente
    expect(await statut()).toBe("preparation");
    const [{ id }] = await sql<{ id: number }>("SELECT id FROM candidats");
    await valider(id);
    await inscrire(new Client(), "Membre", "0611223344");
    await comite.post("/admin/statut", { action: "ouvrir" }); // aucun membre validé
    expect(await statut()).toBe("preparation");
    await comite.post("/admin/codes/generer", { nombre: 3 });
    await comite.post("/admin/statut", { action: "ouvrir" });
    expect(await statut()).toBe("ouvert");
  });

  it("exporte les membres en CSV lisible par Excel", async () => {
    await preparer();
    const reponse = await comite.requete("/admin/codes.csv");
    const octets = new Uint8Array(await reponse.arrayBuffer());
    expect([...octets.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const contenu = new TextDecoder().decode(octets);
    expect(contenu).toContain("Code;Membre;Téléphone;Statut;A voté");
    expect(contenu).toContain(";Ama;212612345678;valide;non");
  });

  it("réinitialise l'élection, photos comprises", async () => {
    const { codes, ids } = await preparer();
    await voter(codes[0], { poste_SG: ids["Candidat Un"], poste_CC: "blanc" });
    await comite.post("/admin/statut", { action: "cloturer" });
    await comite.post("/admin/reinitialiser", { confirmation: "non" });
    expect(await bulletins()).toBe(1);
    expect(await photosStockees()).toBe(3);
    await comite.post("/admin/reinitialiser", { confirmation: "REINITIALISER" });
    expect(await bulletins()).toBe(0);
    expect(await compter("codes")).toBe(0);
    expect(await compter("candidats")).toBe(0);
    expect(await photosStockees()).toBe(0);
    expect(await statut()).toBe("preparation");
  });
});

describe("candidatures", () => {
  it("affiche une candidature dès sa validation, pas avant", async () => {
    await deposer(votant, "SG", "Candidat Validé", "0600000001", {
      motivation: "Premier paragraphe.\r\n\r\nSecond paragraphe de ma motivation.",
    });
    await deposer(votant, "SG", "Candidat En Attente", "0600000002");
    await connecterComite();
    const [valide, attente] = await sql<{ id: number; photo: string }>("SELECT id, photo FROM candidats ORDER BY id");

    expect(await votant.page("/")).not.toContain("Candidat Validé");
    expect((await votant.requete(`/candidats/${valide.id}`)).status).toBe(404);
    expect((await votant.requete(`/photos/${valide.photo}`)).status).toBe(404);
    expect(await comite.page(`/candidats/${valide.id}`)).toContain("Aperçu réservé au comité");
    expect((await comite.requete(`/photos/${valide.photo}`)).status).toBe(200);

    await valider(valide.id);
    expect(await statut()).toBe("preparation");
    const accueil = await votant.page("/");
    expect(accueil).toContain("Candidat Validé");
    expect(accueil).not.toContain("Candidat En Attente");
    expect(await votant.page(`/candidats/${valide.id}`)).toContain("Premier paragraphe.\n\nSecond paragraphe de ma motivation.");
    const photo = await votant.requete(`/photos/${valide.photo}`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("Content-Type")).toBe("image/jpeg");
    expect((await votant.requete(`/candidats/${attente.id}`)).status).toBe(404);
    expect((await votant.requete(`/photos/${attente.photo}`)).status).toBe(404);
  });

  it("ferme le formulaire après la date limite, sauf pour le comité", async () => {
    await definirDateLimite("2020-01-01T00:00");
    expect(await votant.page("/candidature")).toContain("Les candidatures sont closes");
    await deposer(votant, "SG", "Trop Tard", "0600000001");
    expect(await compter("candidats")).toBe(0);

    await connecterComite();
    await deposer(comite, "SG", "Ajout du Comité", "0600000002");
    expect(await sql("SELECT nom, statut FROM candidats")).toEqual([{ nom: "Ajout du Comité", statut: "validee" }]);

    await comite.post("/admin/parametres", { titre: "Élections 2099", date_limite: "2099-01-01T12:00" });
    expect(await votant.page("/candidature")).toContain("1 janvier 2099 à 12h00");
  });

  it("refuse les candidatures invalides et les doublons", async () => {
    await deposer(votant, "SG", "Candidat Un", "0600000001", { photo: [new Blob(["pas une image"]), "photo.jpg"] });
    await deposer(votant, "SG", "Candidat Un", "0600000001", { motivation: "Trop court" });
    await deposer(votant, "SG", "Candidat Un", "90123456");
    await deposer(votant, "XX", "Candidat Un", "0600000001");
    expect(await compter("candidats")).toBe(0);
    expect(await photosStockees()).toBe(0);

    await deposer(votant, "SG", "Candidat Un", "06 00 00 00 01");
    const reponse = await deposer(votant, "CC", "Candidat Un", "0600000001");
    expect(await reponse.text()).toContain("existe déjà");
    expect(await compter("candidats")).toBe(1);
  });

  it("fige les candidatures une fois le vote ouvert", async () => {
    const { ids } = await preparer();
    await deposer(votant, "TG", "Retardataire", "0600000009");
    await valider(ids["Candidat Un"], "rejetee");
    await comite.post(`/admin/candidats/${ids["Candidat Un"]}/supprimer`);
    expect(await compter("candidats", "WHERE statut = 'validee'")).toBe(3);
  });

  it("supprime la photo avec la candidature", async () => {
    await deposer(votant, "SG", "Candidat Un", "0600000001");
    const [{ id, photo }] = await sql<{ id: number; photo: string }>("SELECT id, photo FROM candidats");
    expect(await env.PHOTOS.get(photo)).not.toBeNull();
    await connecterComite();
    await comite.post(`/admin/candidats/${id}/supprimer`);
    expect(await env.PHOTOS.get(photo)).toBeNull();
  });
});

describe("formats et heure du Maroc", () => {
  it("normalise codes, téléphones et pourcentages", () => {
    expect(normaliserCode(" k7p 3xq ")).toBe("K7P-3XQ");
    expect(normaliserCode("K7P-3X")).toBeNull();
    expect(normaliserTelephone("06 12 34 56 78")).toBe("212612345678");
    expect(normaliserTelephone("+228 90 12 34 56")).toBe("22890123456");
    expect(telephoneValide(normaliserTelephone("06 12 34 56 78"))).toBe(true);
    expect(telephoneValide(normaliserTelephone("90 12 34 56"))).toBe(false);
    expect(pourcent(50)).toBe("50 %");
    expect(pourcent(33.3)).toBe("33,3 %");
    expect(pourcent(0)).toBe("0 %");
  });

  it("applique le passage du Maroc à l'heure GMT le 20/09/2026", () => {
    const limite = instantMaroc("2026-09-20T23:59")!;
    expect(new Date(limite).toISOString()).toBe("2026-09-20T23:59:00.000Z");
    expect(new Date(instantMaroc("2026-09-19T12:00")!).toISOString()).toBe("2026-09-19T11:00:00.000Z");
    expect(dateEnFrancais(heureMaroc(limite))).toBe("dimanche 20 septembre 2026 à 23h59");
    expect(instantMaroc("2026-02-30T10:00")).toBeNull();

    const parametres = { titre: "", statut: "preparation" as const, date_limite: "2026-09-20T23:59", whatsapp_comite: "" };
    expect(candidaturesOuvertes(parametres, Date.UTC(2026, 8, 20, 23, 59, 30))).toBe(true);
    expect(candidaturesOuvertes(parametres, Date.UTC(2026, 8, 21, 0, 0, 0))).toBe(false);
  });
});
