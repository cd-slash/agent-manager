import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface InfoCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Span 2 columns on large screens */
  wide?: boolean;
}

export function InfoCard({ title, children, className, wide }: InfoCardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-xl p-6',
        wide && 'lg:col-span-2',
        className
      )}
    >
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

export interface InfoItemProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  mono?: boolean;
}

export function InfoItem({ label, value, icon, mono }: InfoItemProps) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={cn(
          'flex items-center text-sm text-foreground',
          mono && 'font-mono'
        )}
      >
        {icon && <span className="mr-2 text-muted-foreground">{icon}</span>}
        {value}
      </div>
    </div>
  );
}

export interface ResourceBarProps {
  label: string;
  value: number;
  max?: string;
  color?: 'blue' | 'purple' | 'green' | 'orange';
  icon?: ReactNode;
}

export function ResourceBar({
  label,
  value,
  max,
  color = 'blue',
  icon,
}: ResourceBarProps) {
  const colorClasses = {
    blue: 'bg-feature-blue',
    purple: 'bg-feature-purple',
    green: 'bg-success',
    orange: 'bg-warning',
  };

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-foreground mb-2">
        <span className="flex items-center">
          {icon && <span className="mr-2">{icon}</span>}
          {label}
        </span>
        <span>
          {value}%{max && <span className="text-muted-foreground"> / {max}</span>}
        </span>
      </div>
      <div className="w-full bg-surface-elevated rounded-full h-3">
        <div
          className={cn('h-full rounded-full', colorClasses[color])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export interface DetailViewLayoutProps {
  /** Handler for back button click */
  onBack?: () => void;
  /** Back button text (default: "Back") */
  backText?: string;
  /** Page title */
  title: ReactNode;
  /** Subtitle or metadata line */
  subtitle?: ReactNode;
  /** Status badge or other header actions */
  headerActions?: ReactNode;
  /** Info cards in the top grid */
  infoCards?: ReactNode;
  /** Number of columns for info grid (default: 3) */
  gridColumns?: 2 | 3;
  /** Main content area */
  children?: ReactNode;
  /** Additional class names */
  className?: string;
}

export function DetailViewLayout({
  onBack,
  backText = 'Back',
  title,
  subtitle,
  headerActions,
  infoCards,
  gridColumns = 3,
  children,
  className,
}: DetailViewLayoutProps) {
  const gridClass = gridColumns === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';

  return (
    <div
      className={cn(
        'h-full overflow-y-auto bg-background p-page',
        className
      )}
    >
      {onBack && (
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-6 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={20} className="mr-1" /> {backText}
        </Button>
      )}

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{title}</h1>
          {subtitle && (
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        {headerActions && <div>{headerActions}</div>}
      </div>

      {infoCards && (
        <div className={cn('grid grid-cols-1 gap-6 mb-8', gridClass)}>
          {infoCards}
        </div>
      )}

      {children}
    </div>
  );
}
