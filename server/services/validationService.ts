import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Common validation schemas
export const schemas = {
  // User validation
  userId: z.string().uuid('Invalid user ID format'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username too long'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  email: z.string().email('Invalid email format').optional(),
  
  // Video validation
  videoId: z.string().uuid('Invalid video ID format'),
  filename: z.string().min(1, 'Filename required').max(255, 'Filename too long'),
  
  // API key validation
  openaiApiKey: z.string()
    .min(20, 'OpenAI API key too short')
    .max(200, 'OpenAI API key too long')
    .regex(/^sk-/, 'Invalid OpenAI API key format - must start with sk-'),
  
  // Clip validation
  clipId: z.string().uuid('Invalid clip ID format'),
  clipName: z.string().min(1, 'Clip name required').max(100, 'Clip name too long'),
  startTime: z.number().min(0, 'Start time must be non-negative'),
  endTime: z.number().min(0, 'End time must be non-negative'),
  
  // File validation
  fileSize: z.number().max(50 * 1024 * 1024, 'File size exceeds 50MB limit'),
  mimeType: z.enum(['video/mp4', 'video/webm', 'video/quicktime'], {
    errorMap: () => ({ message: 'Only MP4, WebM, and MOV video files are allowed' })
  })
};

// Validation middleware factory
export function validateBody<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation error',
          details: result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      
      // Attach validated data
      req.validatedBody = result.data;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Validation service error' });
    }
  };
}

export function validateParams<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.params);
      if (!result.success) {
        return res.status(400).json({
          error: 'Invalid parameters',
          details: result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      
      // Attach validated data
      req.validatedParams = result.data;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Validation service error' });
    }
  };
}

export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      if (!result.success) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      
      // Attach validated data
      req.validatedQuery = result.data;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Validation service error' });
    }
  };
}

// Common validation schemas for endpoints
export const validationSchemas = {
  // User endpoints
  register: z.object({
    username: schemas.username,
    password: schemas.password,
    email: schemas.email
  }),
  
  login: z.object({
    username: schemas.username,
    password: schemas.password
  }),
  
  updateApiKey: z.object({
    apiKey: schemas.openaiApiKey
  }),
  
  // Video endpoints
  videoParams: z.object({
    id: schemas.videoId
  }),
  
  createClip: z.object({
    name: schemas.clipName,
    startTime: schemas.startTime,
    endTime: schemas.endTime
  }).refine(data => data.endTime > data.startTime, {
    message: 'End time must be greater than start time',
    path: ['endTime']
  }),
  
  // Clip endpoints
  clipParams: z.object({
    id: schemas.clipId
  }),
  
  updateClip: z.object({
    name: schemas.clipName.optional(),
    startTime: schemas.startTime.optional(),
    endTime: schemas.endTime.optional()
  })
};

// File validation helpers
export function validateVideoFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > 50 * 1024 * 1024) {
    return { valid: false, error: 'File size exceeds 50MB limit' };
  }
  
  // Check MIME type
  const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowedTypes.includes(file.mimetype)) {
    return { valid: false, error: 'Only MP4, WebM, and MOV video files are allowed' };
  }
  
  // Check file extension
  const allowedExtensions = ['.mp4', '.webm', '.mov'];
  const fileExtension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
    return { valid: false, error: 'Invalid file extension' };
  }
  
  return { valid: true };
}

// Sanitization helpers
export function sanitizeFilename(filename: string): string {
  // Remove or replace potentially dangerous characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '_') // Replace dangerous characters
    .replace(/\.\./g, '_') // Remove path traversal attempts
    .replace(/^\./, '_') // Remove leading dots
    .slice(0, 255); // Limit length
}

export function sanitizeText(text: string): string {
  // Basic HTML/script injection prevention
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .trim();
}

// Express type augmentation for validated data
declare global {
  namespace Express {
    interface Request {
      validatedBody?: any;
      validatedParams?: any;
      validatedQuery?: any;
    }
  }
}