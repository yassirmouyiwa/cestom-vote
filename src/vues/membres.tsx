/** Inscription des membres, affichage de leur code et page « Code perdu ». */
import type { FC } from "hono/jsx";
import { ChampCsrf, Page, type Commun } from "./commun";

export const Inscription: FC<{ commun: Commun; ouvertes: boolean; valeurs: Record<string, string> }> = ({ commun, ouvertes, valeurs }) => (
  <Page commun={commun} titrePage="Recevoir mon code de vote">
    <section class="etroite-large">
      <h1>Recevoir mon code de vote</h1>
      {!ouvertes ? (
        <div class="carte centre">
          <p class="intro">Le vote est terminé : les inscriptions sont closes.</p>
          <a class="bouton bouton-secondaire" href="/resultats">Voir les résultats</a>
        </div>
      ) : (
        <>
          <p class="intro">
            Inscrivez-vous une seule fois : votre code personnel s'affiche aussitôt. Il permettra de voter
            après vérification de votre inscription par le comité électoral.
          </p>
          <form method="post" action="/inscription" class="carte formulaire">
            <ChampCsrf commun={commun} />
            <label for="nom">Nom ou pseudo <small>(pour que le comité vous reconnaisse)</small></label>
            <input id="nom" name="nom" maxlength={80} autocomplete="name" required value={valeurs.nom ?? ""} />
            <label for="telephone">Numéro WhatsApp</label>
            <input id="telephone" name="telephone" type="tel" inputmode="tel" autocomplete="tel" required
              placeholder="06 12 34 56 78 ou +228 90 12 34 56" value={valeurs.telephone ?? ""} />
            <p class="aide">
              Numéro marocain (06 / 07) ou numéro complet avec l'indicatif du pays. Seul le comité électoral le voit.
            </p>
            <button class="bouton bouton-large">Recevoir mon code</button>
          </form>
          <p class="aide centre"><a href="/code-perdu">Déjà inscrit(e) mais code perdu ?</a></p>
        </>
      )}
    </section>
  </Page>
);

export const InscriptionConfirmee: FC<{ commun: Commun; code: string; nom: string; lienWhatsapp: string }> = (p) => (
  <Page commun={p.commun} titrePage="Votre code de vote">
    <section class="hero centre etroite-large">
      <div class="coche" aria-hidden="true">✓</div>
      <h1>Inscription enregistrée</h1>
      <p class="intro">Merci {p.nom} ! Voici votre code de vote personnel :</p>
      <p class="code-affiche">{p.code}</p>
      <p class="alerte alerte-info">
        Gardez-le maintenant (capture d'écran ou WhatsApp) : cette page ne restera pas disponible.
        Le code permettra de voter une fois votre inscription validée par le comité électoral.
      </p>
      <div class="actions actions-centre">
        <a class="bouton" href={p.lienWhatsapp} target="_blank" rel="noopener">M'envoyer le code sur WhatsApp</a>
        <a class="bouton bouton-secondaire" href="/">Retour à l'accueil</a>
      </div>
      <p class="aide">Ne partagez jamais ce code : il ne sert qu'une fois, et un vote fait avec ne peut pas être annulé.</p>
    </section>
  </Page>
);

export const CodePerdu: FC<{ commun: Commun; lienComite: string }> = ({ commun, lienComite }) => (
  <Page commun={commun} titrePage="Code perdu">
    <section class="carte etroite-large">
      <h1>Code perdu ?</h1>
      <p>
        Pour protéger votre vote, le site ne renvoie jamais un code. Écrivez au comité électoral
        <strong> sur WhatsApp, depuis le numéro que vous avez inscrit</strong> : le comité vérifiera que c'est bien vous,
        puis vous renverra votre code ou vous en donnera un nouveau.
      </p>
      {lienComite
        ? <a class="bouton bouton-large" href={lienComite} target="_blank" rel="noopener">Écrire au comité sur WhatsApp</a>
        : <p class="alerte alerte-info">Contactez directement un membre du comité électoral.</p>}
      <p class="aide">Pas encore inscrit(e) ? <a href="/inscription">Recevoir mon code de vote</a></p>
    </section>
  </Page>
);
