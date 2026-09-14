import type { Context } from "hono";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { STATUTS, candidaturesOuvertes } from "./db";
import { prendreMessages } from "./session";
import type { AppEnv } from "./types";
import type { Commun } from "./vues/commun";

/** Données communes à toutes les pages ; consomme les messages en attente. */
export function commun(c: Context<AppEnv>): Commun {
  const parametres = c.get("parametres");
  const session = c.get("session");
  return {
    titre: parametres.titre,
    statut: parametres.statut,
    libelleStatut: STATUTS[parametres.statut] ?? parametres.statut,
    candidaturesOuvertes: candidaturesOuvertes(parametres),
    csrf: session.csrf,
    adminConnecte: Boolean(session.admin),
    messages: prendreMessages(c),
  };
}

export function rendre(c: Context<AppEnv>, page: HtmlEscapedString | Promise<HtmlEscapedString>) {
  return c.html(html`<!doctype html>${page}`);
}

export function texte(corps: Record<string, unknown>, cle: string): string {
  const valeur = corps[cle];
  return typeof valeur === "string" ? valeur : "";
}

/** Texte sur une ligne : espaces multiples réduits, longueur limitée. */
export function ligne(valeur: string, max: number): string {
  return valeur.split(/\s+/).filter(Boolean).join(" ").slice(0, max);
}

export function ipClient(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") ?? "local";
}
