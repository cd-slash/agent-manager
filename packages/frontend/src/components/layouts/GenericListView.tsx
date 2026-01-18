import { useState, useMemo, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectionColumn } from '@/components/ui/data-table';
import { TableFilter } from '@/components/ui/table-filter';
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
  /** Selection actions rendered when rows are selected */
  selectionActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode;
  /** Message to show when there's no data */
  emptyMessage?: string;
  /** Fill the available height */
  fillHeight?: boolean;
  /** Get unique row ID */
  getRowId?: (row: TData) => string;
  /** Handler called when selection changes (use selectionActions instead for rendering) */
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
  selectionActions,
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
  const [selectedRows, setSelectedRows] = useState<TData[]>([]);
  const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(null);

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

  const handleFilterChange = (key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    const clearedFilters: Record<string, string> = {};
    for (const filter of filters) {
      clearedFilters[filter.key] = 'all';
    }
    setFilterValues(clearedFilters);
  };

  const handleSelectionChange = (rows: TData[], clear: () => void) => {
    setSelectedRows(rows);
    setClearSelectionFn(() => clear);
    onSelectionChange?.(rows, clear);
  };

  const hasHeader = headerActions || enableSearch || filters.length > 0;
  const hasSelectionActions = selectionActions && selectedRows.length > 0;

  return (
    <div className={cn('p-page h-full flex flex-col bg-background', className)}>
      {hasHeader && (
        <div className="flex flex-col sm:flex-row gap-card mb-section">
          {/* Search and filters on the left */}
          <div className="flex-1">
            {(enableSearch || filters.length > 0) && (
              <TableFilter
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder={searchPlaceholder}
                filters={filters}
                filterValues={filterValues}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
              />
            )}
          </div>

          {/* Actions on the right */}
          {headerActions && (
            <div className="flex justify-end">{headerActions}</div>
          )}
        </div>
      )}

      {/* Selection actions toolbar */}
      {hasSelectionActions && (
        <div className="mb-card">
          {selectionActions(selectedRows, clearSelectionFn!)}
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
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}

// Re-export createSelectionColumn for convenience
export { createSelectionColumn };
