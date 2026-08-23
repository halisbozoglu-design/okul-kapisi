import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useInstitution } from '@/hooks/useInstitution';

interface Options {
  orderBy?: string;
  ascending?: boolean;
  select?: string;
  filters?: Record<string, string | null | undefined>;
  enabled?: boolean;
}

export function useTransportCrud<T extends { id: string }>(
  table: string,
  options: Options = {},
) {
  const { orderBy = 'created_at', ascending = false, select = '*', filters, enabled = true } = options;
  const { institutionId, loading: instLoading } = useInstitution();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const filterKey = JSON.stringify(filters ?? {});

  const fetchData = useCallback(async () => {
    if (instLoading || !enabled) return;
    setLoading(true);
    let q = db.from(table).select(select).is('deleted_at', null);
    const parsed: Record<string, string | null | undefined> = JSON.parse(filterKey);
    Object.entries(parsed).forEach(([k, v]) => {
      if (v) q = q.eq(k, v);
    });
    const { data: rows, error } = await q.order(orderBy, { ascending });
    if (error) {
      console.error(error);
      toast.error('Veriler yüklenemedi');
    } else {
      setData((rows || []) as T[]);
    }
    setLoading(false);
  }, [table, select, orderBy, ascending, filterKey, instLoading, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const create = async (item: Record<string, unknown>) => {
    if (!institutionId) {
      toast.error('Kurum bilgisi bulunamadı. Önce bir kuruma bağlı olmalısınız.');
      return false;
    }
    const { error } = await db.from(table).insert({ institution_id: institutionId, ...item });
    if (error) {
      console.error(error);
      toast.error(error.message || 'Kayıt oluşturulamadı');
      return false;
    }
    toast.success('Kayıt oluşturuldu');
    await fetchData();
    return true;
  };

  const update = async (id: string, item: Record<string, unknown>) => {
    const { error } = await db.from(table).update(item).eq('id', id);
    if (error) {
      console.error(error);
      toast.error(error.message || 'Kayıt güncellenemedi');
      return false;
    }
    toast.success('Kayıt güncellendi');
    await fetchData();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await db
      .from(table)
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id);
    if (error) {
      console.error(error);
      toast.error('Kayıt silinemedi');
      return false;
    }
    toast.success('Kayıt silindi');
    await fetchData();
    return true;
  };

  return { data, loading: loading || instLoading, institutionId, fetchData, create, update, remove };
}
