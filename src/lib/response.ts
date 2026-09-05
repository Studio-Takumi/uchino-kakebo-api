import type { APIGatewayProxyResult } from 'aws-lambda';

const HEADERS = { 'Content-Type': 'application/json' };

export const json = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify(body),
});

export type ErrorDetail = { index?: number; field?: string; message: string };

export const error = (
  statusCode: number,
  code: string,
  message: string,
  details?: ErrorDetail[],
): APIGatewayProxyResult =>
  json(statusCode, { error: { code, message, ...(details ? { details } : {}) } });

export const notImplemented = (name: string): APIGatewayProxyResult =>
  error(501, 'NOT_IMPLEMENTED', `${name} is not implemented yet`);
