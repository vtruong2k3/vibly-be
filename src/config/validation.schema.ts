import { IsString, IsNumber, IsOptional } from 'class-validator';

// Validated at startup — NestJS @nestjs/config ConfigModule
export class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  NODE_ENV: string = 'development';

  @IsString()
  @IsOptional()
  REDIS_URL: string;

  @IsString()
  @IsOptional()
  AWS_REGION: string;

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID: string;

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsOptional()
  AWS_S3_BUCKET: string;

  @IsString()
  @IsOptional()
  LIVEKIT_API_KEY: string;

  @IsString()
  @IsOptional()
  LIVEKIT_API_SECRET: string;

  @IsString()
  @IsOptional()
  LIVEKIT_HOST: string;

  @IsString()
  @IsOptional()
  ALLOWED_ORIGINS: string;
}
