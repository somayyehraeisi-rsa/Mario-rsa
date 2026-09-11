-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- for project vafnwxeawucjqksbrdrh. It creates the leaderboard table the game
-- reads and writes to using the public "anon"/"publishable" key.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 20),
  score integer not null check (score >= 0 and score <= 999999),
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);

alter table public.scores enable row level security;

drop policy if exists "Anyone can read scores" on public.scores;
create policy "Anyone can read scores"
  on public.scores for select
  to anon
  using (true);

drop policy if exists "Anyone can insert a score" on public.scores;
create policy "Anyone can insert a score"
  on public.scores for insert
  to anon
  with check (true);
