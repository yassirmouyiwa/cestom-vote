/** Mise en page commune et cadres photo aux couleurs du Togo. */
import type { Child, FC } from "hono/jsx";
import type { Statut } from "../db";
import type { Categorie } from "../session";

export interface Commun {
  titre: string;
  statut: Statut;
  libelleStatut: string;
  candidaturesOuvertes: boolean;
  csrf: string;
  adminConnecte: boolean;
  messages: [Categorie, string][];
}

export function initiales(nom: string): string {
  return nom.replace(/-/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((mot) => mot[0]).join("").toUpperCase() || "?";
}

/** 50 -> « 50 % », 33.3 -> « 33,3 % » */
export function pourcent(valeur: number): string {
  const texte = valeur.toFixed(1);
  return `${(texte.endsWith(".0") ? texte.slice(0, -2) : texte).replace(".", ",")} %`;
}

export const ChampCsrf: FC<{ commun: Commun }> = ({ commun }) => (
  <input type="hidden" name="csrf" value={commun.csrf} />
);

export const Page: FC<{ commun: Commun; titrePage?: string; children?: Child }> = ({ commun, titrePage, children }) => (
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="csrf" content={commun.csrf} />
      <title>{titrePage ? `${titrePage} · ${commun.titre}` : commun.titre}</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <header class="entete">
        <div class="bandeau" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="entete-contenu">
          <a class="marque" href="/"><strong>CESTOM</strong> Tétouan</a>
          <span class={`pastille pastille-${commun.statut}`}>{commun.libelleStatut}</span>
        </div>
        {commun.adminConnecte && (
          <nav class="nav-admin">
            <a href="/admin">Tableau de bord</a>
            <a href="/admin/candidats">Candidatures</a>
            <a href="/admin/codes">Membres</a>
            <form method="post" action="/admin/deconnexion">
              <ChampCsrf commun={commun} />
              <button class="lien">Déconnexion</button>
            </form>
          </nav>
        )}
      </header>

      <main class="page">
        {commun.messages.map(([categorie, texte]) => (
          <p class={`alerte alerte-${categorie}`} role="status">{texte}</p>
        ))}
        {children}
      </main>

      <footer class="pied">
        CESTOM Tétouan · Vote anonyme ·{" "}
        {commun.statut !== "clos" && <><a href="/inscription">Recevoir mon code</a> ·{" "}</>}
        {commun.candidaturesOuvertes && <><a href="/candidature">Candidater</a> ·{" "}</>}
        <a href="/resultats">Résultats</a> · <a href="/admin">Comité électoral</a>
      </footer>
    </body>
  </html>
);

export const Portrait: FC<{ candidat: { nom: string; photo: string }; classe?: string }> = ({ candidat, classe = "" }) => (
  <span class={`cadre ${classe}`}>
    <span class="cadre-passe">
      {candidat.photo
        ? <img src={`/photos/${candidat.photo}`} alt={`Photo de ${candidat.nom}`} loading="lazy" />
        : <span class="cadre-vide">{initiales(candidat.nom)}</span>}
    </span>
  </span>
);

export const Silhouette: FC<{ classe?: string; texte?: string }> = ({ classe = "", texte = "?" }) => (
  <span class={`cadre cadre-mystere ${classe}`} aria-hidden="true">
    <span class="cadre-passe"><span class="cadre-vide">{texte}</span></span>
  </span>
);
