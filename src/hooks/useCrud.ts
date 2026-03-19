import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type TableName = 'institutions' | 'campuses' | 'academic_years' | 'terms' | 'grade_levels' | 'sections' | 'classrooms' | 'branches';

export function useCrud<T extends Record<string, any>>(tableName: TableName) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await (supabase
      .from(tableName)
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }) as any);
    
    if (error) {
      toast.error('Veri yüklenirken hata oluştu');
      console.error(error);
    } else {
      setData((result || []) as T[]);
    }
    setLoading(false);
  }, [tableName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const create = async (item: Partial<T>) => {
    const { error } = await (supabase.from(tableName).insert(item as any) as any);
    if (error) {
      toast.error('Kayıt oluşturulurken hata oluştu');
      console.error(error);
      return false;
    }
    toast.success('Kayıt başarıyla oluşturuldu');
    await fetchData();
    return true;
  };

  const update = async (id: string, item: Partial<T>) => {
    const { error } = await (supabase.from(tableName).update(item as any).eq('id', id) as any);
    if (error) {
      toast.error('Kayıt güncellenirken hata oluştu');
      console.error(error);
      return false;
    }
    toast.success('Kayıt başarıyla güncellendi');
    await fetchData();
    return true;
  };

  const remove = async (id: string) => {
    // Soft delete
    const { error } = await (supabase
      .from(tableName)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq('id', id) as any);
    if (error) {
      toast.error('Kayıt silinirken hata oluştu');
      console.error(error);
      return false;
    }
    toast.success('Kayıt başarıyla silindi');
    await fetchData();
    return true;
  };

  return { data, loading, fetchData, create, update, remove };
}
