-- Stores only a SHA-256 hash of the caller IP, never the raw IP.
create table if not exists public.chat_rate_limits (
  key_hash text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.chat_rate_limits enable row level security;
revoke all on table public.chat_rate_limits from anon, authenticated;

create or replace function public.consume_chat_rate_limit(
  p_key_hash text,
  p_limit integer default 12,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_window_start timestamptz;
begin
  insert into public.chat_rate_limits as limits (key_hash, window_start, request_count, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update
    set window_start = case
          when limits.window_start <= now() - make_interval(secs => p_window_seconds) then now()
          else limits.window_start
        end,
        request_count = case
          when limits.window_start <= now() - make_interval(secs => p_window_seconds) then 1
          else limits.request_count + 1
        end,
        updated_at = now()
  returning request_count, window_start into v_count, v_window_start;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_chat_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_chat_rate_limit(text, integer, integer) to service_role;

-- Optional housekeeping: schedule this statement periodically if the table grows.
-- delete from public.chat_rate_limits where updated_at < now() - interval '7 days';
