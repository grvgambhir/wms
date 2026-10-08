import { RepositoryError } from '../common/errors/repositoryError';

/** Throw a refusal whose `message` is an i18n key (PLT-02) — never a sentence. */
export function refuse(
  code: string,
  messageKey: string,
  fields?: Record<string, string>,
  httpStatus?: number,
): never {
  throw new RepositoryError({ code, message: messageKey, fields, httpStatus });
}
