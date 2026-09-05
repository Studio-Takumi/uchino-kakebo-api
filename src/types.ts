// Mirrors the Supabase table columns. Column names == type field names.

export type Method = {
  method_id: string;
  method: string;
  color: string;
  priority: number;
  user_id?: string;
};

export type Category = {
  category_id: string;
  category: string;
  color: string;
  priority: number;
  emoji: string;
  method_id: string;
  is_income: boolean;
  user_id?: string;
};

export type Expense = {
  id: string;
  created_time: string; // ISO8601
  last_edited_time: string; // ISO8601
  title: string;
  emoji: string;
  expenses: number; // integer >= 0
  comment: string;
  date: string; // YYYY-MM-DD
  method_id: string;
  category_id: string;
  user_id?: string;
};

// Shape accepted by POST /expenses (one array element).
// Server generates id / created_time / last_edited_time / user_id and may
// fill emoji (from the category default) and comment (defaults to "").
export type NewExpenseInput = {
  date: string;
  expenses: number;
  title: string;
  method_id: string;
  category_id: string;
  emoji?: string;
  comment?: string;
};
