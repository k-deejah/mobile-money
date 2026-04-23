import { Router, Request, Response } from 'express';
import { generateToken, verifyToken, JWTPayload, generateRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { createSSORouter } from '../auth/sso';
import { createOIDCRouter, initializeOIDCProviders } from '../auth/oidc';
import { enforceSSOForEmployees } from '../middleware/ssoEnforcement';
import { tokenController } from '../controllers/tokenController';
import { authenticateToken } from '../middleware/auth';
import { authenticateUser, getUserPermissions, User } from '../services/userService';
import { verifyTOTPToken, verifyBackupCode, is2FAEnabled } from '../auth/2fa';
import { evaluateAdminLoginAnomaly } from '../services/loginAnomaly';

export const authRoutes = Router();

// Initialize OIDC Strategy (Google/Azure)
initializeOIDCProviders();

// Mount SSO routes
authRoutes.use('/sso', createSSORouter());
authRoutes.use('/sso/oidc', createOIDCRouter());

/**
 * POST /api/auth/login
 * 
 * Example login endpoint that generates a JWT token
 * In a real application, this would validate user credentials against a database
 */
authRoutes.post('/login', async (req: Request, res: Response) => {
  const { phone_number } = req.body;

  if (!phone_number) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'phone_number is required',
    });
  }

  try {
    const user = await authenticateUser(phone_number);

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }

      const anomaly = await evaluateAdminLoginAnomaly(req, user);

      if (anomaly.suspicious) {
        if (!is2FAEnabled(user)) {
          return res.status(403).json({
            error: 'Suspicious admin login detected',
            message:
              'Anomalous admin login was blocked. Enable two-factor authentication and retry.',
            requiresTwoFactor: true,
            anomaly: anomaly.reason,
          });
        }

        const twoFactorToken = req.headers['x-2fa-token'] as string | undefined;
        const backupCode = req.body['backupCode'] || req.body['backup_code'];

        let verified2fa = false;

        if (twoFactorToken && user.two_factor_secret) {
          verified2fa = verifyTOTPToken(user.two_factor_secret, twoFactorToken);
        }

        if (!verified2fa && backupCode && user.backup_codes) {
          const backupCodes = user.backup_codes.map((item, index) =>
            typeof item === 'string'
              ? {
                  id: String(index),
                  code_hash: item,
                  used: false,
                  created_at: new Date(),
                }
              : item,
          );
          const verification = await verifyBackupCode(backupCode, backupCodes);
          verified2fa = verification.valid;
        }

        if (!verified2fa) {
          return res.status(403).json({
            error: 'Two-factor authentication required',
            message:
              'Suspicious admin login detected. Provide X-2FA-Token header or backupCode to continue.',
            requiresTwoFactor: true,
            anomaly: anomaly.reason,
          });
        }
      }

      const payload = {
        userId: user.id,
        email: user.phone_number,
        role: user.role_name || 'user',
      };

      const token = generateToken(payload);
      const refreshToken = await generateRefreshToken(user.id);
      const permissions = await getUserPermissions(user.id);

      res.json({
        message: 'Login successful',
        token,
        refreshToken,
        user: {
          userId: user.id,
          email: user.phone_number,
          role: user.role_name || 'user',
          permissions,
        },
      });
  } catch (error) {
    res.status(500).json({
      error: 'Token generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/auth/refresh
 *
 * Rotates refresh token, issues new access and refresh tokens, and enforces strict rotation
 */
authRoutes.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({
      error: 'Missing refresh token',
      message: 'Refresh token is required'
    });
  }
  try {
    // Verify and check for reuse
    const decoded = await verifyRefreshToken(refreshToken);
    // Issue new access and refresh tokens (rotate)
    const token = generateToken({ userId: decoded.userId, email: '' }); // You may want to fetch email if needed
    const newRefreshToken = await generateRefreshToken(decoded.userId, decoded.familyId, decoded.tokenId);
    res.json({
      message: 'Token rotation successful',
      token,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(401).json({
      error: 'Refresh failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/auth/tokens
 *
 * List all active refresh token
 */
authRoutes.get("/tokens/active/:family_id", authenticateToken, tokenController.findAll);

/**
 * DELETE /api/auth/tokens
 *
 * Delete all refresh token
 */ 
authRoutes.delete("/tokens/revoke-all/:family_id", authenticateToken, tokenController.revokeAll);

/**
 * DELETE /api/auth/tokens
 *
 * Delete a specific refresh token
 */ 
authRoutes.delete("/tokens/:token_id/:family_id", authenticateToken, tokenController.revoke);

/**
 * POST /api/auth/verify
 * 
 * Verify a JWT token and return the decoded payload
 */
authRoutes.post('/verify', (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      error: 'Missing token',
      message: 'Token is required for verification'
    });
  }

  try {
    const payload = verifyToken(token);
    res.json({
      valid: true,
      payload
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Token verification failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/auth/me
 * 
 * Protected route that returns current user information
 * Requires valid JWT token in Authorization header
 */
authRoutes.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const payload = req.jwtUser as JWTPayload;

  if (!payload) {
    return res.status(401).json({
      error: 'Access denied',
      message: 'No token provided',
    });
  }

  try {
    const permissions = await getUserPermissions(payload.userId);

    res.json({
      user: {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        permissions,
      },
      tokenInfo: {
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to fetch user info',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
