-- Hablo — "Moje myśli": a private library of personal thoughts and reflective questions.
-- Data is imported by the user inside the app (never shipped in the repository).
-- Imported rows keep a stable origin_id; edited rows (edited = true) are never
-- overwritten by a later re-import, so personal edits survive app updates.

create table public.thought_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'thought' check (kind in ('thought', 'question')),
  origin_id text,
  category_key text,
  text text not null check (length(text) between 1 and 4000),
  meta jsonb not null default '{}',
  contexts text[] not null default '{}'
    check (contexts <@ array['morning', 'end_of_work', 'new_idea', 'tension', 'family', 'rest', 'travel']::text[]),
  featured boolean not null default false,
  favorite boolean not null default false,
  hidden boolean not null default false,
  edited boolean not null default false,
  origin_hash text,
  last_shown_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, origin_id),
  foreign key (user_id, category_key) references public.thought_categories (user_id, key) on update cascade
);
create index thoughts_user_kind on public.thoughts (user_id, kind, hidden);

alter table public.thought_categories enable row level security;
create policy "own rows" on public.thought_categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.thoughts enable row level security;
create policy "own rows" on public.thoughts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
