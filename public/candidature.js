// Recadre la photo dans le navigateur (portrait 720 × 900, JPEG) avant l'envoi :
// fichier léger, orientation corrigée et métadonnées (position GPS, etc.) retirées.
(function () {
  "use strict";
  var LARGEUR = 720;
  var HAUTEUR = 900;
  var COTE_MINIMUM = 300;
  var NOM_RECADREE = "photo-recadree.jpg";

  var champ = document.getElementById("photo");
  var cadre = document.getElementById("cadre-apercu");
  var attente = document.getElementById("cadre-attente");
  var apercu = document.getElementById("apercu");
  var texte = document.getElementById("motivation");
  var compteur = document.getElementById("compteur-motivation");
  var tailleMax = Number(champ.dataset.tailleMax);

  function compter() {
    compteur.textContent = texte.value.length;
  }
  texte.addEventListener("input", compter);
  compter();

  function afficher(fichier) {
    apercu.src = URL.createObjectURL(fichier);
    cadre.hidden = false;
    attente.hidden = true;
  }

  function viaImage(fichier) {
    return new Promise(function (resoudre, rejeter) {
      var image = new Image();
      image.onload = function () { resoudre(image); };
      image.onerror = rejeter;
      image.src = URL.createObjectURL(fichier);
    });
  }

  function charger(fichier) {
    if (!window.createImageBitmap) return viaImage(fichier);
    return createImageBitmap(fichier, { imageOrientation: "from-image" }).catch(function () {
      return viaImage(fichier);
    });
  }

  function recadrer(image) {
    var largeurImage = image.naturalWidth || image.width;
    var hauteurImage = image.naturalHeight || image.height;
    if (Math.min(largeurImage, hauteurImage) < COTE_MINIMUM) throw new RangeError("photo trop petite");
    var echelle = Math.max(LARGEUR / largeurImage, HAUTEUR / hauteurImage);
    var largeur = LARGEUR / echelle;
    var hauteur = HAUTEUR / echelle;
    var canvas = document.createElement("canvas");
    canvas.width = LARGEUR;
    canvas.height = HAUTEUR;
    var contexte = canvas.getContext("2d");
    contexte.fillStyle = "#fff";
    contexte.fillRect(0, 0, LARGEUR, HAUTEUR);
    // Centré, un peu vers le haut, là où se trouve le visage.
    contexte.drawImage(image, (largeurImage - largeur) * 0.5, (hauteurImage - hauteur) * 0.35,
      largeur, hauteur, 0, 0, LARGEUR, HAUTEUR);
    return new Promise(function (resoudre, rejeter) {
      canvas.toBlob(function (blob) {
        if (blob) resoudre(blob); else rejeter(new Error("recadrage impossible"));
      }, "image/jpeg", 0.86);
    });
  }

  champ.addEventListener("change", function () {
    var fichier = champ.files[0];
    if (!fichier || fichier.name === NOM_RECADREE) return;
    charger(fichier).then(recadrer).then(function (blob) {
      try {
        var recadree = new File([blob], NOM_RECADREE, { type: "image/jpeg" });
        var transfert = new DataTransfer();
        transfert.items.add(recadree);
        champ.files = transfert.files;
        afficher(recadree);
      } catch (erreur) {
        // Navigateur ancien : la photo d'origine est envoyée si elle n'est pas trop lourde.
        if (fichier.size > tailleMax) throw new Error("photo trop lourde");
        afficher(fichier);
      }
    }).catch(function (erreur) {
      champ.value = "";
      cadre.hidden = true;
      attente.hidden = false;
      alert(erreur instanceof RangeError
        ? "Photo trop petite : choisissez une photo d'au moins 300 × 300 pixels."
        : "Impossible d'utiliser cette photo. Essayez une autre photo au format JPEG ou PNG.");
    });
  });
})();
