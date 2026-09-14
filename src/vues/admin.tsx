/** Pages de l'espace du comité électoral. */
import type { FC } from "hono/jsx";
import { STATUTS_CANDIDATURE } from "../db";
import type { Candidat, Poste, StatutCandidature } from "../db";
import { ChampCsrf, Page, Portrait, pourcent, type Commun } from "./commun";

type Participation = { inscrits: number; votants: number; taux: number };
export type CandidatureAdmin = Candidat & { depose: string };
export type CodeAdmin = { code: string; membre: string; telephone: string; utilise_le: string | null; whatsapp: string };

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
  <form method="post" action="/admin/statut" onsubmit={`return confirm('${p.confirmation}')`}>
    <ChampCsrf commun={p.commun} />
    <button class={p.classe} name="action" value={p.action}>{p.libelle}</button>
  </form>
);

export const Tableau: FC<{
  commun: Commun;
  participation: Participation;
  candidatsValides: boolean;
  postesVides: string[];
  enAttente: number;
  dateLimite: string;
  dateLimiteTexte: string;
  heureMaroc: string;
}> = (p) => (
  <Page commun={p.commun} titrePage="Tableau de bord">
    <h1>Tableau de bord</h1>

    <section class="carte">
      <h2>{p.commun.libelleStatut}</h2>

      {p.commun.statut === "preparation" ? (
        <>
          <ol class="etapes">
            <li class={p.candidatsValides && !p.enAttente && !p.commun.candidaturesOuvertes ? "fait" : ""}>
              <a href="/admin/candidats">Recevoir et valider les candidatures</a>
              <small>
                {p.commun.candidaturesOuvertes ? `Ouvertes jusqu'au ${p.dateLimiteTexte}` : `Closes depuis le ${p.dateLimiteTexte}`}
              </small>
            </li>
            <li class={p.participation.inscrits ? "fait" : ""}>
              <a href="/admin/codes">Générer et envoyer les codes de vote</a>
            </li>
            <li>Le jour du vote : ouvrir le vote</li>
          </ol>
          {p.enAttente > 0 && (
            <p class="alerte alerte-info">
              {p.enAttente} candidature(s) en attente de validation. <a href="/admin/candidats">Les examiner</a>
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
            <div class="chiffre"><strong>{p.participation.inscrits - p.participation.votants}</strong><span>en attente</span></div>
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
        <button class="bouton bouton-secondaire">Enregistrer</button>
      </form>
    </section>

    {p.commun.statut !== "ouvert" && (
      <section class="carte zone-danger">
        <h2>Préparer une nouvelle élection</h2>
        <p>Supprime les candidatures (et leurs photos), les codes et les bulletins. Gardez une copie des résultats (capture d'écran ou impression) avant de continuer.</p>
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
                    onsubmit="return confirm('Supprimer définitivement cette candidature et sa photo ?')">
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

export const Codes: FC<{
  commun: Commun;
  codes: CodeAdmin[];
  filtre: string;
  participation: Participation;
}> = ({ commun, codes, filtre, participation }) => (
  <Page commun={commun} titrePage="Codes de vote">
    <h1>Codes de vote</h1>

    {commun.statut !== "clos" && (
      <section class="carte">
        <h2>Générer des codes</h2>
        <form method="post" action="/admin/codes/generer" class="formulaire">
          <ChampCsrf commun={commun} />
          <label for="membres">Membres <small>(un par ligne : Nom ; téléphone facultatif)</small></label>
          <textarea id="membres" name="membres" rows={6}
            placeholder={"Prénom NOM ; 06 12 34 56 78\nPrénom NOM ; +228 90 12 34 56\nPrénom NOM"}></textarea>
          <label for="nombre">Ou nombre de codes sans nom</label>
          <input id="nombre" name="nombre" type="number" min="0" max="500" inputmode="numeric" placeholder="0" />
          <button class="bouton">Générer</button>
        </form>
      </section>
    )}

    <section class="carte">
      <div class="titre-section">
        <h2>{participation.inscrits} code(s) · {participation.votants} vote(s)</h2>
        <a class="bouton bouton-secondaire" href="/admin/codes.csv">Exporter (CSV)</a>
      </div>
      <nav class="filtres">
        <a href="/admin/codes" aria-current={filtre !== "attente" && filtre !== "votes" ? "page" : undefined}>Tous</a>
        <a href="/admin/codes?filtre=attente" aria-current={filtre === "attente" ? "page" : undefined}>Pas encore voté</a>
        <a href="/admin/codes?filtre=votes" aria-current={filtre === "votes" ? "page" : undefined}>Ont voté</a>
      </nav>
      <div class="defilant">
        <table>
          <thead><tr><th>Code</th><th>Membre</th><th>État</th><th></th></tr></thead>
          <tbody>
            {codes.length === 0 && <tr><td colspan={4} class="vide">Aucun code.</td></tr>}
            {codes.map((c) => (
              <tr>
                <td><code>{c.code}</code></td>
                <td>{c.membre || "—"}{c.telephone && <small>+{c.telephone}</small>}</td>
                <td>{c.utilise_le ? <span class="etat etat-vote">A voté</span> : <span class="etat">En attente</span>}</td>
                <td class="actions-ligne">
                  {!c.utilise_le && (
                    <>
                      <a class="lien" href={c.whatsapp} target="_blank" rel="noopener">WhatsApp</a>
                      <form method="post" action={`/admin/codes/${c.code}/supprimer`} onsubmit="return confirm('Supprimer ce code ?')">
                        <ChampCsrf commun={commun} />
                        <button class="lien lien-danger">Supprimer</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </Page>
);
