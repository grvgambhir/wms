/** JSON contracts shared by mock and future REST repository implementations. */
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  cursor?: string;
};

export type NormalizedApiError = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};

