-- ============================================================
-- Migration 002: Super User (SYSTEM_ADMIN), session RPC, RLS fixes
-- ============================================================

-- ------------------------------------------------------------
-- 1) SYSTEM_ADMIN role
-- ------------------------------------------------------------
INSERT INTO public.roles (id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000004', 'System Administrator', 'SYSTEM_ADMIN')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- 2) Admin permissions for role/user management
-- ------------------------------------------------------------
INSERT INTO public.permissions (id, code, name) VALUES
  ('10000000-0000-0000-0000-000000000026', 'admin.roles.view',   'View Roles'),
  ('10000000-0000-0000-0000-000000000027', 'admin.roles.manage', 'Manage Roles')
ON CONFLICT (code) DO NOTHING;

-- SYSTEM_ADMIN gets every permission
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000004', p.id
FROM public.permissions p
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3) Helper: is the current user a system administrator?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid()
      AND om.is_active = true
      AND r.code = 'SYSTEM_ADMIN'
  );
$$;

-- ------------------------------------------------------------
-- 4) Session RPC used by the frontend (replaces brittle joins)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_session()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role_code text;
  v_role_name text;
  v_perms text[];
  v_name text;
  v_username text;
  v_email text;
  v_org_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('authenticated', false);
  END IF;

  SELECT full_name, username INTO v_name, v_username
  FROM public.profiles WHERE id = v_uid;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT om.organization_id, r.code, r.name
  INTO v_org, v_role_code, v_role_name
  FROM public.organization_memberships om
  JOIN public.roles r ON r.id = om.role_id
  WHERE om.user_id = v_uid AND om.is_active = true
  ORDER BY om.created_at
  LIMIT 1;

  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org;

  SELECT array_agg(p.code) INTO v_perms
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
  JOIN public.organization_memberships om ON om.role_id = rp.role_id
  WHERE om.user_id = v_uid AND om.is_active = true;

  RETURN json_build_object(
    'authenticated', true,
    'user_id', v_uid,
    'name', COALESCE(v_name, v_username, v_email),
    'username', v_username,
    'email', v_email,
    'organization_id', v_org,
    'organization_name', v_org_name,
    'role_code', v_role_code,
    'role_name', v_role_name,
    'permissions', COALESCE(v_perms, ARRAY[]::text[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;

-- ------------------------------------------------------------
-- 5) has_org_permission: SYSTEM_ADMIN has everything
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_org_permission(org_id uuid, perm_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role_code text;
BEGIN
  IF v_user_id IS NULL THEN RETURN false; END IF;

  IF public.is_system_admin() THEN RETURN true; END IF;

  SELECT r.code INTO v_role_code
  FROM public.organization_memberships om
  JOIN public.roles r ON r.id = om.role_id
  WHERE om.user_id = v_user_id
    AND om.organization_id = org_id
    AND om.is_active = true
  LIMIT 1;

  IF v_role_code IS NULL THEN RETURN false; END IF;
  IF v_role_code IN ('DIRECTOR', 'ADMIN') THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = (
      SELECT om.role_id FROM public.organization_memberships om
      WHERE om.user_id = v_user_id AND om.organization_id = org_id AND om.is_active = true LIMIT 1
    )
    AND p.code = perm_code
  );
END;
$$;
