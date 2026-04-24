import sgMail from "@sendgrid/mail";
import { Transaction } from "../models/transaction";
import { resolveLocale, translate } from "../utils/i18n";

export interface LockoutEmailOptions {
  minutesRemaining: number;
  unlocksAt: Date;
  ipAddress?: string;
  locale?: string;
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");

export interface EmailOptions {
  to: string;
  templateId: string;
  dynamicTemplateData: Record<string, any>;
}

export class EmailService {
  private resolveTemplateId(
    baseEnvName: "SENDGRID_RECEIPT_TEMPLATE_ID" | "SENDGRID_FAILURE_TEMPLATE_ID",
    locale: string,
  ): string {
    const resolvedLocale = resolveLocale(locale).toUpperCase();
    const localizedEnvKey = `${baseEnvName}_${resolvedLocale}`;

    return process.env[localizedEnvKey] || process.env[baseEnvName] || "";
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      console.log("Skipping email send in test environment");
      return;
    }

    try {
      await sgMail.send({
        from: process.env.EMAIL_FROM || '"Mobile Money" <no-reply@mobilemoney.com>',
        ...options
      });
    } catch (error) {
      console.error("Email delivery failed:", error);
      // We don't throw here to prevent blocking the transaction flow
      // but in a real app, we might want to retry or log to a dedicated service
    }
  }

  async sendTransactionReceipt(
    email: string,
    transaction: Transaction,
    locale = "en",
  ): Promise<void> {
    const resolvedLocale = resolveLocale(locale);
    await this.sendEmail({
      to: email,
      templateId: this.resolveTemplateId(
        "SENDGRID_RECEIPT_TEMPLATE_ID",
        resolvedLocale,
      ),
      dynamicTemplateData: {
        amount: transaction.amount,
        type: transaction.type,
        typeLocalized: translate(
          `email.transaction_type.${transaction.type}`,
          resolvedLocale,
        ),
        referenceNumber: transaction.referenceNumber,
        provider: transaction.provider.toUpperCase(),
        phoneNumber: transaction.phoneNumber,
        stellarAddress: transaction.stellarAddress,
        createdAt: new Date(transaction.createdAt).toLocaleString(resolvedLocale),
        locale: resolvedLocale,
        year: new Date().getFullYear(),
      },
    });
  }

  async sendAccountLockoutNotification(
    email: string,
    options: LockoutEmailOptions,
  ): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      console.log("Skipping lockout email in test environment");
      return;
    }

    const { minutesRemaining, unlocksAt, ipAddress, locale = "en" } = options;
    const resolvedLocale = resolveLocale(locale);

    const templateId = process.env.SENDGRID_LOCKOUT_TEMPLATE_ID;
    const from =
      process.env.EMAIL_FROM || '"Mobile Money" <no-reply@mobilemoney.com>';

    try {
      if (templateId) {
        await sgMail.send({
          from,
          to: email,
          templateId,
          dynamicTemplateData: {
            minutesRemaining,
            unlocksAt: unlocksAt.toISOString(),
            unlocksAtLocalized: unlocksAt.toLocaleString(resolvedLocale),
            ipAddress: ipAddress ?? "unknown",
            locale: resolvedLocale,
            year: new Date().getFullYear(),
          },
        });
      } else {
        // Inline HTML fallback — no template required in SendGrid.
        const unlockTime = unlocksAt.toLocaleString(resolvedLocale);
        const ipNote = ipAddress
          ? `<p style="color:#666;font-size:13px;">Request originated from IP: ${ipAddress}</p>`
          : "";

        await sgMail.send({
          from,
          to: email,
          subject: "Your account has been temporarily locked",
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
              <h2 style="color:#c0392b">Account Temporarily Locked</h2>
              <p>We detected multiple failed login attempts on your Mobile Money account.</p>
              <p>For your security, your account has been <strong>temporarily locked for ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}</strong>.</p>
              <p>You will be able to log in again after:<br>
                <strong>${unlockTime}</strong>
              </p>
              ${ipNote}
              <p>If this wasn't you, please contact our support team immediately.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
              <p style="color:#999;font-size:12px">
                &copy; ${new Date().getFullYear()} Mobile Money. This is an automated security notification.
              </p>
            </div>
          `,
          text:
            `Your Mobile Money account has been temporarily locked due to multiple failed login attempts.\n\n` +
            `You can try again in ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"} (after ${unlockTime}).\n\n` +
            `If this wasn't you, please contact support immediately.`,
        });
      }
    } catch (error) {
      console.error("[Email] Lockout notification delivery failed:", error);
    }
  }

  async sendTransactionFailure(
    email: string,
    transaction: Transaction,
    reason: string,
    locale = "en",
  ): Promise<void> {
    const resolvedLocale = resolveLocale(locale);
    await this.sendEmail({
      to: email,
      templateId: this.resolveTemplateId(
        "SENDGRID_FAILURE_TEMPLATE_ID",
        resolvedLocale,
      ),
      dynamicTemplateData: {
        amount: transaction.amount,
        type: transaction.type,
        typeLocalized: translate(
          `email.transaction_type.${transaction.type}`,
          resolvedLocale,
        ),
        referenceNumber: transaction.referenceNumber,
        reason,
        reasonLabel: translate("email.labels.reason", resolvedLocale),
        locale: resolvedLocale,
        year: new Date().getFullYear(),
      },
    });
  }
}
