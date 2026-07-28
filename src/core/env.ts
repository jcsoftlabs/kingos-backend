import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  URL_PUBLIQUE: z.string().url(),
  URL_FRONTEND: z.string().url(),

  JETON_SERVICE: z.string().min(8),
  SECRET_SESSION: z.string().min(8),
  SEL_IP: z.string().min(8),

  CLOUDINARY_URL: z.string().min(1),

  MONCASH_CLIENT_ID: z.string().optional(),
  MONCASH_CLIENT_SECRET: z.string().optional(),
  MONCASH_MODE: z.enum(["sandbox", "production"]).default("sandbox"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_DEVISE_PRESENTATION: z.enum(["HTG", "USD"]).default("HTG"),

  NATCASH_MARCHAND_ID: z.string().optional(),
  NATCASH_CLE_API: z.string().optional(),
  NATCASH_MODE: z.enum(["sandbox", "production"]).default("sandbox"),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_EXPEDITEUR: z.string().default("Kingo's <commandes@kingos.ht>"),
  EMAIL_ADMIN: z.string().default("contact@kingos.ht"),

  SENTRY_DSN: z.string().optional(),
  NIVEAU_LOG: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const analyse = schema.safeParse(process.env);

if (!analyse.success) {
  console.error("Variables d'environnement invalides :");
  console.error(analyse.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = analyse.data;
