import { validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const message = typeof first.msg === 'string' ? first.msg : 'Nevalidni podaci';
    res.status(400).json({ error: message, errors: errors.array() });
    return;
  }
  next();
}

export function runValidations(validations: ValidationChain[]) {
  return [...validations, validate];
}
