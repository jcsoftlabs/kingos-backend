import { createHash } from "node:crypto";
import { env } from "./env.js";

/** IP hachée et salée — statistiques sans conservation de données personnelles (plan §9.3, §11.3). */
export function hasherIp(ip: string): string {
  return createHash("sha256").update(`${env.SEL_IP}:${ip}`).digest("hex");
}
