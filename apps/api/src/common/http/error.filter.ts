import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { RequestValidationError } from '@ts-rest/nest';
import type { Response } from 'express';
import type { ZodError } from 'zod';
import { AppError } from './errors';
import { plainIssue, validationSentence } from './zod-words';

function fieldErrors(...errors: Array<ZodError | null | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const error of errors) {
    for (const issue of error?.issues ?? []) {
      const field = issue.path.join('.') || 'body';
      result[field] ??= plainIssue(issue);
    }
  }
  return result;
}

/** Every error leaves as `{ message, code, fieldErrors }`; unexpected ones are logged and hidden. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof AppError) {
      response.status(exception.status).json({
        message: exception.message,
        code: exception.code,
        ...(exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
      });
      return;
    }
    if (exception instanceof RequestValidationError) {
      const fields = fieldErrors(exception.body, exception.query, exception.pathParams);
      response.status(400).json({
        message: validationSentence(fields),
        code: 'invalid',
        fieldErrors: fields,
      });
      return;
    }
    if (exception instanceof HttpException) {
      if (exception.getStatus() === 413) {
        // The upload route stopped reading at its cap (videos 60 MB, others 25 MB).
        response.status(413).json({
          message:
            'This file is too large. Photos and papers: 25 MB, voice notes: 10 MB, videos: 60 MB.',
          code: 'too_large',
        });
        return;
      }
      response.status(exception.getStatus()).json({ message: exception.message, code: 'http' });
      return;
    }
    const detail =
      exception instanceof Error
        ? `${exception.name}: ${exception.message.replace(/params:[\s\S]*/i, 'params: [redacted]')}`
        : 'Non-error thrown';
    this.logger.error(detail, exception instanceof Error ? exception.stack : undefined);
    response
      .status(500)
      .json({ message: 'Something went wrong on our side. Please try again.', code: 'internal' });
  }
}
