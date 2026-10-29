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
  plan text not null default 'day',
  hours int not null default 24,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked boolean not null default false
);
-- для уже созданных баз: добавить колонку плана
alter table public.iskra_keys add column if not exists plan text not null default 'day';
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
  p_plan text default 'day',
  p_hours int default null
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_cl text := btrim(coalesce(p_client, ''));
  v_plan text := lower(coalesce(nullif(btrim(p_plan), ''), 'day'));
  v_hours int;
  v_forever boolean := false;
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

  -- тарифы: day / month / year / forever (можно и свои часы)
  if v_plan = 'forever' then
    v_forever := true;
    v_hours := 0;
  elsif v_plan = 'day' then v_hours := 24;
  elsif v_plan = 'month' then v_hours := 720;
  elsif v_plan = 'year' then v_hours := 8760;
  elsif p_hours is not null and p_hours > 0 then
    v_hours := greatest(1, least(p_hours, 8760));
    v_plan := 'custom';
  else
    return jsonb_build_object('ok', false, 'error', 'Неизвестный тариф: ' || v_plan);
  end if;

  v_hex := upper(encode(gen_random_bytes(6), 'hex'));
  v_key := 'ISKRA-24-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4);

  insert into public.iskra_keys (key_hash, key_plain, client_code, label, plan, hours)
  values (public.iskra_hash(v_key), v_key, v_cl, nullif(btrim(coalesce(p_label, '')), ''), v_plan, v_hours);

  return jsonb_build_object(
    'ok', true, 'key', v_key, 'client', v_cl, 'plan', v_plan, 'hours', v_hours,
    'forever', v_forever, 'label', p_label, 'created_at', now()
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
           expires_at = case when r.plan = 'forever' then null
                             else now() + make_interval(hours => r.hours) end
     where id = r.id
     returning * into r;
  elsif r.plan <> 'forever' and r.expires_at is not null and r.expires_at <= now() then
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
    'plan', r.plan,
    'hours', r.hours,
    'forever', r.plan = 'forever',
    'activated_at', r.activated_at,
    'expires_at', r.expires_at,
    'remaining_seconds', case when r.plan = 'forever' then null
                              else greatest(0, floor(extract(epoch from (r.expires_at - now())))::int) end
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
     and activated_at is not null
     and (plan = 'forever' or (expires_at is not null and expires_at > now()))
   order by (plan = 'forever') desc, expires_at desc nulls last
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'active', false);
  end if;

  return jsonb_build_object(
    'ok', true, 'active', true,
    'client', r.client_code,
    'label', r.label,
    'plan', r.plan,
    'hours', r.hours,
    'forever', r.plan = 'forever',
    'activated_at', r.activated_at,
    'expires_at', r.expires_at,
    'remaining_seconds', case when r.plan = 'forever' then null
                              else greatest(0, floor(extract(epoch from (r.expires_at - now())))::int) end
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
      select key_plain as key, client_code, label, plan, hours,
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
grant execute on function public.iskra_issue_key(text, text, text, text, int) to anon, authenticated;
grant execute on function public.iskra_activate_key(text, text) to anon, authenticated;
grant execute on function public.iskra_access(text) to anon, authenticated;
grant execute on function public.iskra_list_keys(text, int) to anon, authenticated;
grant execute on function public.iskra_revoke_key(text, text) to anon, authenticated;

-- Старая версия выдачи (без плана) — чтобы не ломать прежние вызовы
create or replace function public.iskra_issue_key(
  p_secret text, p_client text, p_label text, p_hours int
)
returns jsonb
language sql security definer
set search_path = public, extensions
as $$
  select public.iskra_issue_key(p_secret, p_client, p_label, 'custom', p_hours)
$$;
grant execute on function public.iskra_issue_key(text, text, text, int) to anon, authenticated;

-- ---------- Проверка после запуска ----------
-- Должно вернуть {"ok": true, "version": 1}
select public.iskra_health();
