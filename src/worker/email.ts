import { WorkerMailer } from "worker-mailer";
import { APP_NAME } from "../shared/app.ts";

export class EmailError extends Error {}

/** Envoie le code de connexion. En local (EMAIL_MODE=console), il est simplement affiche. */
export async function sendLoginCode(env: Env, to: string, code: string, siteUrl: string): Promise<void> {
  if (env.EMAIL_MODE === "console") {
    console.log(`\n  ✉  Code de connexion pour ${to} : ${code}\n`);
    return;
  }
  if (!env.SMTP_USER || !env.SMTP_PASS) throw new EmailError("Envoi d'email non configuré.");
  const port = Number(env.SMTP_PORT || "465");
  const mailer = await WorkerMailer.connect({
    host: env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    startTls: port !== 465,
    // Google affiche le mot de passe d'application par groupes de 4 : on retire les espaces
    credentials: { username: env.SMTP_USER.trim(), password: env.SMTP_PASS.replace(/\s+/g, "") },
    authType: ["plain", "login"],
    socketTimeoutMs: 15000,
    responseTimeoutMs: 15000,
  });
  try {
    await mailer.send({
      from: { name: APP_NAME, email: env.SMTP_USER },
      to: { email: to },
      subject: `${code} est ton code ${APP_NAME}`,
      text: plainText(code, siteUrl),
      html: html(code, siteUrl),
    });
  } finally {
    await mailer.close().catch(() => {});
  }
}

function plainText(code: string, siteUrl: string): string {
  return [
    `Ton code de connexion ${APP_NAME} : ${code}`,
    "",
    "Il est valable 10 minutes. Si tu n'as rien demandé, ignore simplement cet email.",
    "",
    siteUrl,
  ].join("\n");
}

function html(code: string, siteUrl: string): string {
  const digits = code
    .split("")
    .map(
      (d) =>
        `<td style="width:44px;height:56px;background:#1d2b25;border:1px solid #3c5a4c;border-radius:10px;font:700 30px Georgia,serif;color:#f6ecd4;text-align:center">${d}</td>`,
    )
    .join('<td style="width:8px"></td>');
  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:#0c1713;padding:32px 12px;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="460" cellspacing="0" cellpadding="0" style="max-width:460px;background:#13241d;border:1px solid #2c4639;border-radius:18px;padding:32px">
<tr><td style="font:italic 700 26px Georgia,serif;color:#e8c77a;text-align:center;padding-bottom:6px">${APP_NAME}</td></tr>
<tr><td style="font-size:15px;color:#cfc6b3;text-align:center;padding-bottom:24px">Voici ton code pour te connecter :</td></tr>
<tr><td align="center"><table role="presentation" cellspacing="0" cellpadding="0"><tr>${digits}</tr></table></td></tr>
<tr><td style="font-size:13px;color:#93a39a;text-align:center;padding-top:24px;line-height:1.5">Il est valable 10 minutes.<br>Si tu n'as rien demandé, ignore simplement cet email.</td></tr>
<tr><td style="text-align:center;padding-top:20px"><a href="${siteUrl}" style="color:#e8c77a;font-size:13px">${siteUrl.replace(/^https?:\/\//, "")}</a></td></tr>
</table></td></tr></table></body></html>`;
}
