/** The authenticated user attached to each request. */
export interface AuthUser {
  id: string;
  email: string | null;
}
