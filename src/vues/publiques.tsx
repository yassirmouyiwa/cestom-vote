/** Pages publiques : accueil, candidature, candidats, vote et résultats. */
import type { FC } from "hono/jsx";
import { POSTES, STATUTS_CANDIDATURE } from "../db";
import type { Candidat, CandidatPublic, Poste, ResultatPoste } from "../db";
import { ChampCsrf, Page, Portrait, Silhouette, pourcent, type Commun } from "./commun";

type Participation = { inscrits: number; votants: number; taux: number };

export const Accueil: FC<{
  commun: Commun;
  postes: Poste<CandidatPublic>[];
  dateLimite: string;
  joursRestants: number;
}> = ({ commun, postes, dateLimite, joursRestants }) => (
  <Page commun={commun}>
    <section class="hero">
      <p class="surtitre">Communauté des étudiants togolais de Tétouan</p>
      <h1>{commun.titre}</h1>

      {commun.statut === "ouvert" ? (
        <>
          <p class="intro">Le vote est ouvert. Entrez le code personnel reçu du comité électoral.</p>
          <form class="carte formulaire-code" method="post" action="/code">
            <ChampCsrf commun={commun} />
            <label for="code">Votre code de vote</label>
            <input id="code" name="code" placeholder="K7P-3XQ" autocomplete="off"
              autocapitalize="characters" maxlength={12} required />
            <button class="bouton bouton-large">Accéder au bulletin</button>
            <p class="aide">Votre vote est anonyme : personne ne peut savoir pour qui vous avez voté.</p>
            <p class="liens-code">
              <a href="/inscription">Pas encore de code ? Inscrivez-vous</a> · <a href="/code-perdu">Code perdu ?</a>
            </p>
          </form>
        </>
      ) : commun.statut === "clos" ? (
        <>
          <p class="intro">Le vote est terminé. Merci à toutes et à tous pour votre participation !</p>
          <a class="bouton" href="/resultats">Voir les résultats</a>
        </>
      ) : (
        <div class="appels">
          {commun.candidaturesOuvertes ? (
            <div class="carte appel">
              <p class="appel-delai">
                {joursRestants > 1 ? `Plus que ${joursRestants} jours pour candidater`
                  : joursRestants === 1 ? "Clôture des candidatures demain" : "Dernier jour pour candidater !"}
              </p>
              <h2>Les candidatures sont ouvertes</h2>
              <p>Envie de vous engager pour la communauté ? Déposez votre candidature avant le <strong>{dateLimite}</strong>.</p>
              <a class="bouton bouton-large" href="/candidature">Déposer ma candidature</a>
            </div>
          ) : (
            <p class="intro">Les candidatures sont closes. Découvrez les candidats ci-dessous.</p>
          )}
          <div class="carte appel">
            <h2>Inscrivez-vous pour voter</h2>
            <p>Donnez votre nom ou pseudo et votre numéro WhatsApp : vous recevez aussitôt votre code de vote personnel, activé après vérification par le comité électoral.</p>
            <a class="bouton bouton-large" href="/inscription">Recevoir mon code de vote</a>
            <p class="liens-code"><a href="/code-perdu">Code perdu ?</a></p>
          </div>
        </div>
      )}
    </section>

    <section>
      <h2>Les candidats</h2>
      {postes.map((poste) => (
        <article class="carte poste-galerie" id={`poste-${poste.code}`}>
          <div class="poste-entete">
            <span class="sigle">{poste.code}</span>
            {poste.candidats.length > 0 && (
              <span class="poste-compte">{poste.candidats.length} candidature{poste.candidats.length > 1 ? "s" : ""}</span>
            )}
          </div>
          <h3>{poste.intitule}</h3>
          {poste.candidats.length > 0 ? (
            <div class="galerie">
              {poste.candidats.map((c) => (
                <a class="fiche" href={`/candidats/${c.id}`}>
                  <Portrait candidat={c} />
                  <span class="fiche-nom">{c.nom}</span>
                  {c.detail && <span class="fiche-detail">{c.detail}</span>}
                  <span class="fiche-lien">Lire sa motivation</span>
                </a>
              ))}
            </div>
          ) : (
            <p class="vide">
              {commun.statut === "preparation" ? "Aucune candidature pour l'instant." : "Aucun candidat pour ce poste."}
            </p>
          )}
        </article>
      ))}
    </section>
  </Page>
);

export const FormulaireCandidature: FC<{
  commun: Commun;
  ouvertes: boolean;
  parLeComite: boolean;
  valeurs: Record<string, string>;
  dateLimite: string;
  motivationMin: number;
  motivationMax: number;
  tailleMax: number;
}> = (p) => (
  <Page commun={p.commun} titrePage="Candidature">
    <h1>Déposer ma candidature</h1>

    {!p.ouvertes ? (
      <section class="carte centre">
        <p class="intro">Les candidatures sont closes. Découvrez les candidats sur la page d'accueil.</p>
        <a class="bouton bouton-secondaire" href="/">Voir les candidats</a>
      </section>
    ) : (
      <>
        {p.parLeComite && (
          <p class="alerte alerte-info">Vous êtes connecté(e) en tant que comité : cette candidature sera validée directement, même après la date limite.</p>
        )}
        <p class="intro">
          Date limite : <strong>{p.dateLimite}</strong> (heure du Maroc). Une fois validée par le comité électoral,
          votre candidature (photo et motivation) sera visible sur la page d'accueil.
        </p>

        <form id="formulaire-candidature" method="post" action="/candidature" enctype="multipart/form-data">
          <ChampCsrf commun={p.commun} />

          <section class="carte formulaire">
            <h2>Vos informations</h2>
            <label for="poste">Poste visé</label>
            <select id="poste" name="poste" required>
              <option value="">Choisir un poste…</option>
              {POSTES.map(([code, intitule]) => (
                <option value={code} selected={p.valeurs.poste === code}>{code} · {intitule}</option>
              ))}
            </select>

            <label for="nom">Nom et prénom(s)</label>
            <input id="nom" name="nom" maxlength={80} autocomplete="name" required value={p.valeurs.nom ?? ""} />

            <label for="detail">Établissement et filière <small>(facultatif)</small></label>
            <input id="detail" name="detail" maxlength={120} placeholder="Ex. : ENSA Tétouan, 3e année" value={p.valeurs.detail ?? ""} />

            <label for="telephone">Numéro WhatsApp <small>(visible uniquement par le comité)</small></label>
            <input id="telephone" name="telephone" type="tel" inputmode="tel" autocomplete="tel" required
              placeholder="06 12 34 56 78" value={p.valeurs.telephone ?? ""} />
          </section>

          <section class="carte formulaire">
            <h2>Votre motivation</h2>
            <label for="motivation">Pourquoi vous présentez-vous ? Que voulez-vous apporter à la communauté ?</label>
            <textarea id="motivation" name="motivation" rows={7} minlength={p.motivationMin}
              maxlength={p.motivationMax} required>{p.valeurs.motivation ?? ""}</textarea>
            <p class="aide">
              <span id="compteur-motivation">0</span> / {p.motivationMax} caractères. Ce texte sera affiché publiquement avec votre photo.
            </p>
          </section>

          <section class="carte">
            <h2>Votre photo</h2>
            <div class="photo-zone">
              <div class="photo-apercu">
                <span class="cadre" id="cadre-apercu" hidden>
                  <span class="cadre-passe"><img id="apercu" alt="Aperçu de votre photo" /></span>
                </span>
                <span class="cadre cadre-mystere" id="cadre-attente" aria-hidden="true">
                  <span class="cadre-passe"><span class="cadre-vide">📷</span></span>
                </span>
              </div>
              <div class="photo-consignes">
                <ul class="conseils">
                  <li>Photo récente, de face, visage bien visible</li>
                  <li>Bonne lumière et fond neutre</li>
                  <li>Format portrait de préférence</li>
                  <li>JPEG ou PNG</li>
                </ul>
                <label for="photo" class="label-photo">Choisir une photo</label>
                <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"
                  data-taille-max={String(p.tailleMax)} required />
              </div>
            </div>
            <p class="aide">La photo sera recadrée automatiquement, comme dans l'aperçu.</p>
          </section>

          <button class="bouton bouton-large">Envoyer ma candidature</button>
        </form>
        <script src="/candidature.js" defer></script>
      </>
    )}
  </Page>
);

export const CandidatureEnvoyee: FC<{ commun: Commun }> = ({ commun }) => (
  <Page commun={commun} titrePage="Candidature envoyée">
    <section class="hero centre">
      <div class="coche" aria-hidden="true">✓</div>
      <h1>Candidature envoyée !</h1>
      <p class="intro">Merci pour votre engagement envers la communauté. Le comité électoral va vérifier votre candidature et pourra vous contacter sur WhatsApp.</p>
      <p class="intro">Dès qu'elle sera validée, votre photo et votre motivation apparaîtront sur la page d'accueil.</p>
      <a class="bouton bouton-secondaire" href="/">Retour à l'accueil</a>
    </section>
  </Page>
);

export const PageCandidat: FC<{ commun: Commun; candidat: Candidat; intitule: string }> = ({ commun, candidat, intitule }) => (
  <Page commun={commun} titrePage={candidat.nom}>
    <p class="retour"><a href={`/#poste-${candidat.poste}`}>← Tous les candidats</a></p>
    {candidat.statut !== "validee" && (
      <p class="alerte alerte-info">
        Aperçu réservé au comité : candidature « {STATUTS_CANDIDATURE[candidat.statut]} », invisible pour le public.
      </p>
    )}
    <article class="profil">
      <Portrait candidat={candidat} classe="cadre-profil" />
      <div class="profil-texte">
        <p class="sigle">{candidat.poste}</p>
        <p class="surtitre">Candidature au poste de {intitule}</p>
        <h1>{candidat.nom}</h1>
        {candidat.detail && <p class="profil-detail">{candidat.detail}</p>}
        <section class="carte">
          <h2>Motivation</h2>
          {candidat.motivation
            ? <p class="motivation">{candidat.motivation}</p>
            : <p class="vide">Aucune motivation renseignée.</p>}
        </section>
      </div>
    </article>
  </Page>
);

export const Bulletin: FC<{
  commun: Commun;
  postes: Poste<CandidatPublic>[];
  saisie: Record<string, string>;
}> = ({ commun, postes, saisie }) => (
  <Page commun={commun} titrePage="Bulletin de vote">
    <h1>Votre bulletin</h1>
    <p class="intro">Pour chaque poste, choisissez un(e) candidat(e) ou « Vote blanc ». Vous pourrez tout vérifier avant de valider.</p>
    <form method="post" action="/bulletin">
      <ChampCsrf commun={commun} />
      {postes.map((poste) => (
        <fieldset class="carte poste-vote">
          <legend><span class="sigle">{poste.code}</span> {poste.intitule}</legend>
          {poste.candidats.map((c) => (
            <label class="option">
              <input type="radio" name={`poste_${poste.code}`} value={String(c.id)} required
                checked={saisie[poste.code] === String(c.id)} />
              <Portrait candidat={c} classe="cadre-mini" />
              <span class="nom">{c.nom}{c.detail && <small>{c.detail}</small>}</span>
            </label>
          ))}
          <label class="option option-blanc">
            <input type="radio" name={`poste_${poste.code}`} value="blanc" required checked={saisie[poste.code] === "blanc"} />
            <Silhouette classe="cadre-mini" texte="–" />
            <span class="nom">Vote blanc</span>
          </label>
        </fieldset>
      ))}
      <button class="bouton bouton-large">Vérifier mon vote</button>
    </form>
  </Page>
);

const ChampsChoix: FC<{ saisie: Record<string, string> }> = ({ saisie }) => (
  <>{Object.entries(saisie).map(([code, valeur]) => <input type="hidden" name={`poste_${code}`} value={valeur} />)}</>
);

export const Recapitulatif: FC<{
  commun: Commun;
  recap: [Poste<CandidatPublic>, CandidatPublic | undefined][];
  saisie: Record<string, string>;
}> = ({ commun, recap, saisie }) => (
  <Page commun={commun} titrePage="Vérification du vote">
    <h1>Vérifiez votre vote</h1>
    <p class="intro">Une fois confirmé, votre vote est définitif et ne peut plus être modifié.</p>
    <div class="carte recap">
      {recap.map(([poste, candidat]) => (
        <div class="recap-ligne">
          <span class="sigle">{poste.code}</span>
          <span class="recap-poste">{poste.intitule}</span>
          <div class="recap-choix">
            {candidat
              ? <><Portrait candidat={candidat} classe="cadre-mini" /><strong>{candidat.nom}</strong></>
              : <strong class="recap-blanc">Vote blanc</strong>}
          </div>
        </div>
      ))}
    </div>
    <div class="actions">
      <form method="post" action="/bulletin">
        <ChampCsrf commun={commun} />
        <input type="hidden" name="modifier" value="1" />
        <ChampsChoix saisie={saisie} />
        <button class="bouton bouton-secondaire">Modifier</button>
      </form>
      <form method="post" action="/voter" onsubmit="this.querySelector('button').disabled = true">
        <ChampCsrf commun={commun} />
        <ChampsChoix saisie={saisie} />
        <button class="bouton">Confirmer mon vote</button>
      </form>
    </div>
  </Page>
);

export const Merci: FC<{ commun: Commun }> = ({ commun }) => (
  <Page commun={commun} titrePage="Merci">
    <section class="hero centre">
      <div class="coche" aria-hidden="true">✓</div>
      <h1>Merci, votre vote est enregistré</h1>
      <p class="intro">Votre bulletin a été déposé dans l'urne de façon anonyme. Votre code ne peut plus être utilisé.</p>
      <p class="intro">Les résultats seront publiés dès la clôture du vote.</p>
      <a class="bouton bouton-secondaire" href="/resultats">Page des résultats</a>
    </section>
  </Page>
);

export const Resultats: FC<{
  commun: Commun;
  publie: boolean;
  postes: ResultatPoste[];
  participation: Participation;
}> = ({ commun, publie, postes, participation }) => (
  <Page commun={commun} titrePage="Résultats">
    <h1>Résultats</h1>
    {!publie ? (
      <section class="carte centre">
        <p class="intro">Les résultats seront publiés ici dès la clôture du vote.</p>
        <a class="bouton bouton-secondaire" href="/">Retour à l'accueil</a>
      </section>
    ) : (
      <>
        <p class="intro">{commun.titre}</p>
        <div class="chiffres">
          <div class="chiffre"><strong>{participation.votants}</strong><span>votants</span></div>
          <div class="chiffre"><strong>{participation.inscrits}</strong><span>codes distribués</span></div>
          <div class="chiffre"><strong>{pourcent(participation.taux)}</strong><span>participation</span></div>
        </div>
        {postes.length === 0 && <p class="vide">Aucun résultat à afficher.</p>}
        {postes.map((poste) => (
          <section class="carte resultat">
            <p class="sigle">{poste.code}</p>
            <h2>{poste.intitule}</h2>
            {poste.egalite && <p class="alerte alerte-info">Égalité en tête : le comité électoral doit départager.</p>}
            {poste.candidats.map((c) => (
              <div class={c.elu ? "score-ligne elu" : "score-ligne"}>
                <Portrait candidat={c} classe="cadre-mini" />
                <div class="score-corps">
                  <div class="score-entete">
                    <span class="nom">{c.nom}{c.elu && <> <span class="badge-elu">Élu(e)</span></>}</span>
                    <span class="score">{c.voix} voix · {pourcent(c.pourcentage)}</span>
                  </div>
                  <div class="barre"><span style={`width: ${c.pourcentage}%`}></span></div>
                </div>
              </div>
            ))}
            <p class="aide">
              {poste.exprimes} suffrage(s) exprimé(s) · {poste.blancs} vote(s) blanc(s). Pourcentages calculés sur les suffrages exprimés.
            </p>
          </section>
        ))}
      </>
    )}
  </Page>
);
