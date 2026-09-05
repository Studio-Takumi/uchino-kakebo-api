-- Local development / test schema for uchino-kakebo-api.
-- Mirrors the production Supabase tables (column names == type field names).
-- FOR LOCAL USE ONLY — production already has these tables; do not apply here to prod.

create table if not exists methods (
  user_id   uuid    not null,
  method_id uuid    primary key,
  method    text    not null,
  color     text    not null,
  priority  integer not null
);

create table if not exists categories (
  user_id     uuid    not null,
  category_id uuid    primary key,
  category    text    not null,
  color       text    not null,
  priority    integer not null,
  emoji       text    not null,
  method_id   uuid    not null references methods (method_id),
  is_income   boolean not null default false
);

create table if not exists expenses (
  user_id          uuid        not null,
  id               uuid        primary key,
  created_time     timestamptz not null default now(),
  last_edited_time timestamptz not null default now(),
  title            text        not null,
  emoji            text        not null default '',
  -- Nullable on purpose: production contains a dirty row with a null amount,
  -- and the API is expected to sort such nulls last. The seed reproduces it.
  expenses         integer,
  comment          text        not null default '',
  date             date        not null,
  method_id        uuid        not null references methods (method_id),
  category_id      uuid        not null references categories (category_id)
);

create index if not exists expenses_user_date_idx on expenses (user_id, date);
