/** Pages de l'espace du comité électoral. */
import type { FC } from "hono/jsx";
import { STATUTS_CANDIDATURE, STATUTS_INSCRIPTION } from "../db";
import type { Candidat, Poste, StatutCandidature, StatutInscription } from "../db";
import { ChampCsrf, Page, Portrait, pourcent, type Commun } from "./commun";

type Participation = { inscrits: number; votants: number; taux: number; enAttente: number };
export type CandidatureAdmin = Candidat & { depose: string };
export type MembreAdmin = {
  code: string;
  membre: string;
  telephone: string;
  statut: StatutInscription;
  utilise_le: string | null;
  whatsapp: string;
};

/** Attribut onsubmit demandant confirmation (texte échappé pour JavaScript). */
const confirmer = (texte: string) => `return confirm(${JSON.stringify(texte)})`;

export const Connexion: FC<{ commun: Commun; configure: boolean }> = ({ commun, configure }) => (
  <Page commun={commun} titrePage="Comité électoral">
    <section class="carte etroite">
      <h1>Comité électoral</h1>
      {configure ? (
        <form method="post" action="/admin/connexion" class="formulaire">
          <ChampCsrf commun={commun} />
          <label for="mot_de_passe">Mot de passe</label>
          <input id="mot_de_passe" name="mot_de_passe" type="password" autocomplete="current-password" required autofocus />
          <button class="bouton bouton-large">Se connecter</button>
        </form>
      ) : (
        <p class="alerte alerte-erreur">
          Aucun mot de passe n'est configuré. Ajoutez le secret <code>ADMIN_PASSWORD</code> dans les paramètres du Worker (voir le README).
        </p>
      )}
    </section>
  </Page>
);

const BoutonStatut: FC<{ commun: Commun; action: string; classe: string; confirmation: string; libelle: string }> = (p) => (
  <form method="post" action="/admin/statut" onsubmit={confirmer(p.confirmation)}>
    <ChampCsrf commun={p.commun} />
    <button class={p.classe} name="action" value={p.action}>{p.libelle}</button>
  </form>
);

export const Tableau: FC<{
  commun: Commun;
  participation: Participation;
  candidatsValides: boolean;
  postesVides: string[];
  candidaturesEnAttente: number;
  dateLimite: string;
  dateLimiteTexte: string;
  heureMaroc: string;
  whatsappComite: string;
}> = (p) => (
  <Page commun={p.commun} titrePage="Tableau de bord">
    <h1>Tableau de bord</h1>

    <section class="carte">
      <h2>{p.commun.libelleStatut}</h2>

      {p.commun.statut !== "clos" && p.participation.enAttente > 0 && (
        <p class="alerte alerte-info">
          {p.participation.enAttente} inscription(s) de membres à valider. <a href="/admin/codes?filtre=attente">Les examiner</a>
        </p>
      )}

      {p.commun.statut === "preparation" ? (
        <>
          <ol class="etapes">
            <li class={p.candidatsValides && !p.candidaturesEnAttente && !p.commun.candidaturesOuvertes ? "fait" : ""}>
              <a href="/admin/candidats">Recevoir et valider les candidatures</a>
              <small>
                {p.commun.candidaturesOuvertes ? `Ouvertes jusqu'au ${p.dateLimiteTexte}` : `Closes depuis le ${p.dateLimiteTexte}`}
              </small>
            </li>
            <li class={p.participation.inscrits && !p.participation.enAttente ? "fait" : ""}>
              <a href="/admin/codes">Valider les inscriptions des membres</a>
              <small>{p.participation.inscrits} membre(s) validé(s) · {p.participation.enAttente} à valider</small>
            </li>
            <li>Le jour du vote : ouvrir le vote</li>
          </ol>
          {p.candidaturesEnAttente > 0 && (
            <p class="alerte alerte-info">
              {p.candidaturesEnAttente} candidature(s) en attente de validation. <a href="/admin/candidats">Les examiner</a>
            </p>
          )}
          {p.postesVides.length > 0 && (
            <p class="alerte alerte-info">Sans candidat validé, donc absents du bulletin : {p.postesVides.join(", ")}.</p>
          )}
          <BoutonStatut commun={p.commun} action="ouvrir" classe="bouton" libelle="Ouvrir le vote"
            confirmation="Ouvrir le vote ? Les candidatures ne pourront plus être modifiées." />
        </>
      ) : (
        <>
          <div class="chiffres">
            <div class="chiffre"><strong>{p.participation.votants}</strong><span>ont voté</span></div>
            <div class="chiffre"><strong>{p.participation.inscrits - p.participation.votants}</strong><span>pas encore voté</span></div>
            <div class="chiffre"><strong>{pourcent(p.participation.taux)}</strong><span>participation</span></div>
          </div>
          <div class="barre"><span style={`width: ${p.participation.taux}%`}></span></div>
          {p.commun.statut === "ouvert" ? (
            <>
              <p class="aide">Les résultats restent secrets jusqu'à la clôture, y compris pour le comité.</p>
              <BoutonStatut commun={p.commun} action="cloturer" classe="bouton bouton-danger" libelle="Clôturer et publier les résultats"
                confirmation="Clôturer le vote ? Plus personne ne pourra voter et les résultats seront publiés." />
            </>
          ) : (
            <div class="actions">
              <a class="bouton" href="/resultats">Voir les résultats</a>
              <BoutonStatut commun={p.commun} action="rouvrir" classe="bouton bouton-secondaire" libelle="Rouvrir le vote"
                confirmation="Rouvrir le vote ? Les résultats seront de nouveau masqués." />
            </div>
          )}
        </>
      )}
    </section>

    <section class="carte">
      <h2>Paramètres</h2>
      <form method="post" action="/admin/parametres" class="formulaire">
        <ChampCsrf commun={p.commun} />
        <label for="titre">Titre de l'élection</label>
        <input id="titre" name="titre" value={p.commun.titre} maxlength={120} required />
        <label for="date_limite">Date limite des candidatures <small>(heure du Maroc)</small></label>
        <input id="date_limite" name="date_limite" type="datetime-local" value={p.dateLimite} required />
        <p class="aide">Heure actuelle au Maroc : {p.heureMaroc}.</p>
        <label for="whatsapp_comite">Numéro WhatsApp du comité <small>(facultatif)</small></label>
        <input id="whatsapp_comite" name="whatsapp_comite" type="tel" inputmode="tel" placeholder="06 12 34 56 78"
          value={p.whatsappComite ? `+${p.whatsappComite}` : ""} />
        <p class="aide">Affiché sur la page « Code perdu » pour que les membres puissent écrire au comité.</p>
        <button class="bouton bouton-secondaire">Enregistrer</button>
      </form>
    </section>

    {p.commun.statut !== "ouvert" && (
      <section class="carte zone-danger">
        <h2>Préparer une nouvelle élection</h2>
        <p>Supprime les candidatures (et leurs photos), les membres inscrits, leurs codes et les bulletins. Gardez une copie des résultats (capture d'écran ou impression) avant de continuer.</p>
        <form method="post" action="/admin/reinitialiser" class="formulaire en-ligne">
          <ChampCsrf commun={p.commun} />
          <input name="confirmation" placeholder="Tapez REINITIALISER" autocomplete="off" aria-label="Confirmation" />
          <button class="bouton bouton-danger">Tout réinitialiser</button>
        </form>
      </section>
    )}
  </Page>
);

export const Candidatures: FC<{
  commun: Commun;
  postes: Poste<CandidatureAdmin>[];
  compte: Record<StatutCandidature, number>;
  dateLimite: string;
}> = ({ commun, postes, compte, dateLimite }) => (
  <Page commun={commun} titrePage="Candidatures">
    <h1>Candidatures</h1>
    <div class="chiffres">
      <div class="chiffre"><strong>{compte.attente}</strong><span>en attente</span></div>
      <div class="chiffre"><strong>{compte.validee}</strong><span>validées</span></div>
      <div class="chiffre"><strong>{compte.rejetee}</strong><span>rejetées</span></div>
    </div>

    {commun.statut === "preparation" ? (
      <p class="aide aide-section">
        Date limite : {dateLimite}. Seules les candidatures validées sont affichées sur la page d'accueil et figurent sur le bulletin.
        Le comité peut aussi <a href="/candidature">enregistrer une candidature</a>, même après la date limite.
      </p>
    ) : (
      <p class="alerte alerte-info">Le vote a été ouvert : les candidatures sont figées.</p>
    )}

    {postes.map((poste) => (
      <section class="carte">
        <p class="sigle">{poste.code}</p>
        <h2>{poste.intitule}</h2>
        {poste.candidats.length === 0 && <p class="vide">Aucune candidature pour ce poste.</p>}
        {poste.candidats.map((c) => (
          <div class={`candidature candidature-${c.statut}`} id={`candidature-${c.id}`}>
            {c.photo
              ? <a href={`/photos/${c.photo}`} target="_blank" rel="noopener" title="Voir la photo en grand"><Portrait candidat={c} classe="cadre-moyen" /></a>
              : <Portrait candidat={c} classe="cadre-moyen" />}
            <div class="candidature-infos">
              <p class="nom">
                <a href={`/candidats/${c.id}`}>{c.nom}</a>{" "}
                <span class={`etat etat-${c.statut}`}>{STATUTS_CANDIDATURE[c.statut]}</span>
              </p>
              {c.detail && <p class="candidature-detail">{c.detail}</p>}
              <p class="candidature-detail">
                {c.telephone && <a href={`https://wa.me/${c.telephone}`} target="_blank" rel="noopener">+{c.telephone}</a>}
                {c.depose && ` · déposée le ${c.depose}`}
              </p>
              {c.motivation && (
                <details class="repli">
                  <summary>Motivation</summary>
                  <p class="motivation">{c.motivation}</p>
                </details>
              )}
              {commun.statut === "preparation" && (
                <div class="candidature-actions">
                  {c.statut !== "validee" && (
                    <form method="post" action={`/admin/candidats/${c.id}/statut`}>
                      <ChampCsrf commun={commun} />
                      <button class="bouton bouton-petit" name="statut" value="validee">Valider</button>
                    </form>
                  )}
                  {c.statut !== "rejetee" && (
                    <form method="post" action={`/admin/candidats/${c.id}/statut`}>
                      <ChampCsrf commun={commun} />
                      <button class="bouton bouton-petit bouton-secondaire" name="statut" value="rejetee">Rejeter</button>
                    </form>
                  )}
                  <form method="post" action={`/admin/candidats/${c.id}/supprimer`}
                    onsubmit={confirmer("Supprimer définitivement cette candidature et sa photo ?")}>
                    <ChampCsrf commun={commun} />
                    <button class="lien lien-danger">Supprimer</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    ))}
  </Page>
);

const ActionMembre: FC<{
  commun: Commun;
  code: string;
  action: "statut" | "nouveau" | "supprimer";
  retour: string;
  libelle: string;
  classe: string;
  statut?: StatutInscription;
  confirmation?: string;
}> = (p) => (
  <form method="post" action={`/admin/codes/${p.code}/${p.action}`}
    onsubmit={p.confirmation ? confirmer(p.confirmation) : undefined}>
    <ChampCsrf commun={p.commun} />
    <input type="hidden" name="retour" value={p.retour} />
    {p.statut && <input type="hidden" name="statut" value={p.statut} />}
    <button class={p.classe}>{p.libelle}</button>
  </form>
);

const FILTRES_MEMBRES = [
  ["tous", "Tous"],
  ["attente", "À valider"],
  ["valides", "Validés"],
  ["pas-vote", "Pas encore voté"],
  ["votes", "Ont voté"],
  ["rejetes", "Rejetés"],
];

export const Membres: FC<{
  commun: Commun;
  membres: MembreAdmin[];
  filtre: string;
  recherche: string;
  retour: string;
  participation: Participation;
}> = (p) => (
  <Page commun={p.commun} titrePage="Membres et codes">
    <h1>Membres et codes</h1>
    <div class="chiffres">
      <div class="chiffre"><strong>{p.participation.enAttente}</strong><span>à valider</span></div>
      <div class="chiffre"><strong>{p.participation.inscrits}</strong><span>validés</span></div>
      <div class="chiffre"><strong>{p.participation.votants}</strong><span>ont voté</span></div>
    </div>
    <p class="aide aide-section">
      Les membres s'inscrivent eux-mêmes sur <a href="/inscription">la page d'inscription</a> et reçoivent aussitôt leur code.
      Vérifiez que chaque inscription correspond à un vrai membre avant de la valider : seuls les codes validés permettent de voter.
      Code perdu : quand le membre vous écrit depuis son numéro inscrit, recherchez-le et renvoyez son code sur WhatsApp,
      ou créez-en un nouveau.
    </p>

    <section class="carte">
      <form method="get" action="/admin/codes" class="recherche">
        {p.filtre !== "tous" && <input type="hidden" name="filtre" value={p.filtre} />}
        <input name="q" type="search" value={p.recherche} placeholder="Nom, numéro ou code" aria-label="Rechercher un membre" />
        <button class="bouton bouton-secondaire">Rechercher</button>
      </form>
      <nav class="filtres">
        {FILTRES_MEMBRES.map(([cle, libelle]) => (
          <a href={cle === "tous" ? "/admin/codes" : `/admin/codes?filtre=${cle}`}
            aria-current={p.filtre === cle ? "page" : undefined}>{libelle}</a>
        ))}
      </nav>
      <div class="defilant">
        <table>
          <thead><tr><th>Membre</th><th>Code</th><th>État</th><th></th></tr></thead>
          <tbody>
            {p.membres.length === 0 && <tr><td colspan={4} class="vide">Aucun membre.</td></tr>}
            {p.membres.map((m) => (
              <tr>
                <td>{m.membre || "—"}{m.telephone && <small>+{m.telephone}</small>}</td>
                <td><code>{m.code}</code></td>
                <td>
                  {m.utilise_le
                    ? <span class="etat etat-vote">A voté</span>
                    : <span class={`etat etat-${m.statut}`}>{STATUTS_INSCRIPTION[m.statut]}</span>}
                </td>
                <td>
                  {!m.utilise_le && (
                    <div class="actions-membre">
                      {m.statut !== "valide" && (
                        <ActionMembre commun={p.commun} code={m.code} retour={p.retour} action="statut" statut="valide"
                          classe="bouton bouton-petit" libelle="Valider" />
                      )}
                      {m.statut === "attente" && (
                        <ActionMembre commun={p.commun} code={m.code} retour={p.retour} action="statut" statut="rejete"
                          classe="lien lien-danger" libelle="Rejeter" />
                      )}
                      {m.statut === "valide" && m.telephone && (
                        <a class="lien" href={m.whatsapp} target="_blank" rel="noopener">Envoyer sur WhatsApp</a>
                      )}
                      {m.statut === "valide" && (
                        <ActionMembre commun={p.commun} code={m.code} retour={p.retour} action="nouveau" classe="lien"
                          libelle="Nouveau code" confirmation="Remplacer ce code ? L'ancien ne fonctionnera plus." />
                      )}
                      {m.statut !== "attente" && (
                        <ActionMembre commun={p.commun} code={m.code} retour={p.retour} action="supprimer" classe="lien lien-danger"
                          libelle="Supprimer" confirmation="Supprimer ce membre et son code ?" />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="aide"><a href="/admin/codes.csv">Exporter la liste (CSV)</a></p>
    </section>

    {p.commun.statut !== "clos" && (
      <section class="carte">
        <h2>Ajouter des membres à la main</h2>
        <p class="aide aide-section">Pour les membres qui ne peuvent pas s'inscrire eux-mêmes. Ces codes sont validés directement.</p>
        <form method="post" action="/admin/codes/generer" class="formulaire">
          <ChampCsrf commun={p.commun} />
          <label for="membres">Membres <small>(un par ligne : Nom ; téléphone facultatif)</small></label>
          <textarea id="membres" name="membres" rows={4}
            placeholder={"Prénom NOM ; 06 12 34 56 78\nPrénom NOM ; +228 90 12 34 56"}></textarea>
          <label for="nombre">Ou nombre de codes sans nom</label>
          <input id="nombre" name="nombre" type="number" min="0" max="500" inputmode="numeric" placeholder="0" />
          <button class="bouton">Générer</button>
        </form>
      </section>
    )}
  </Page>
);
