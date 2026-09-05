import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error } from './lib/response';
import { getMethods } from './routes/getMethods';
import { getCategories } from './routes/getCategories';
import { getExpenses } from './routes/getExpenses';
import { postExpenses } from './routes/postExpenses';

type Route = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

// Keyed by "<METHOD> <resource path>" as API Gateway reports it in event.resource.
const routes: Record<string, Route> = {
  'GET /methods': getMethods,
  'GET /categories': getCategories,
  'GET /expenses': getExpenses,
  'POST /expenses': postExpenses,
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const key = `${event.httpMethod} ${event.resource}`;
  const route = routes[key];
  if (!route) {
    return error(404, 'NOT_FOUND', `No route for ${key}`);
  }
  try {
    return await route(event);
  } catch (e) {
    console.error(e);
    return error(500, 'INTERNAL_ERROR', 'Unexpected error');
  }
};
