export interface JwtPayload {
  sub: string; // userId
  email: string;
  operatorId: number;
  permissions: string[];
  iat?: number;
  exp?: number;
}
