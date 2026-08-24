-- Harden mobile device registration state synchronization.
-- Additive/backward-compatible: preserves the RPC signature and existing rows.

create or replace function public.register_mobile_device(
  _institution_id uuid,
  _installation_id text,
  _platform text,
  _device_model text default null,
  _os_version text default null,
  _app_version text default null,
  _push_token text default null,
  _notifications_enabled boolean default false,
  _background_location_enabled boolean default false,
  _motion_permission text default 'unknown'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_id uuid := auth.uid();
  _existing public.mobile_device_registrations%rowtype;
  _device_id uuid;
begin
  if _user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if _institution_id is null or not public.is_institution_member(_user_id, _institution_id) then
    raise exception 'INSTITUTION_ACCESS_DENIED' using errcode = '42501';
  end if;

  if nullif(pg_catalog.btrim(_installation_id), '') is null or pg_catalog.length(_installation_id) > 200 then
    raise exception 'INVALID_INSTALLATION_ID' using errcode = '22023';
  end if;

  if _platform not in ('android', 'ios', 'web') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;

  if _motion_permission not in ('unknown', 'prompt', 'granted', 'denied') then
    raise exception 'INVALID_MOTION_PERMISSION' using errcode = '22023';
  end if;

  select * into _existing
  from public.mobile_device_registrations
  where user_id = _user_id
    and installation_id = _installation_id
  for update;

  if found and _existing.revoked_at is not null then
    raise exception 'DEVICE_REVOKED' using errcode = '42501';
  end if;

  if found then
    update public.mobile_device_registrations
       set institution_id = _institution_id,
           platform = _platform,
           device_model = pg_catalog.coalesce(pg_catalog.nullif(_device_model, ''), device_model),
           os_version = pg_catalog.coalesce(pg_catalog.nullif(_os_version, ''), os_version),
           app_version = pg_catalog.coalesce(pg_catalog.nullif(_app_version, ''), app_version),
           push_token = case
             when _notifications_enabled then pg_catalog.coalesce(pg_catalog.nullif(_push_token, ''), push_token)
             else null
           end,
           notifications_enabled = _notifications_enabled,
           background_location_enabled = _background_location_enabled,
           motion_permission = _motion_permission,
           last_seen_at = pg_catalog.now(),
           updated_at = pg_catalog.now()
     where id = _existing.id
     returning id into _device_id;
  else
    insert into public.mobile_device_registrations (
      user_id,
      institution_id,
      installation_id,
      platform,
      device_model,
      os_version,
      app_version,
      push_token,
      notifications_enabled,
      background_location_enabled,
      motion_permission,
      last_seen_at
    ) values (
      _user_id,
      _institution_id,
      _installation_id,
      _platform,
      pg_catalog.nullif(_device_model, ''),
      pg_catalog.nullif(_os_version, ''),
      pg_catalog.nullif(_app_version, ''),
      case when _notifications_enabled then pg_catalog.nullif(_push_token, '') else null end,
      _notifications_enabled,
      _background_location_enabled,
      _motion_permission,
      pg_catalog.now()
    )
    returning id into _device_id;
  end if;

  return _device_id;
end;
$$;

revoke all on function public.register_mobile_device(uuid, text, text, text, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.register_mobile_device(uuid, text, text, text, text, text, text, boolean, boolean, text) to authenticated, service_role;
