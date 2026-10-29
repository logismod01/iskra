-- ============================================================
--  Искра · доступ по ключу на 24 часа
--  Выполнить ОДИН РАЗ: Supabase → SQL Editor → New query → Run.
--
--  ПЕРЕД ЗАПУСКОМ замени ПАРОЛЬ-ВЛАДЕЛЬЦА на свой длинный пароль
--  (латиница, цифры, 20+ символов). Этот же пароль потом вводится
--  в Искре: /console → secret <пароль>
--
--  После запуска проверь: /console → key24 123456-AB12CD-word тест
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Пароль владельца (никому не виден через API) ----------
create table if not exists public.iskra_config (
  id int primary key default 1,
  admin_secret text not null,
  constraint iskra_config_one check (id = 1)
);
alter table public.iskra_config enable row level security;
revoke all on public.iskra_config from anon;
revoke all on public.iskra_config from authenticated;

insert into public.iskra_config (id, admin_secret)
values (1, 'ПАРОЛЬ-ВЛАДЕЛЬЦА')
on conflict (id) do nothing;

-- Сменить пароль позже (раскомментировать и выполнить):
-- update public.iskra_config set admin_secret = 'новый-длинный-пароль' where id = 1;

-- ---------- Ключи ----------
create table if not exists public.iskra_keys (
  id bigserial primary key,
  key_hash text not null unique,
  key_plain text not null,
  client_code text not null,
  label text,
  hours int not null default 24,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked boolean not null default false
);
create index if not exists iskra_keys_client_idx on public.iskra_keys (client_code);
alter table public.iskra_keys enable row level security;
revoke all on public.iskra_keys from anon;
revoke all on public.iskra_keys from authenticated;

-- ---------- Вспомогательные ----------
create or replace function public.iskra_norm(p text)
returns text
language sql immutable
set search_path = public, extensions
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;

create or replace function public.iskra_hash(p text)
returns text
language sql immutable
set search_path = public, extensions
as $$
  select encode(digest(public.iskra_norm(p), 'sha256'), 'hex')
$$;

create or replace function public.iskra_client_ok(p text)
returns boolean
language sql immutable
as $$
  select lower(btrim(coalesce(p, ''))) ~ '^[0-9]{6}-[a-z0-9]{6}-[a-z]{6}$'
$$;

-- Проверка, что сервер настроен (Искра дёргает её при открытии экрана ключа)
create or replace function public.iskra_health()
returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('ok', true, 'version', 1)
$$;

-- ---------- Выдать ключ (только владелец, по паролю) ----------
create or replace function public.iskra_issue_key(
  p_secret text,
  p_client text,
  p_label text default null,
  p_hours int default 24
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_cl text := btrim(coalesce(p_client, ''));
  v_hours int := greatest(1, least(coalesce(p_hours, 24), 8760));
  v_hex text;
  v_key text;
begin
  select admin_secret into v_secret from public.iskra_config where id = 1;
  if v_secret is null then
    return jsonb_build_object('ok', false, 'error', 'Сервер не настроен: нет пароля владельца');
  end if;
  if p_secret is distinct from v_secret then
    return jsonb_build_object('ok', false, 'error', 'Неверный пароль владельца');
  end if;
  if not public.iskra_client_ok(v_cl) then
    return jsonb_build_object('ok', false, 'error', 'Код клиента не по формату 123456-AB12CD-word');
  end if;

  v_hex := upper(encode(gen_random_bytes(6), 'hex'));
  v_key := 'ISKRA-24-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4);

  insert into public.iskra_keys (key_hash, key_plain, client_code, label, hours)
  values (public.iskra_hash(v_key), v_key, v_cl, nullif(btrim(coalesce(p_label, '')), ''), v_hours);

  return jsonb_build_object(
    'ok', true, 'key', v_key, 'client', v_cl, 'hours', v_hours,
    'label', p_label, 'created_at', now()
  );
end $$;

-- ---------- Активировать ключ (может любой, ключ привязан к коду) ----------
create or replace function public.iskra_activate_key(p_key text, p_client text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.iskra_keys%rowtype;
  v_cl text := btrim(coalesce(p_client, ''));
begin
  if coalesce(p_key, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Пустой ключ');
  end if;
  if not public.iskra_client_ok(v_cl) then
    return jsonb_build_object('ok', false, 'error', 'Сначала нужен код клиента');
  end if;

  select * into r from public.iskra_keys where key_hash = public.iskra_hash(p_key);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ключ не найден. Проверь буквы и дефисы.');
  end if;
  if r.revoked then
    return jsonb_build_object('ok', false, 'error', 'Ключ отозван владельцем');
  end if;
  if lower(r.client_code) <> lower(v_cl) then
    return jsonb_build_object('ok', false, 'error', 'Ключ выдан для другого кода клиента');
  end if;

  if r.activated_at is null then
    update public.iskra_keys
       set activated_at = now(),
           expires_at = now() + make_interval(hours => r.hours)
     where id = r.id
     returning * into r;
  elsif r.expires_at is not null and r.expires_at <= now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ключ уже закончился: он работал ' || r.hours || ' ч и сгорел ' ||
               to_char(r.expires_at, 'DD.MM.YYYY HH24:MI')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'key', r.key_plain,
    'client', r.client_code,
    'label', r.label,
    'hours', r.hours,
    'activated_at', r.activated_at,
    'expires_at', r.expires_at,
    'remaining_seconds', greatest(0, floor(extract(epoch from (r.expires_at - now())))::int)
  );
end $$;

-- ---------- Проверить доступ по коду клиента ----------
create or replace function public.iskra_access(p_client text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.iskra_keys%rowtype;
begin
  if not public.iskra_client_ok(p_client) then
    return jsonb_build_object('ok', false, 'error', 'Код клиента не по формату');
  end if;

  select * into r
    from public.iskra_keys
   where lower(client_code) = lower(btrim(p_client))
     and not revoked
     and expires_at is not null
     and expires_at > now()
   order by expires_at desc
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'active', false);
  end if;

  return jsonb_build_object(
    'ok', true, 'active', true,
    'client', r.client_code,
    'label', r.label,
    'hours', r.hours,
    'activated_at', r.activated_at,
    'expires_at', r.expires_at,
    'remaining_seconds', greatest(0, floor(extract(epoch from (r.expires_at - now())))::int)
  );
end $$;

-- ---------- Список ключей (только владелец) ----------
create or replace function public.iskra_list_keys(p_secret text, p_limit int default 50)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_out jsonb;
begin
  select admin_secret into v_secret from public.iskra_config where id = 1;
  if v_secret is null or p_secret is distinct from v_secret then
    return jsonb_build_object('ok', false, 'error', 'Неверный пароль владельца');
  end if;

  select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at desc), '[]'::jsonb)
    into v_out
    from (
      select key_plain as key, client_code, label, hours,
             created_at, activated_at, expires_at, revoked
        from public.iskra_keys
       order by created_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) k;

  return jsonb_build_object('ok', true, 'keys', v_out);
end $$;

-- ---------- Отозвать ключ (только владелец) ----------
create or replace function public.iskra_revoke_key(p_secret text, p_key text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  r public.iskra_keys%rowtype;
begin
  select admin_secret into v_secret from public.iskra_config where id = 1;
  if v_secret is null or p_secret is distinct from v_secret then
    return jsonb_build_object('ok', false, 'error', 'Неверный пароль владельца');
  end if;

  update public.iskra_keys
     set revoked = true
   where key_hash = public.iskra_hash(p_key)
   returning * into r;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ключ не найден');
  end if;

  return jsonb_build_object('ok', true, 'key', r.key_plain, 'client', r.client_code);
end $$;

-- ---------- Права на вызов ----------
grant execute on function public.iskra_health() to anon, authenticated;
grant execute on function public.iskra_issue_key(text, text, text, int) to anon, authenticated;
grant execute on function public.iskra_activate_key(text, text) to anon, authenticated;
grant execute on function public.iskra_access(text) to anon, authenticated;
grant execute on function public.iskra_list_keys(text, int) to anon, authenticated;
grant execute on function public.iskra_revoke_key(text, text) to anon, authenticated;

-- ---------- Проверка после запуска ----------
-- Должно вернуть {"ok": true, "version": 1}
select public.iskra_health();
