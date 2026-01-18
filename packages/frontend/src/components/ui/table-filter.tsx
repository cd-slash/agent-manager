import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FilterConfig } from '@/components/layouts/GenericListView';

export interface TableFilterProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  filterValues: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

export function TableFilter({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  filterValues,
  onFilterChange,
  onClearFilters,
}: TableFilterProps) {
  const activeFilterCount = Object.entries(filterValues).filter(
    ([, value]) => value && value !== 'all'
  ).length;

  const hasActiveFilters = activeFilterCount > 0 || searchValue.length > 0;

  return (
    <div className="flex items-center gap-card">
      {/* Search input */}
      <div className="relative flex-1 max-w-md">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={16}
        />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-10"
        />
      </div>

      {/* Filter dropdown */}
      {filters.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter size={16} />
              Filter
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs h-5">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {filters.map((filter, index) => (
              <div key={filter.key}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={!filterValues[filter.key] || filterValues[filter.key] === 'all'}
                  onCheckedChange={() => onFilterChange(filter.key, 'all')}
                  onSelect={(e) => e.preventDefault()}
                >
                  All
                </DropdownMenuCheckboxItem>
                {filter.options.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={filterValues[filter.key] === option.value}
                    onCheckedChange={() => onFilterChange(filter.key, option.value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            ))}
            <DropdownMenuSeparator />
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              disabled={!hasActiveFilters}
              className="w-full justify-center text-muted-foreground hover:text-foreground"
            >
              <X size={16} className="mr-1" />
              Clear all
            </Button>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

    </div>
  );
}
