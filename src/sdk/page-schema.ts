import { field, objectSchema } from './schema.js';

export interface AutomationPage { offset: number; limit: number }

/** The advertised page limit and the parser share one value. */
export function pageSchema(maximum: number) {
  return objectSchema({ offset: field.integer({ minimum: 0 }), limit: field.integer({ minimum: 1, maximum }) });
}
