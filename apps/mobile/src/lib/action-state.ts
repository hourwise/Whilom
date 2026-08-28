import type { ZodError } from 'zod';

export type ActionStatus = 'idle' | 'validating' | 'submitting' | 'success' | 'error';

export interface ActionState<T = void> {
  status: ActionStatus;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export const idleAction = <T = void>(): ActionState<T> => ({ status: 'idle' });

export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message]));
}

export function actionError<T = void>(error: unknown, fallback: string): ActionState<T> {
  return { status: 'error', error: error instanceof Error ? error.message : fallback };
}
