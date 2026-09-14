# Site de vote — CESTOM Tétouan

Mini site d'élection du bureau :

1. **Candidatures en ligne** jusqu'à la date limite, avec photo et motivation. Dès qu'une candidature est validée par le comité, elle apparaît sur la page d'accueil (photo dans son cadre, nom) et le candidat a sa propre page avec sa motivation.
2. **Inscription des membres** : chacun donne son nom ou pseudo et son numéro WhatsApp, et reçoit aussitôt son code de vote personnel. Le code ne permet de voter qu'après validation de l'inscription par le comité.
3. **Jour du vote** : chaque membre vote avec son code, une seule fois, de façon **anonyme**.
4. **Clôture** : les résultats sont publiés.

Hébergement gratuit sur **Cloudflare** : Workers (le site, écrit avec [Hono](https://hono.dev)), D1 (base de données) et KV (photos). Chaque `git push` sur GitHub met le site à jour automatiquement.

---

## 1. Tester sur votre PC

Prérequis : [Node.js](https://nodejs.org) et [Git](https://git-scm.com).

```powershell
cd C:\Users\ASUS\cestom-vote-cloudflare
npm install
Copy-Item .dev.vars.example .dev.vars   # puis choisissez un mot de passe dans .dev.vars
npm run dev
```

Ouvrez <http://127.0.0.1:8787> (site) et <http://127.0.0.1:8787/admin> (comité).

- Tests automatiques : `npm test`
- Vérification du code : `npm run typecheck`

---

## 2. Mettre le site en ligne : PC → GitHub → Cloudflare

### a) Envoyer le code sur GitHub

1. Créez un compte sur <https://github.com>, puis un **nouveau dépôt privé** nommé `cestom-vote`, **vide** (sans README ni .gitignore).
2. Dans PowerShell, depuis le dossier du projet (le dépôt Git local est déjà prêt) :
   ```powershell
   git remote add origin https://github.com/VOTRE_COMPTE/cestom-vote.git
   git push -u origin main
   ```
   Une fenêtre de connexion GitHub s'ouvre la première fois.

### b) Déployer sur Cloudflare

1. Créez un compte gratuit sur <https://dash.cloudflare.com>.
2. **Workers & Pages** → **Create application** → **Import a repository** → connectez votre compte GitHub et choisissez le dépôt `cestom-vote`.
3. Vérifiez les réglages (ne mettez **rien** dans *Advanced settings*) :
   - **Project name** : `cestom-vote` (doit être identique au `name` de `wrangler.jsonc`) ;
   - **Deploy command** : `npx wrangler deploy`.

   Lancez le déploiement. La base D1 `cestom-vote` et l'espace KV des photos sont créés automatiquement.
4. Une fois le Worker créé : **Workers & Pages** → `cestom-vote` → onglet **Settings** → **Variables and Secrets** → **Add**, type **Secret** :
   - `ADMIN_PASSWORD` : le mot de passe du comité (long, partagé uniquement avec le comité) ;
   - `SECRET_KEY` : une longue chaîne aléatoire, par exemple le résultat de
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
5. L'adresse du site s'affiche dans le Worker : `https://cestom-vote.VOTRE-SOUS-DOMAINE.workers.dev`.

Ensuite, chaque `git push` sur la branche `main` redéploie le site. Les candidatures, membres, votes et photos sont conservés, et la base est mise à jour automatiquement si une nouvelle version du site l'exige.

> **Si le premier déploiement échoue** sur la base D1 ou le KV : créez-les à la main dans le tableau de bord (**Storage & databases** → D1 `cestom-vote`, puis KV `cestom-vote-photos`), ajoutez leurs identifiants dans `wrangler.jsonc` (`"database_id"` pour D1, `"id"` pour KV), puis `git commit` et `git push`.

**Offre gratuite Cloudflare** : 100 000 visites de pages par jour et 1 000 envois de photos par jour, largement suffisant pour la communauté.

---

## 3. Déroulement d'une élection (guide du comité)

### Réglages de départ

1. **Connexion** : `https://…workers.dev/admin` avec le mot de passe du comité.
2. **Paramètres** (tableau de bord) : titre, **date limite des candidatures** (par défaut : dimanche 20 septembre 2026 à 23h59, heure du Maroc) et **numéro WhatsApp du comité** (affiché sur la page « Code perdu »).
3. **Diffusez le lien** du site dans le groupe WhatsApp de la communauté.

### Les candidatures

4. Chaque personne intéressée remplit *Déposer ma candidature* (poste, nom, établissement, WhatsApp, motivation, photo). La photo est recadrée automatiquement dans le navigateur.
5. **Candidatures** : lisez la motivation, regardez la photo, puis validez ou rejetez. Seules les candidatures **validées** apparaissent sur la page d'accueil et figurent sur le bulletin. Après la date limite, le formulaire se ferme ; le comité connecté peut encore enregistrer une candidature (validée d'office).

### Les membres et leurs codes

6. Chaque membre clique sur **Recevoir mon code de vote**, donne son nom ou pseudo et son numéro WhatsApp (06/07 pour le Maroc, sinon avec l'indicatif, ex. `+228 …`). Son code s'affiche aussitôt, avec un bouton pour se l'envoyer sur WhatsApp. **Un numéro ne peut s'inscrire qu'une fois.**
7. **Membres** (espace comité) : le filtre **À valider** liste les nouvelles inscriptions. Vérifiez que la personne est bien membre, puis **Valider** (ou **Rejeter**). Seuls les codes validés permettent de voter ; les inscriptions restent possibles jusqu'à la clôture du vote.
8. **Code perdu** : le site ne renvoie jamais un code. Le membre écrit au comité **sur WhatsApp, depuis son numéro inscrit**. Dans **Membres**, recherchez son nom ou son numéro, puis :
   - **Envoyer sur WhatsApp** pour lui renvoyer le même code ;
   - ou **Nouveau code** si le code a pu être vu par quelqu'un d'autre (l'ancien ne fonctionne plus).
9. Pour un membre qui ne peut pas s'inscrire lui-même : **Ajouter des membres à la main** (codes validés directement).

### Le jour du vote

10. **Ouvrir le vote** depuis le tableau de bord (toutes les candidatures doivent être traitées ; elles sont ensuite figées).
11. **Suivre la participation** : le filtre « Pas encore voté » permet de relancer. Pendant le vote, **personne ne voit les résultats**, pas même le comité.
12. **Clôturer** : les résultats sont aussitôt publiés sur `/resultats`. En cas d'égalité, le site le signale et le comité départage.

**L'année suivante** : tableau de bord → *Préparer une nouvelle élection* (gardez d'abord une capture des résultats), puis mettez à jour le titre et la date limite.

> **Heure du Maroc** : le Maroc repasse à l'heure GMT le 20/09/2026 à 2h (décret n° 2.26.530). Cette règle est écrite dans `src/heure.ts` : la date limite de 23h59 correspond bien à l'heure légale ce jour-là.

---

## 4. Sécurité et confidentialité

- **Inscriptions vérifiées.** N'importe qui peut s'inscrire, mais un code ne permet de voter qu'après validation par le comité : les faux membres et les inscriptions en double sont écartés. Le site ne révèle jamais le code d'un numéro déjà inscrit.
- **Candidatures vérifiées.** Une candidature (photo, motivation) n'est visible par le public qu'après validation par le comité.
- **Photos nettoyées.** Le navigateur recadre la photo et la réenregistre, ce qui retire ses métadonnées (position GPS, etc.). Les numéros WhatsApp ne sont visibles que par le comité.
- **Un code = un vote.** Le marquage du code et l'enregistrement du bulletin forment une seule transaction D1 : même deux envois simultanés ne permettent pas de voter deux fois.
- **Vote secret.** Les bulletins sont enregistrés sans lien avec le code, sans heure et dans un ordre aléatoire. Le comité voit seulement **qui a voté**, pour pouvoir relancer.
- **Formulaires protégés.** Session dans un cookie signé, jeton anti-falsification (CSRF) sur chaque formulaire, blocage temporaire après 10 codes ou mots de passe faux (ou 10 inscriptions) en 15 minutes depuis une même connexion.
- **Limite à connaître.** Quelqu'un qui obtient le code d'un autre membre peut voter à sa place, et le vote étant anonyme, on ne peut pas l'annuler ensuite. Rappelez aux membres de ne jamais partager leur code.
