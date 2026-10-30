-- ============================================================
--  Искра · общая база знаний (одна для всех пользователей)
--
--  Что делает: создаёт таблицу, в которую ты публикуешь выученные темы,
--  и функцию публикации, защищённую паролем владельца.
--  Читать может любой посетитель, писать — только владелец.
--
--  КАК ВЫПОЛНИТЬ (один раз):
--    1. Открой Supabase → проект Искры → SQL Editor → New query.
--    2. Вставь весь этот файл и нажми Run.
--    3. Проверь в Искре: «Мои знания» → у выученной темы кнопка «Опубликовать для всех».
--
--  ВАЖНО: этот файл дополняет supabase/iskra-access.sql — там лежит таблица
--  iskra_config с паролем владельца. Сначала выполни его, потом этот.
-- ============================================================

-- ---------- Общая база ----------
create table if not exists public.iskra_shared_kb (
  id bigserial primary key,
  topic text not null,                                   -- как тема называется для человека
  topic_norm text not null,                              -- то же название в нижнем регистре: по нему ищем
  body text not null,                                    -- сам конспект
  source text not null default '',                        -- откуда взято (ссылка), если есть
  tags text not null default '',                          -- слова для поиска
  active boolean not null default true,                   -- снятые темы остаются в таблице, но не видны
  published_by text not null default 'owner',             -- кто опубликовал
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- одна тема — одна запись: повторная публикация обновляет текст
create unique index if not exists iskra_shared_kb_topic_uniq
  on public.iskra_shared_kb (topic_norm);
create index if not exists iskra_shared_kb_active_idx
  on public.iskra_shared_kb (active, updated_at desc);

alter table public.iskra_shared_kb enable row level security;

-- Читать может кто угодно: в этом весь смысл общей базы.
drop policy if exists iskra_shared_kb_read on public.iskra_shared_kb;
create policy iskra_shared_kb_read on public.iskra_shared_kb
  for select using (active = true);

grant select on public.iskra_shared_kb to anon, authenticated;
-- Писать напрямую нельзя никому: только через функцию ниже, она проверяет пароль.
revoke insert, update, delete on public.iskra_shared_kb from anon, authenticated;

-- ---------- Нормализация названия темы ----------
-- «Фотосинтез» и «фотосинтез» — одна тема; буква «ё» считается за «е».
create or replace function public.iskra_kb_norm(p text)
returns text
language sql immutable
set search_path = public
as $$
  select btrim(lower(replace(coalesce(p, ''), 'ё', 'е')))
$$;

-- ---------- Публикация темы (только владелец) ----------
create or replace function public.iskra_kb_publish(
  p_secret text,
  p_topic text,
  p_body text,
  p_source text default '',
  p_tags text default ''
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_secret text;
  v_topic text := btrim(coalesce(p_topic, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_norm text;
  v_row public.iskra_shared_kb;
  v_action text;
begin
  select admin_secret into v_secret from public.iskra_config where id = 1;
  if v_secret is null then
    raise exception 'сервер не настроен: сначала выполни supabase/iskra-access.sql' using errcode = '28000';
  end if;
  if p_secret is null or p_secret is distinct from v_secret then
    raise exception 'пароль владельца неверный' using errcode = '28000';
  end if;

  if length(v_topic) < 2 then
    raise exception 'слишком короткая тема: нужно хотя бы 2 символа' using errcode = '22023';
  end if;
  if length(v_body) < 40 then
    raise exception 'слишком мало текста: нужно хотя бы 40 символов' using errcode = '22023';
  end if;
  if length(v_body) > 8000 then
    raise exception 'слишком длинный текст: до 8000 символов' using errcode = '22023';
  end if;

  v_norm := public.iskra_kb_norm(v_topic);

  select * into v_row from public.iskra_shared_kb where topic_norm = v_norm;
  if found then
    update public.iskra_shared_kb
       set topic = v_topic,
           body = v_body,
           source = coalesce(p_source, ''),
           tags = coalesce(p_tags, ''),
           active = true,
           updated_at = now()
     where topic_norm = v_norm
     returning * into v_row;
    v_action := 'updated';
  else
    insert into public.iskra_shared_kb (topic, topic_norm, body, source, tags)
    values (v_topic, v_norm, v_body, coalesce(p_source, ''), coalesce(p_tags, ''))
    returning * into v_row;
    v_action := 'created';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'topic', v_row.topic,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.iskra_kb_publish(text, text, text, text, text) to anon, authenticated;

-- ---------- Снять тему с общей базы ----------
create or replace function public.iskra_kb_unpublish(p_secret text, p_topic text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_secret text;
  v_norm text := public.iskra_kb_norm(p_topic);
begin
  select admin_secret into v_secret from public.iskra_config where id = 1;
  if v_secret is null or p_secret is null or p_secret is distinct from v_secret then
    raise exception 'пароль владельца неверный' using errcode = '28000';
  end if;

  update public.iskra_shared_kb
     set active = false, updated_at = now()
   where topic_norm = v_norm and active = true;

  if not found then
    raise exception 'такой темы в общей базе нет' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'topic', p_topic);
end;
$$;

grant execute on function public.iskra_kb_unpublish(text, text) to anon, authenticated;

-- ---------- Сколько тем в общей базе (видно без пароля) ----------
create or replace function public.iskra_kb_count()
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from public.iskra_shared_kb where active = true
$$;

grant execute on function public.iskra_kb_count() to anon, authenticated;

-- ---------- Проверка после выполнения ----------
-- select public.iskra_kb_count();            -- должно вернуть 0, без ошибки
-- select public.iskra_kb_norm('Ёж');         -- должно вернуть 'еж'
