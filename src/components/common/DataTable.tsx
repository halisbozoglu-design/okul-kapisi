import { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from './EmptyState';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  title: string;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: (item: T) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Ara...',
  actions,
  emptyTitle = 'Veri bulunamadı',
  emptyDescription,
}: DataTableProps<T>) {
  return (
    <div className="space-y-4">
      {onSearchChange && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead key={col.key}>{col.title}</TableHead>
              ))}
              {actions && <TableHead className="w-[100px]">İşlemler</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (actions ? 1 : 0)}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, idx) => (
                <TableRow key={item.id || idx}>
                  {columns.map(col => (
                    <TableCell key={col.key}>
                      {col.render ? col.render(item) : item[col.key]}
                    </TableCell>
                  ))}
                  {actions && <TableCell>{actions(item)}</TableCell>}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
