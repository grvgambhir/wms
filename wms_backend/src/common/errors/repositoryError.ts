import type { NormalizedApiError } from '@wms/domain';

/** Error used by mock/API repositories so query consumers see one stable shape. */
export class RepositoryError extends Error implements NormalizedApiError {
  readonly code: string;
  readonly fields?: Record<string, string>;
  /** A narrow route-level override where one stable problem code has two HTTP semantics. */
  readonly httpStatus?: number;

  constructor(error: NormalizedApiError & { httpStatus?: number }) {
    super(error.message);
    this.name = 'RepositoryError';
    this.code = error.code;
    this.fields = error.fields;
    this.httpStatus = error.httpStatus;
  }

  toJSON(): NormalizedApiError {
    return { code: this.code, message: this.message, fields: this.fields };
  }
}
