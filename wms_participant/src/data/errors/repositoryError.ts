import type { NormalizedApiError } from '@/domain/models/api';

/** Error used by mock/API repositories so query consumers see one stable shape. */
export class RepositoryError extends Error implements NormalizedApiError {
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(error: NormalizedApiError) {
    super(error.message);
    this.name = 'RepositoryError';
    this.code = error.code;
    this.fields = error.fields;
  }

  toJSON(): NormalizedApiError {
    return { code: this.code, message: this.message, fields: this.fields };
  }
}

