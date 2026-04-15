import { requireUserSession } from './auth/session';

export function middleware() {
  return requireUserSession();
}
