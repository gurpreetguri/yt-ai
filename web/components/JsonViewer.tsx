'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: unknown;
  /** Node depth below which children start collapsed. Defaults to 2. */
  collapseAfterDepth?: number;
}

/** Pretty-printed, collapsible JSON tree with a copy-to-clipboard button. No external JSON-viewer dependency — this stays intentionally small. */
export function JsonViewer({ data, collapseAfterDepth = 2 }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="relative rounded-md border border-border bg-muted/40">
      <div className="flex items-center justify-end border-b border-border px-2 py-1">
        <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy JSON'}
        </Button>
      </div>
      <div className="thin-scroll max-h-[60vh] overflow-auto p-3 font-mono text-xs leading-relaxed">
        <JsonNode value={data} depth={0} collapseAfterDepth={collapseAfterDepth} />
      </div>
    </div>
  );
}

function JsonNode({
  value,
  depth,
  collapseAfterDepth,
  propertyKey,
}: {
  value: unknown;
  depth: number;
  collapseAfterDepth: number;
  propertyKey?: string;
}) {
  const [expanded, setExpanded] = useState(depth < collapseAfterDepth);

  if (value === null || value === undefined) {
    return <Leaf keyLabel={propertyKey} valueLabel="null" className="text-muted-foreground" />;
  }

  if (typeof value === 'string') {
    return <Leaf keyLabel={propertyKey} valueLabel={`"${value}"`} className="text-emerald-700" />;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <Leaf keyLabel={propertyKey} valueLabel={String(value)} className="text-blue-700" />;
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  if (entries.length === 0) {
    return (
      <Leaf
        keyLabel={propertyKey}
        valueLabel={`${openBracket}${closeBracket}`}
        className="text-muted-foreground"
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-0.5 rounded hover:bg-accent"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {propertyKey !== undefined && <span className="text-foreground">{propertyKey}:</span>}
        <span className="text-muted-foreground">
          {openBracket}
          {!expanded && `${entries.length} ${isArray ? 'items' : 'keys'}${closeBracket}`}
        </span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-border pl-2">
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              value={v}
              depth={depth + 1}
              collapseAfterDepth={collapseAfterDepth}
              propertyKey={isArray ? undefined : k}
            />
          ))}
          <div className="text-muted-foreground">{closeBracket}</div>
        </div>
      )}
    </div>
  );
}

function Leaf({
  keyLabel,
  valueLabel,
  className,
}: {
  keyLabel?: string;
  valueLabel: string;
  className?: string;
}) {
  return (
    <div className="pl-4">
      {keyLabel !== undefined && <span className="text-foreground">{keyLabel}: </span>}
      <span className={cn(className)}>{valueLabel}</span>
    </div>
  );
}
