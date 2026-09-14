import type { Parametres } from "./db";
import type { Session } from "./session";

export interface Bindings {
  DB: D1Database;
  PHOTOS: KVNamespace;
  ADMIN_PASSWORD?: string;
  SECRET_KEY?: string;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: { session: Session; parametres: Parametres };
};
