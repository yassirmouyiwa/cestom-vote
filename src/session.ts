/** Session dans un cookie signé (HMAC-SHA256) : jeton CSRF, connexion du comité, code de vote, messages. */
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "./types";

const NOM_COOKIE = "session";
const DUREE_SECONDES = 7 * 24 * 3600;

export type Categorie = "erreur" | "succes" | "info";

export interface Session {
  csrf: string;
  admin?: boolean;
  code?: string;
  // Code affiché au membre juste après son inscription, pendant une durée limitée.
  inscription?: { code: string; nom: string; telephone: string; expire: number };
  messages?: [Categorie, string][];
}

export function jeton(octets = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(octets)), (o) => o.toString(16).padStart(2, "0")).join("");
}

export function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function versBase64url(octets: Uint8Array): string {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function depuisBase64url(texte: string): Uint8Array {
  return Uint8Array.from(atob(texte.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

function cleHmac(secret: string) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

async function lire(valeur: string | undefined, secret: string): Promise<Session | null> {
  const [donnees, signature] = (valeur ?? "").split(".");
  if (!donnees || !signature) return null;
  try {
    const valide = await crypto.subtle.verify(
      "HMAC", await cleHmac(secret), depuisBase64url(signature), new TextEncoder().encode(donnees),
    );
    if (!valide) return null;
    const session = JSON.parse(new TextDecoder().decode(depuisBase64url(donnees)));
    return typeof session?.csrf === "string" ? session : null;
  } catch {
    return null;
  }
}

async function signer(session: Session, secret: string): Promise<string> {
  const donnees = versBase64url(new TextEncoder().encode(JSON.stringify(session)));
  const signature = await crypto.subtle.sign("HMAC", await cleHmac(secret), new TextEncoder().encode(donnees));
  return `${donnees}.${versBase64url(new Uint8Array(signature))}`;
}

export const sessions: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secret = c.env.SECRET_KEY;
  if (!secret) return c.text("Configuration incomplète : définissez le secret SECRET_KEY.", 500);

  const existante = await lire(getCookie(c, NOM_COOKIE), secret);
  const avant = existante ? JSON.stringify(existante) : "";
  c.set("session", existante ?? { csrf: jeton() });
  await next();

  const apres = JSON.stringify(c.get("session"));
  if (apres !== avant) {
    const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
    const valeur = await signer(c.get("session"), secret);
    c.res.headers.append(
      "Set-Cookie", `${NOM_COOKIE}=${valeur}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DUREE_SECONDES}${secure}`,
    );
  }
};

export function message(c: Context<AppEnv>, texte: string, categorie: Categorie = "info") {
  const session = c.get("session");
  session.messages = [...(session.messages ?? []), [categorie, texte]];
}

export function prendreMessages(c: Context<AppEnv>): [Categorie, string][] {
  const session = c.get("session");
  const messages = session.messages ?? [];
  delete session.messages;
  return messages;
}
