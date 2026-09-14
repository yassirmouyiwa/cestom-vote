/** Site de vote CESTOM Tétouan : Worker Cloudflare et pages publiques. */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { admin } from "./admin";
import {
  INTITULES, candidaturesOuvertes, chargerParametres, dateLimiteTexte, enregistrerVote, essaisBloques,
  joursRestants, normaliserCode, normaliserTelephone, noterEchec, participation, postesAvecCandidats, resultats,
} from "./db";
import type { Candidat, CandidatPublic, Poste } from "./db";
import { commun, ipClient, ligne, rendre, texte } from "./outils";
import { FORMAT_NOM_PHOTO, PhotoInvalide, TAILLE_MAX_PHOTO, enregistrerPhoto } from "./photos";
import { egaliteConstante, message, sessions } from "./session";
import type { AppEnv } from "./types";
import {
  Accueil, Bulletin, CandidatureEnvoyee, FormulaireCandidature, Merci, PageCandidat, Recapitulatif, Resultats,
} from "./vues/publiques";

const MOTIVATION_MIN = 20;
const MOTIVATION_MAX = 1000;

const app = new Hono<AppEnv>({ strict: false });

app.use(sessions);
app.use(async (c, next) => {
  c.set("parametres", await chargerParametres(c.env.DB));
  await next();
});
app.use(bodyLimit({
  maxSize: 5 * 1024 * 1024,
  onError: (c) => {
    message(c, "Envoi trop lourd : 5 Mo maximum.", "erreur");
    return c.redirect(c.req.path, 303);
  },
}));
app.use(async (c, next) => {
  if (c.req.method === "POST") {
    const recu = texte(await c.req.parseBody(), "csrf");
    if (!egaliteConstante(recu, c.get("session").csrf)) {
      return c.text("Formulaire expiré : rechargez la page et réessayez.", 400);
    }
  }
  await next();
});

app.onError((erreur, c) => {
  console.error(erreur);
  return c.text("Une erreur est survenue. Réessayez dans un instant.", 500);
});
app.notFound((c) => c.text("Page introuvable.", 404));

// --- Accueil et candidatures -------------------------------------------------

app.get("/", async (c) => {
  const parametres = c.get("parametres");
  return rendre(c, (
    <Accueil commun={commun(c)} postes={await postesAvecCandidats(c.env.DB, true)}
      dateLimite={dateLimiteTexte(parametres)} joursRestants={joursRestants(parametres)} />
  ));
});

app.on(["GET", "POST"], "/candidature", async (c) => {
  const parametres = c.get("parametres");
  const parLeComite = Boolean(c.get("session").admin);
  // Le comité peut encore enregistrer une candidature après la date limite.
  const ouvertes = candidaturesOuvertes(parametres) || (parLeComite && parametres.statut === "preparation");
  let valeurs: Record<string, string> = {};

  if (c.req.method === "POST") {
    if (!ouvertes) {
      message(c, "Les candidatures sont closes.", "erreur");
      return c.redirect("/candidature", 303);
    }
    const corps = await c.req.parseBody();
    valeurs = Object.fromEntries(["poste", "nom", "detail", "telephone", "motivation"].map((cle) => [cle, texte(corps, cle)]));
    const donnees = {
      poste: valeurs.poste,
      nom: ligne(valeurs.nom, 80),
      detail: ligne(valeurs.detail, 120),
      telephone: normaliserTelephone(valeurs.telephone),
      motivation: valeurs.motivation.replace(/\r\n/g, "\n").trim().slice(0, MOTIVATION_MAX),
    };
    const photo = corps.photo;
    const erreurs: string[] = [];
    if (!Object.hasOwn(INTITULES, donnees.poste)) erreurs.push("Choisissez le poste visé.");
    if (donnees.nom.length < 3) erreurs.push("Indiquez votre nom complet.");
    if (donnees.telephone.length < 8) erreurs.push("Indiquez un numéro WhatsApp valide.");
    if (donnees.motivation.length < MOTIVATION_MIN) erreurs.push("Rédigez votre motivation en quelques phrases.");
    if (!(photo instanceof File) || photo.size === 0) erreurs.push("Ajoutez votre photo.");

    if (erreurs.length === 0) {
      const doublon = await c.env.DB
        .prepare("SELECT 1 FROM candidats WHERE telephone = ? AND statut != 'rejetee'")
        .bind(donnees.telephone).first();
      if (doublon) erreurs.push("Une candidature existe déjà avec ce numéro. Contactez le comité électoral pour la modifier.");
    }
    let nomPhoto = "";
    if (erreurs.length === 0) {
      try {
        nomPhoto = await enregistrerPhoto(c.env.PHOTOS, photo as File);
      } catch (erreur) {
        if (!(erreur instanceof PhotoInvalide)) throw erreur;
        erreurs.push(erreur.message);
      }
    }
    if (erreurs.length === 0) {
      await c.env.DB.prepare(
        `INSERT INTO candidats (poste, nom, detail, motivation, telephone, photo, statut, depose_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(donnees.poste, donnees.nom, donnees.detail, donnees.motivation, donnees.telephone, nomPhoto,
        parLeComite ? "validee" : "attente", new Date().toISOString()).run();
      if (parLeComite) {
        message(c, `Candidature de ${donnees.nom} enregistrée et validée.`, "succes");
        return c.redirect("/admin/candidats", 303);
      }
      return c.redirect("/candidature/envoyee", 303);
    }
    for (const erreur of erreurs) message(c, erreur, "erreur");
  }

  return rendre(c, (
    <FormulaireCandidature commun={commun(c)} ouvertes={ouvertes} parLeComite={parLeComite} valeurs={valeurs}
      dateLimite={dateLimiteTexte(parametres)} motivationMin={MOTIVATION_MIN} motivationMax={MOTIVATION_MAX}
      tailleMax={TAILLE_MAX_PHOTO} />
  ));
});

app.get("/candidature/envoyee", (c) => rendre(c, <CandidatureEnvoyee commun={commun(c)} />));

app.get("/candidats/:id{[0-9]+}", async (c) => {
  const candidat = await c.env.DB.prepare("SELECT * FROM candidats WHERE id = ?")
    .bind(Number(c.req.param("id"))).first<Candidat>();
  // Une candidature n'est publique qu'une fois validée par le comité.
  if (!candidat || !(candidat.statut === "validee" || c.get("session").admin)) return c.notFound();
  return rendre(c, <PageCandidat commun={commun(c)} candidat={candidat} intitule={INTITULES[candidat.poste]} />);
});

app.get("/photos/:nom", async (c) => {
  const nom = c.req.param("nom");
  if (!FORMAT_NOM_PHOTO.test(nom)) return c.notFound();
  const ligneCandidat = await c.env.DB.prepare("SELECT statut FROM candidats WHERE photo = ?")
    .bind(nom).first<{ statut: string }>();
  const publique = ligneCandidat?.statut === "validee";
  if (!ligneCandidat || !(publique || c.get("session").admin)) return c.notFound();
  const { value, metadata } = await c.env.PHOTOS.getWithMetadata<{ type: string }>(nom, "arrayBuffer");
  if (!value) return c.notFound();
  return c.body(value, 200, {
    "Content-Type": metadata?.type ?? "image/jpeg",
    "Cache-Control": publique ? "public, max-age=3600" : "private, no-store",
  });
});

// --- Vote ----------------------------------------------------------------------

/** Code de la session s'il permet encore de voter, sinon null. */
async function codeValide(c: Context<AppEnv>): Promise<string | null> {
  const code = c.get("session").code;
  if (!code || c.get("parametres").statut !== "ouvert") return null;
  const libre = await c.env.DB.prepare("SELECT 1 FROM codes WHERE code = ? AND utilise_le IS NULL").bind(code).first();
  return libre ? code : null;
}

/** [poste, id du candidat ou null pour un vote blanc] pour chaque poste, ou null si incomplet. */
function lireChoix(corps: Record<string, unknown>, postes: Poste<CandidatPublic>[]): [string, number | null][] | null {
  const choix: [string, number | null][] = [];
  for (const poste of postes) {
    const valeur = texte(corps, `poste_${poste.code}`);
    if (valeur === "blanc") {
      choix.push([poste.code, null]);
      continue;
    }
    const candidat = poste.candidats.find((cand) => String(cand.id) === valeur);
    if (!candidat) return null;
    choix.push([poste.code, candidat.id]);
  }
  return choix;
}

app.post("/code", async (c) => {
  const db = c.env.DB;
  if (c.get("parametres").statut !== "ouvert") {
    message(c, "Le vote n'est pas ouvert.", "erreur");
    return c.redirect("/", 303);
  }
  const ip = ipClient(c);
  if (await essaisBloques(db, ip)) {
    message(c, "Trop de codes incorrects. Réessayez dans 15 minutes.", "erreur");
    return c.redirect("/", 303);
  }
  const code = normaliserCode(texte(await c.req.parseBody(), "code"));
  const ligneCode = code
    ? await db.prepare("SELECT utilise_le FROM codes WHERE code = ?").bind(code).first<{ utilise_le: string | null }>()
    : null;
  if (!code || !ligneCode) {
    await noterEchec(db, ip);
    message(c, "Code inconnu. Vérifiez le code reçu (6 caractères, ex. : K7P-3XQ).", "erreur");
    return c.redirect("/", 303);
  }
  if (ligneCode.utilise_le) {
    message(c, "Ce code a déjà servi. Chaque code ne permet de voter qu'une fois.", "erreur");
    return c.redirect("/", 303);
  }
  c.get("session").code = code;
  return c.redirect("/bulletin", 303);
});

app.on(["GET", "POST"], "/bulletin", async (c) => {
  if (!(await codeValide(c))) {
    delete c.get("session").code;
    message(c, "Entrez votre code de vote pour accéder au bulletin.", "info");
    return c.redirect("/", 303);
  }
  const postes = await postesAvecCandidats(c.env.DB);
  const corps = c.req.method === "POST" ? await c.req.parseBody() : {};
  const saisie = Object.fromEntries(postes.map((p) => [p.code, texte(corps, `poste_${p.code}`)]));
  if (c.req.method === "POST" && !("modifier" in corps)) {
    const choix = lireChoix(corps, postes);
    if (!choix) {
      message(c, "Choisissez une option pour chaque poste.", "erreur");
    } else {
      const recap = postes.map((poste, i): [Poste<CandidatPublic>, CandidatPublic | undefined] =>
        [poste, poste.candidats.find((cand) => cand.id === choix[i][1])]);
      return rendre(c, <Recapitulatif commun={commun(c)} recap={recap} saisie={saisie} />);
    }
  }
  return rendre(c, <Bulletin commun={commun(c)} postes={postes} saisie={saisie} />);
});

app.post("/voter", async (c) => {
  const refuser = () => {
    delete c.get("session").code;
    message(c, "Vote refusé : le scrutin est clos ou ce code a déjà servi.", "erreur");
    return c.redirect("/", 303);
  };
  const code = await codeValide(c);
  if (!code) return refuser();
  const choix = lireChoix(await c.req.parseBody(), await postesAvecCandidats(c.env.DB));
  if (!choix) {
    message(c, "Bulletin incomplet : choisissez une option pour chaque poste.", "erreur");
    return c.redirect("/bulletin", 303);
  }
  if (!(await enregistrerVote(c.env.DB, code, choix))) return refuser();
  delete c.get("session").code;
  return c.redirect("/merci", 303);
});

app.get("/merci", (c) => rendre(c, <Merci commun={commun(c)} />));

app.get("/resultats", async (c) => {
  const publie = c.get("parametres").statut === "clos";
  const [postes, chiffres] = await Promise.all([publie ? resultats(c.env.DB) : [], participation(c.env.DB)]);
  return rendre(c, <Resultats commun={commun(c)} publie={publie} postes={postes} participation={chiffres} />);
});

app.route("/admin", admin);

export default app;
