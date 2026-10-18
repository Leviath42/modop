import { TOTP } from "otpauth";

// Secret de développement uniquement ; en production, fournir MODOP_TOTP_SECRET (base32).
const DEV_SECRET = "ONSWG4TFOQWWWZLZ";

function makeTotp(): TOTP {
  return new TOTP({
    issuer: "Modop",
    label: "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: process.env.MODOP_TOTP_SECRET || DEV_SECRET,
  });
}

// MFA active uniquement si un secret est fourni via l'environnement.
export function isTotpEnabled(): boolean {
  return Boolean(process.env.MODOP_TOTP_SECRET);
}

// Génération et validation des codes TOTP
export function generateTOTPCode(): string {
  return makeTotp().generate();
}

export function validateTOTPCode(code: string): boolean {
  return makeTotp().validate({ token: code, window: 1 }) !== null;
}
