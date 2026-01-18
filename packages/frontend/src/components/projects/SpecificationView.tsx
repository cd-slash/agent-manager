import { useState, useMemo } from 'react';
import { FileEdit, Save, Code, LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface SpecificationSection {
  title: string;
  content: string;
  level: number;
}

interface SpecificationViewProps {
  value: string;
  onChange: (value: string) => void;
}

function parseMarkdownSections(markdown: string): SpecificationSection[] {
  const lines = markdown.split('\n');
  const sections: SpecificationSection[] = [];
  let currentSection: SpecificationSection | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        sections.push(currentSection);
      }

      currentSection = {
        title: headerMatch[2],
        content: '',
        level: headerMatch[1].length,
      };
      contentLines = [];
    } else if (currentSection) {
      contentLines.push(line);
    } else {
      // Content before first header - create an "Overview" section
      if (line.trim()) {
        if (!currentSection) {
          currentSection = {
            title: 'Overview',
            content: '',
            level: 1,
          };
        }
        contentLines.push(line);
      }
    }
  }

  // Don't forget the last section
  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

function SectionPanel({ section, onContentChange }: {
  section: SpecificationSection;
  onContentChange: (newContent: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);

  const handleBlur = () => {
    setIsEditing(false);
    if (editContent !== section.content) {
      onContentChange(editContent);
    }
  };

  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      // Checkbox items
      const checkboxMatch = line.match(/^(\s*)-\s+\[([ x])\]\s+(.+)$/);
      if (checkboxMatch) {
        const isChecked = checkboxMatch[2] === 'x';
        return (
          <div key={index} className="flex items-start gap-2 py-0.5">
            <input
              type="checkbox"
              checked={isChecked}
              readOnly
              className="mt-1 h-3.5 w-3.5 rounded border-border"
            />
            <span className={cn(isChecked && 'text-muted-foreground line-through')}>
              {checkboxMatch[3]}
            </span>
          </div>
        );
      }

      // Bullet items
      const bulletMatch = line.match(/^(\s*)-\s+(.+)$/);
      if (bulletMatch) {
        return (
          <div key={index} className="flex items-start gap-2 py-0.5 pl-1">
            <span className="text-muted-foreground">•</span>
            <span>{bulletMatch[2]}</span>
          </div>
        );
      }

      // Regular text
      if (line.trim()) {
        return <p key={index} className="py-0.5">{line}</p>;
      }

      // Empty line
      return <div key={index} className="h-2" />;
    });
  };

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown size={16} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={16} className="text-muted-foreground" />
          )}
          <h4 className={cn(
            'font-medium',
            section.level === 1 && 'text-base',
            section.level === 2 && 'text-sm',
            section.level === 3 && 'text-sm text-muted-foreground'
          )}>
            {section.title}
          </h4>
        </div>
      </button>

      {isExpanded && (
        <div
          className="px-4 pb-4 pt-1 text-sm"
          onDoubleClick={() => setIsEditing(true)}
        >
          {isEditing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onBlur={handleBlur}
              autoFocus
              className="min-h-[100px] font-mono text-sm"
            />
          ) : (
            <div className="text-foreground/90">
              {section.content ? renderContent(section.content) : (
                <span className="text-muted-foreground italic">No content</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SpecificationView({ value, onChange }: SpecificationViewProps) {
  const [viewMode, setViewMode] = useState<'sections' | 'raw'>('sections');

  const sections = useMemo(() => parseMarkdownSections(value), [value]);

  const handleSectionContentChange = (sectionIndex: number, newContent: string) => {
    const section = sections[sectionIndex];
    const headerPrefix = '#'.repeat(section.level);
    const oldSectionText = `${headerPrefix} ${section.title}\n${section.content}`;
    const newSectionText = `${headerPrefix} ${section.title}\n${newContent}`;

    const newValue = value.replace(oldSectionText, newSectionText);
    onChange(newValue);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
          <FileEdit size={16} className="mr-2" />
          Project Plan & Requirements
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-background rounded-md border border-border p-[3px] h-7">
            <button
              type="button"
              onClick={() => setViewMode('sections')}
              className={cn(
                'px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center gap-1.5',
                viewMode === 'sections'
                  ? 'bg-surface-elevated text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid size={12} />
              Sections
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={cn(
                'px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center gap-1.5',
                viewMode === 'raw'
                  ? 'bg-surface-elevated text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Code size={12} />
              Raw
            </button>
          </div>
          <span className="text-xs text-muted-foreground flex items-center">
            <Save size={12} className="mr-1" /> Auto-saved
          </span>
        </div>
      </div>

      {viewMode === 'sections' ? (
        <div className="flex-1 overflow-y-auto space-y-3">
          {sections.length > 0 ? (
            sections.map((section, index) => (
              <SectionPanel
                key={`${section.title}-${index}`}
                section={section}
                onContentChange={(newContent) => handleSectionContentChange(index, newContent)}
              />
            ))
          ) : (
            <div className="bg-surface border border-border rounded-lg p-6 text-center text-muted-foreground">
              <p>No sections found. Use markdown headers (## Section Name) to create sections.</p>
            </div>
          )}
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono text-sm leading-relaxed resize-none min-h-[400px] rounded-lg"
          placeholder="Define your project requirements here..."
        />
      )}
    </div>
  );
}
