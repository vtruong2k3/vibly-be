import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

// RFC 6238 TOTP — 30s period, 6 digits, SHA1
// Implemented with Node built-in crypto to avoid otplib version complexity
@Injectable()
export class TotpService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly encryptionKey: Buffer;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('auth.totpEncryptionKey') ?? '';
    this.encryptionKey = Buffer.from(key.padEnd(64, '0').slice(0, 64), 'hex');
  }

  // Generate TOTP secret + QR code data URL for setup flow
  async generateSecret(email: string): Promise<{
    encryptedSecret: string;
    otpauthUrl: string;
    qrDataUrl: string;
  }> {
    // 20-byte secret (RFC 4226 minimum)
    const secretBytes = crypto.randomBytes(20);
    const base32Secret = this.base32Encode(secretBytes);

    // Standard otpauth URI format
    const issuer = encodeURIComponent('Vibly Admin');
    const account = encodeURIComponent(email);
    const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${base32Secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    const encryptedSecret = this.encrypt(base32Secret);

    return { encryptedSecret, otpauthUrl, qrDataUrl };
  }

  // Verify a 6-digit TOTP code — checks current window ± 1
  verifyToken(encryptedSecret: string, token: string): boolean {
    try {
      const base32Secret = this.decrypt(encryptedSecret);
      const secretBytes = this.base32Decode(base32Secret);

      const now = Math.floor(Date.now() / 1000);
      // Allow 1 step drift (±30s) for clock skew
      for (const offset of [-1, 0, 1]) {
        const counter = Math.floor((now + offset * 30) / 30);
        const expected = this.generateHotp(secretBytes, counter);
        if (token === expected) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Generate 8 single-use backup codes
  generateBackupCodes(): { plain: string[]; hashed: string[] } {
    const plain = Array.from({ length: 8 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );
    const hashed = plain.map((code) =>
      crypto.createHash('sha256').update(code).digest('hex'),
    );
    return { plain, hashed };
  }

  // --- RFC 4226 HOTP implementation ---
  private generateHotp(secret: Buffer, counter: number): string {
    const buf = Buffer.allocUnsafe(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return (code % 1_000_000).toString().padStart(6, '0');
  }

  // --- AES-256-CBC encrypt/decrypt ---
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, encryptedHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  // --- Base32 encode/decode (RFC 4648) ---
  private readonly BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  private base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += this.BASE32_CHARS[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += this.BASE32_CHARS[(value << (5 - bits)) & 31];
    }
    return output;
  }

  private base32Decode(input: string): Buffer {
    const s = input.toUpperCase().replace(/=+$/, '');
    const bytes: number[] = [];
    let bits = 0;
    let value = 0;
    for (const char of s) {
      const idx = this.BASE32_CHARS.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }
}
