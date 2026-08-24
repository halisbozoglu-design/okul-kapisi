-- Secure, tenant-bound device registration for Android/iOS/PWA clients.
-- Additive and backwards compatible: existing direct self-RLS remains available,
-- while clients can use this RPC to avoid race-prone read-then-upsert flows.

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
set search_path = public, pg_temp
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

  if nullif(btrim(_installation_id), '') is null or length(_installation_id) > 200 then
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
           device_model = coalesce(nullif(_device_model, ''), device_model),
           os_version = coalesce(nullif(_os_version, ''), os_version),
           app_version = coalesce(nullif(_app_version, ''), app_version),
           push_token = coalesce(nullif(_push_token, ''), push_token),
           notifications_enabled = _notifications_enabled,
           background_location_enabled = _background_location_enabled,
           motion_permission = _motion_permission,
           last_seen_at = now(),
           updated_at = now()
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
      nullif(_device_model, ''),
      nullif(_os_version, ''),
      nullif(_app_version, ''),
      nullif(_push_token, ''),
      _notifications_enabled,
      _background_location_enabled,
      _motion_permission,
      now()
    )
    returning id into _device_id;
  end if;

  return _device_id;
end;
$$;

revoke all on function public.register_mobile_device(uuid,text,text,text,text,text,text,boolean,boolean,text) from public;
revoke all on function public.register_mobile_device(uuid,text,text,text,text,text,text,boolean,boolean,text) from anon;
grant execute on function public.register_mobile_device(uuid,text,text,text,text,text,text,boolean,boolean,text) to authenticated;
grant execute on function public.register_mobile_device(uuid,text,text,text,text,text,text,boolean,boolean,text) to service_role;
