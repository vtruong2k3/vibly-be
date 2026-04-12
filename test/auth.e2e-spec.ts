import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = `testuser_${Date.now()}@test.com`;

  it('/api/v1/auth/register (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: testEmail,
        username: `tester_${Date.now()}`,
        password: 'Password123!',
        displayName: 'Test User'
      })
      .expect(201); // Created
    
    expect(response.body).toHaveProperty('message');
  });

  it('/api/v1/auth/login (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'Password123!',
      });
      // Will expect 401 because email is not verified yet, which is correct behavior!
    
    expect(response.status).toBe(401);
    expect(response.body.message).toContain('Please verify your email address');
  });
});
