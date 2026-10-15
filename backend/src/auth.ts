import { betterAuth } from 'better-auth';
import { admin as adminPlugin } from 'better-auth/plugins';
import { pool } from './database.js';
import {
  adminRole,
  authAccess,
  ownerRole,
  userRole,
} from './auth-permissions.js';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:8080';
const trustedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  appName: 'Smart Access',
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  advanced: {
    useSecureCookies: baseURL.startsWith('https://'),
    database: {
      joins: true,
    },
  },
  plugins: [
    adminPlugin({
      ac: authAccess,
      roles: {
        owner: ownerRole,
        admin: adminRole,
        user: userRole,
      },
      defaultRole: 'user',
    }),
  ],
});
