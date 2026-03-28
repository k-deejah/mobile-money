import { Router, Request, Response } from 'express';
import { generateToken, verifyToken, JWTPayload, generateRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { evaluateGeoLoginAccess } from '../auth/geo';

export const authRoutes = Router();

/**
 * POST /api/auth/login
 * 
 * Example login endpoint that generates a JWT token
 * In a real application, this would validate user credentials against a database
 */
authRoutes.post('/login', async (req: Request, res: Response) => {
  const { userId, email } = req.body;

  // Basic validation
  if (!userId || !email) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'userId and email are required'
    });
  }

  try {
    const geoAccess = await evaluateGeoLoginAccess(req);
    if (!geoAccess.allowed) {
      return res.status(403).json({
        error: 'Geographic restriction',
        message: geoAccess.reason ?? 'Login is not permitted from your region'
      });
    }

    // Generate JWT token
    const token = generateToken({ userId, email });
    // Generate refresh token (new family)
    const refreshToken = await generateRefreshToken(userId);

    res.json({
      message: 'Login successful',
      token,
      refreshToken,
      user: {
        userId,
        email
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Token generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
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
authRoutes.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Access denied',
      message: 'No token provided'
    });
  }

  try {
    const payload = verifyToken(token);
    res.json({
      user: {
        userId: payload.userId,
        email: payload.email
      },
      tokenInfo: {
        issuedAt: payload.iat,
        expiresAt: payload.exp
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Token has expired') {
        res.status(401).json({
          error: 'Token expired',
          message: 'Please log in again'
        });
      } else if (error.message === 'Invalid token') {
        res.status(401).json({
          error: 'Invalid token',
          message: 'Token is malformed or tampered with'
        });
      } else {
        res.status(401).json({
          error: 'Authentication failed',
          message: error.message
        });
      }
    } else {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Unknown error occurred'
      });
    }
  }
});
