import pino from "pino";
import { env } from "./env.js";

export const journal = pino({
  level: env.NIVEAU_LOG,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
  redact: ["*.motDePasse", "*.motDePasseHash", "*.jetonHash", "req.headers.authorization"],
});
