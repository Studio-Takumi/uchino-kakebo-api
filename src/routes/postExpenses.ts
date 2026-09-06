import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v7 as uuidv7 } from 'uuid';
import { error, json, type ErrorDetail } from '../lib/response';
import { getSupabase, getUserId } from '../lib/supabase';

const COLUMNS =
  'id, date, expenses, title, emoji, method_id, category_id, comment, created_time, last_edited_time';

// Strict YYYY-MM-DD that also rejects impossible dates (e.g. 2026-02-31).
const isValidDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

type NewRow = {
  id: string;
  user_id: string;
  created_time: string;
  last_edited_time: string;
  title: string;
  emoji: string;
  expenses: number;
  comment: string;
  date: string;
  method_id: string;
  category_id: string;
};

/**
 * POST /expenses
 *
 * Bulk-add expenses. Body is a bare JSON array of items. Atomic: if any item is
 * invalid, insert nothing and return 400 with per-item details.
 *
 * Server-generated per row (client values ignored): id (uuidv7), user_id,
 * created_time, last_edited_time. emoji defaults to the category's default
 * emoji; comment defaults to "".
 */
export const postExpenses = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Parse body → must be a non-empty array.
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return error(400, 'BAD_REQUEST', 'request body must be valid JSON');
  }
  if (!Array.isArray(body)) {
    return error(400, 'BAD_REQUEST', 'request body must be a JSON array');
  }
  if (body.length === 0) {
    return error(400, 'BAD_REQUEST', 'request body must be a non-empty array');
  }

  const supabase = getSupabase();
  const userId = getUserId();

  // Load the user's methods + categories once, for id validation and the
  // category's default emoji.
  const [methodsRes, categoriesRes] = await Promise.all([
    supabase.from('methods').select('method_id').eq('user_id', userId),
    supabase.from('categories').select('category_id, emoji').eq('user_id', userId),
  ]);
  if (methodsRes.error || categoriesRes.error) {
    console.error('POST /expenses lookup error:', methodsRes.error ?? categoriesRes.error);
    return error(500, 'INTERNAL_ERROR', 'Failed to load methods/categories');
  }
  const methodIds = new Set((methodsRes.data ?? []).map((m) => m.method_id));
  const categoryEmoji = new Map(
    (categoriesRes.data ?? []).map((c) => [c.category_id, c.emoji as string]),
  );

  // Validate every item first; collect all errors before inserting anything.
  const now = new Date().toISOString();
  const details: ErrorDetail[] = [];
  const rows: NewRow[] = [];

  body.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      details.push({ index, message: 'item must be an object' });
      return;
    }
    const item = raw as Record<string, unknown>;
    const push = (field: string, message: string) => details.push({ index, field, message });

    if (!Number.isInteger(item.expenses) || (item.expenses as number) < 0) {
      push('expenses', 'must be an integer >= 0');
    }
    if (!isValidDate(item.date)) {
      push('date', 'must be a valid YYYY-MM-DD date');
    }
    if (typeof item.title !== 'string' || item.title.length === 0) {
      push('title', 'must be a non-empty string');
    }
    if (typeof item.method_id !== 'string' || !methodIds.has(item.method_id)) {
      push('method_id', 'method_id not found for user');
    }
    if (typeof item.category_id !== 'string' || !categoryEmoji.has(item.category_id)) {
      push('category_id', 'category_id not found for user');
    }
    if (item.emoji !== undefined && typeof item.emoji !== 'string') {
      push('emoji', 'must be a string');
    }
    if (item.comment !== undefined && typeof item.comment !== 'string') {
      push('comment', 'must be a string');
    }

    // Only build the row if this item had no errors so far.
    if (!details.some((d) => d.index === index)) {
      const categoryId = item.category_id as string;
      rows.push({
        id: uuidv7(),
        user_id: userId,
        created_time: now,
        last_edited_time: now,
        title: item.title as string,
        emoji:
          item.emoji !== undefined && item.emoji !== ''
            ? (item.emoji as string)
            : (categoryEmoji.get(categoryId) ?? ''),
        expenses: item.expenses as number,
        comment: (item.comment as string) ?? '',
        date: item.date as string,
        method_id: item.method_id as string,
        category_id: categoryId,
      });
    }
  });

  if (details.length > 0) {
    return error(
      400,
      'VALIDATION_ERROR',
      `${new Set(details.map((d) => d.index)).size} of ${body.length} items are invalid; nothing was inserted.`,
      details,
    );
  }

  // Atomic: a single insert of the array is all-or-nothing.
  const { data, error: dbError } = await supabase.from('expenses').insert(rows).select(COLUMNS);
  if (dbError) {
    console.error('POST /expenses insert error:', dbError);
    return error(500, 'INTERNAL_ERROR', 'Failed to insert expenses');
  }

  return json(201, { inserted: data?.length ?? 0, items: data ?? [] });
};
