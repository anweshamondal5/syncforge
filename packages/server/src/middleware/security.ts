import { Request, Response, NextFunction } from 'express';

// Strict validation regex for Document IDs (alphanumeric, hyphens, underscores, 1-128 chars)
const DOC_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validates document ID to prevent directory traversal, SQL injection, and buffer overflows.
 */
export function isValidDocId(docId: any): boolean {
  if (typeof docId !== 'string') return false;
  return DOC_ID_REGEX.test(docId.trim());
}

/**
 * Strips HTML tags and controls characters to prevent stored XSS and log injection.
 */
export function sanitizeString(input: any, maxLength: number = 255): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim()
    .substring(0, maxLength);
}

/**
 * In-memory sliding window rate limiter for Express routes.
 */
export function createRateLimiter(options: { windowMs: number; maxRequests: number; message?: string }) {
  const { windowMs, maxRequests, message = 'Too many requests, please try again later.' } = options;
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  // Cleanup expired entries every minute
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of requestCounts.entries()) {
      if (now > data.resetTime) {
        requestCounts.delete(ip);
      }
    }
  }, 60000);
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const clientData = requestCounts.get(ip);

    if (!clientData || now > clientData.resetTime) {
      requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    clientData.count++;
    if (clientData.count > maxRequests) {
      const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: retryAfter,
      });
    }

    next();
  };
}

/**
 * Security headers middleware to protect against clickjacking, MIME sniffing, and XSS.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}
