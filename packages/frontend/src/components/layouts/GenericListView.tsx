import { useState, useMemo, type ReactNode } from 'react';
import { Search, Filter } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectionColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  defaultValue?: string;
}

export interface GenericListViewProps<TData extends Record<string, unknown>> {
  /** Column definitions for the data table */
  columns: ColumnDef<TData>[];
  /** Data to display in the table */
  data: TData[];
  /** Handler called when a row is clicked */
  onRowClick?: (row: TData) => void;
  /** Enable row selection checkboxes */
  enableRowSelection?: boolean;
  /** Enable pagination */
  enablePagination?: boolean;
  /** Page size */
  pageSize?: number;
  /** Enable search input */
  enableSearch?: boolean;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Fields to search in (accessor keys) */
  searchFields?: (keyof TData)[];
  /** Filter configurations */
  filters?: FilterConfig[];
  /** Header actions (buttons, etc.) to show on the right side of header */
  headerActions?: ReactNode;
  /** Message to show when there's no data */
  emptyMessage?: string;
  /** Fill the available height */
  fillHeight?: boolean;
  /** Get unique row ID */
  getRowId?: (row: TData) => string;
  /** Handler called when selection changes */
  onSelectionChange?: (selectedRows: TData[], clearSelection: () => void) => void;
  /** Additional class names */
  className?: string;
  /** Whether to include selection column automatically */
  includeSelectionColumn?: boolean;
}

export function GenericListView<TData extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  enableRowSelection = false,
  enablePagination = true,
  pageSize = 10,
  enableSearch = false,
  searchPlaceholder = 'Search...',
  searchFields = [],
  filters = [],
  headerActions,
  emptyMessage = 'No results found.',
  fillHeight = true,
  getRowId,
  onSelectionChange,
  className,
  includeSelectionColumn = false,
}: GenericListViewProps<TData>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const filter of filters) {
      initial[filter.key] = filter.defaultValue ?? 'all';
    }
    return initial;
  });

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Apply search filter
      if (searchTerm && searchFields.length > 0) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = searchFields.some((field) => {
          const value = item[field];
          if (typeof value === 'string') {
            return value.toLowerCase().includes(term);
          }
          if (typeof value === 'number') {
            return value.toString().includes(term);
          }
          return false;
        });
        if (!matchesSearch) return false;
      }

      // Apply dropdown filters
      for (const filter of filters) {
        const filterValue = filterValues[filter.key];
        if (filterValue && filterValue !== 'all') {
          if (item[filter.key] !== filterValue) return false;
        }
      }

      return true;
    });
  }, [data, searchTerm, searchFields, filters, filterValues]);

  const finalColumns = useMemo(() => {
    if (includeSelectionColumn && enableRowSelection) {
      return [createSelectionColumn<TData>(), ...columns];
    }
    return columns;
  }, [columns, includeSelectionColumn, enableRowSelection]);

  const hasHeader = headerActions || enableSearch || filters.length > 0;

  return (
    <div className={cn('p-page h-full flex flex-col bg-background', className)}>
      {hasHeader && (
        <div className="flex flex-col sm:flex-row gap-card mb-section">
          {/* Search and filters on the left */}
          <div className="flex flex-col sm:flex-row gap-card flex-1">
            {enableSearch && (
              <div className="relative flex-1 max-w-md">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="pl-10"
                />
              </div>
            )}

            {filters.map((filter) => (
              <div key={filter.key} className="relative w-full sm:w-48">
                <Select
                  value={filterValues[filter.key] ?? 'all'}
                  onValueChange={(value) =>
                    setFilterValues((prev) => ({ ...prev, [filter.key]: value }))
                  }
                >
                  <SelectTrigger>
                    <Filter size={16} className="mr-2 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {filter.label}</SelectItem>
                    {filter.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Actions on the right */}
          {headerActions && (
            <div className="flex justify-end">{headerActions}</div>
          )}
        </div>
      )}

      <DataTable
        columns={finalColumns}
        data={filteredData}
        onRowClick={onRowClick}
        enableRowSelection={enableRowSelection}
        enablePagination={enablePagination}
        fillHeight={fillHeight}
        pageSize={pageSize}
        emptyMessage={emptyMessage}
        getRowId={getRowId}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
}

// Re-export createSelectionColumn for convenience
export { createSelectionColumn };
