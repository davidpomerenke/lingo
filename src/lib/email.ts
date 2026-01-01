import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMagicLinkEmail(
  to: string,
  token: string,
  baseUrl: string
): Promise<void> {
  const magicLink = `${baseUrl}/api/auth/verify?token=${token}`;

  await transporter.sendMail({
    from: `Lingo <${process.env.SMTP_USER}>`,
    to,
    subject: "Sign in to Lingo",
    text: `Click this link to sign in to Lingo: ${magicLink}\n\nThis link expires in 15 minutes.`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
          <div style="max-width: 400px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%); border-radius: 16px; padding: 40px; border: 1px solid #333;">
            <h1 style="color: #fff; font-size: 28px; margin: 0 0 8px 0; text-align: center;">
              ✨ Lingo
            </h1>
            <p style="color: #888; font-size: 14px; margin: 0 0 32px 0; text-align: center;">
              AI-Powered Language Learning
            </p>
            
            <p style="color: #ccc; font-size: 16px; margin: 0 0 24px 0; text-align: center;">
              Click the button below to sign in:
            </p>
            
            <a href="${magicLink}" style="display: block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; text-align: center; margin: 0 0 24px 0;">
              Sign in to Lingo
            </a>
            
            <p style="color: #666; font-size: 12px; margin: 0; text-align: center;">
              This link expires in 15 minutes.<br>
              If you didn't request this, you can safely ignore it.
            </p>
          </div>
        </body>
      </html>
    `,
  });
}

