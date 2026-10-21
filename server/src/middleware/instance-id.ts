import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

export function instanceId(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Instance-Id', config.instanceId);
  next();
}
