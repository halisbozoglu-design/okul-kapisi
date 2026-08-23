import { supabase } from '@/integrations/supabase/client';

/**
 * Untyped access helper.
 * Generated Supabase types lag behind new migrations; transport module tables
 * are accessed through this helper until types.ts is regenerated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;
