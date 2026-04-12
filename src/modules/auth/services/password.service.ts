import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';

// OWASP: Argon2id — winner of Password Hashing Competition
// Memory-hard algorithm resistant to GPU/ASIC attacks
@Injectable()
export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;

  constructor(private readonly config: ConfigService) {
    this.memoryCost = this.config.get<number>('auth.argon2MemoryCost', 65536);
    this.timeCost = this.config.get<number>('auth.argon2TimeCost', 3);
    this.parallelism = this.config.get<number>('auth.argon2Parallelism', 4);
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
