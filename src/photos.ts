/** Photos des candidats dans KV : vérification du format et stockage. */
import { jeton } from "./session";

// Le navigateur recadre la photo (720 × 900, JPEG) avant l'envoi : elle pèse alors
// quelques centaines de Ko et ne contient plus les métadonnées (position GPS, etc.).
export const TAILLE_MAX_PHOTO = 2 * 1024 * 1024;
export const FORMAT_NOM_PHOTO = /^[0-9a-f]{32}$/;

const ascii = (octets: Uint8Array, debut: number, fin: number) =>
  String.fromCharCode(...octets.subarray(debut, fin));

const SIGNATURES: [string, (octets: Uint8Array) => boolean][] = [
  ["image/jpeg", (o) => o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff],
  ["image/png", (o) => ascii(o, 1, 4) === "PNG"],
  ["image/webp", (o) => ascii(o, 0, 4) === "RIFF" && ascii(o, 8, 12) === "WEBP"],
];

export class PhotoInvalide extends Error {}

export async function enregistrerPhoto(kv: KVNamespace, fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX_PHOTO) {
    throw new PhotoInvalide("Photo trop lourde : 2 Mo maximum.");
  }
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const type = SIGNATURES.find(([, reconnait]) => reconnait(octets))?.[0];
  if (!type) {
    throw new PhotoInvalide("Fichier non reconnu : envoyez une photo au format JPEG ou PNG.");
  }
  const nom = jeton(16);
  await kv.put(nom, octets, { metadata: { type } });
  return nom;
}
