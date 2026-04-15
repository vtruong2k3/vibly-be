import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendVerificationEmail(email: string, token: string) {
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyUrl = `${appUrl}/verify-email?token=${token}`;

    const html = `
      <div style="background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
          <div style="padding: 40px; text-align: center;">
            <h1 style="margin: 0; color: #09090b; font-size: 32px; font-weight: 800; letter-spacing: -0.025em;">Vibly</h1>
          </div>
          <div style="padding: 0 40px 40px 40px;">
            <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-top: 0; text-align: center;">Welcome aboard!</h2>
            <p style="color: #52525b; font-size: 16px; line-height: 24px; text-align: center; margin-bottom: 30px;">
              Thank you for joining our community. To ensure the security of your new account, please verify your email address.
            </p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${verifyUrl}" style="background-color: #09090b; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">Verify Email Address</a>
            </div>
            <p style="color: #71717a; font-size: 14px; line-height: 20px; text-align: center;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="text-align: center; font-size: 13px; word-break: break-all; margin-bottom: 0;">
              <a href="${verifyUrl}" style="color: #3b82f6; text-decoration: underline;">${verifyUrl}</a>
            </p>
          </div>
          <div style="background-color: #fafafa; padding: 30px 40px; border-top: 1px solid #f4f4f5; text-align: center;">
            <p style="color: #a1a1aa; font-size: 13px; margin: 0; line-height: 20px;">
              This link will expire in 24 hours.<br/>
              &copy; ${new Date().getFullYear()} Vibly. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;

    try {
      if (!process.env.SMTP_USER) {
        this.logger.warn(
          `SMTP not configured! Verification URL for ${email} is: ${verifyUrl}`,
        );
        return;
      }

      await this.transporter.sendMail({
        from: `"Vibly" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Verify your Vibly account',
        html,
      });

      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
    }
  }

  async sendPasswordResetEmail(email: string, token: string) {
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    const html = `
      <div style="background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
          <div style="padding: 40px; text-align: center;">
            <h1 style="margin: 0; color: #09090b; font-size: 32px; font-weight: 800; letter-spacing: -0.025em;">Vibly</h1>
          </div>
          <div style="padding: 0 40px 40px 40px;">
            <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-top: 0; text-align: center;">Reset your password</h2>
            <p style="color: #52525b; font-size: 16px; line-height: 24px; text-align: center; margin-bottom: 30px;">
              We received a request to reset the password for your Vibly account. Click the button below to choose a new password.
            </p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${resetUrl}" style="background-color: #09090b; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #71717a; font-size: 14px; line-height: 20px; text-align: center;">
              If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
            <div style="text-align: center; margin-top: 30px;">
              <p style="color: #71717a; font-size: 13px; margin-bottom: 4px;">Or copy and paste this link:</p>
              <a href="${resetUrl}" style="color: #3b82f6; text-decoration: underline; font-size: 13px; word-break: break-all;">${resetUrl}</a>
            </div>
          </div>
          <div style="background-color: #fafafa; padding: 30px 40px; border-top: 1px solid #f4f4f5; text-align: center;">
            <p style="color: #a1a1aa; font-size: 13px; margin: 0; line-height: 20px;">
              This link will securely expire in 2 hours.<br/>
              &copy; ${new Date().getFullYear()} Vibly. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;

    try {
      if (!process.env.SMTP_USER) {
        this.logger.warn(
          `SMTP not configured! Password reset URL for ${email} is: ${resetUrl}`,
        );
        return;
      }

      await this.transporter.sendMail({
        from: `"Vibly" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Reset your Vibly password',
        html,
      });

      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
    }
  }
}
