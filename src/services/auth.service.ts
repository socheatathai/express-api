import { compare, hash } from 'bcryptjs';
import { SignJWT } from 'jose';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../utils/http-error.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';

const accessTokenLifetimeSeconds = 60 * 60;

function getPasswordHashRounds(): number {
  const rounds = Number(process.env.PASSWORD_HASH_ROUNDS ?? 12);

  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
    throw new Error('PASSWORD_HASH_ROUNDS must be an integer between 10 and 15');
  }

  return rounds;
}

function getTokenSecret(): Uint8Array {
  const secret = process.env.AUTH_TOKEN_SECRET;

  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_TOKEN_SECRET must be configured with at least 32 bytes');
  }

  return new TextEncoder().encode(secret);
}

async function createAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('gz-buy-api')
    .setAudience('gz-buy-client')
    .setIssuedAt()
    .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
    .sign(getTokenSecret());
}

function toPublicUser(user: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
  };
}

async function createSession(user: Parameters<typeof toPublicUser>[0]) {
  return {
    user: toPublicUser(user),
    accessToken: await createAccessToken(user.id),
    tokenType: 'Bearer',
    expiresIn: accessTokenLifetimeSeconds,
  };
}

export async function registerUser(input: RegisterInput) {
  const passwordHash = await hash(input.password, getPasswordHashRounds());
  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      passwordHash,
    },
  });

  return createSession(user);
}

export async function loginUser(input: LoginInput) {
  const identifier = input.identifier.trim();
  const user = await prisma.user.findFirst({
    where: identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { phone: identifier },
  });

  if (!user || user.status !== 'ACTIVE' || !(await compare(input.password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid credentials');
  }

  return createSession(user);
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || user.status !== 'ACTIVE') {
    throw new HttpError(401, 'Account is unavailable');
  }

  return toPublicUser(user);
}

export { accessTokenLifetimeSeconds, getTokenSecret };