import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';
import * as argon2 from 'argon2';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
        if (key === 'auth.argon2MemoryCost') return 4096; // Lower config for faster tests
        if (key === 'auth.argon2TimeCost') return 1;
        if (key === 'auth.argon2Parallelism') return 1;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hash and verify', () => {
    it('should correctly hash and verify a password natively without mock', async () => {
      const password = 'mySuperSecretPassword123!';
      const hash = await service.hash(password);

      expect(hash).toBeDefined();
      expect(hash).not.toEqual(password);
      expect(hash.startsWith('$argon2')).toBe(true);

      const isValid = await service.verify(hash, password);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'correctPassword123!';
      const wrongPassword = 'wrongPassword123!';

      const hash = await service.hash(password);
      const isValid = await service.verify(hash, wrongPassword);

      expect(isValid).toBe(false);
    });
  });
});
