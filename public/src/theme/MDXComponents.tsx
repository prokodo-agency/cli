/**
 * Swizzle: MDXComponents
 *
 * Registers @prokodo/ui components as globally available MDX components.
 * Every .mdx doc file can use these without an import statement:
 *
 *   <Icon name="CheckmarkCircle01Icon" size="md" color="primary" />
 *   <DocBadge label="--json" />
 *   <DocBadge label="required" color="error" />
 *
 * Table elements are overridden with custom docs-table* classes (no @prokodo/ui
 * table.css import) to avoid library cascade conflicts.
 */
import { createContext, useContext, type ReactNode } from 'react';
import OriginalMDXComponents from '@theme-original/MDXComponents';
import { Icon } from '@prokodo/ui/icon';
import { Chip } from '@prokodo/ui/chip';

// ─── Table element overrides ─────────────────────────────────────────────────

/** Context so <tr> can apply the correct head/body row class. */
const TableSectionCtx = createContext<'head' | 'body'>('body');

function DocTable({ children }: { children: ReactNode }) {
  return (
    <div className="docs-table">
      <div className="docs-table__scroll">
        <table className="docs-table__el">{children}</table>
      </div>
    </div>
  );
}

function DocThead({ children }: { children: ReactNode }) {
  return (
    <TableSectionCtx.Provider value="head">
      <thead className="docs-table__head">{children}</thead>
    </TableSectionCtx.Provider>
  );
}

function DocTbody({ children }: { children: ReactNode }) {
  return (
    <TableSectionCtx.Provider value="body">
      <tbody className="docs-table__body">{children}</tbody>
    </TableSectionCtx.Provider>
  );
}

function DocTr({ children }: { children: ReactNode }) {
  const section = useContext(TableSectionCtx);
  return (
    <tr className={section === 'head' ? 'docs-table__head-tr' : 'docs-table__tr'}>{children}</tr>
  );
}

function DocTh({ children }: { children: ReactNode }) {
  return <th className="docs-table__th">{children}</th>;
}

function DocTd({ children }: { children: ReactNode }) {
  return <td className="docs-table__td">{children}</td>;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/**
 * Inline badge for CLI flags, option names, and status labels.
 *
 * Usage in .mdx:
 *   <DocBadge label="--json" />
 *   <DocBadge label="required" color="error" />
 */
function DocBadge({
  label,
  color = 'primary',
}: {
  label: string;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}) {
  return <Chip label={label} color={color} variant="outlined" />;
}

// ─── Export ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MDXComponents: Record<string, any> = {
  ...OriginalMDXComponents,
  /** @prokodo/ui Icon — use by name from the prokodo icon library */
  Icon,
  /** @prokodo/ui Chip — raw chip component */
  Chip,
  /** DocBadge — styled pill for CLI flag / status labels */
  DocBadge,
  /** @prokodo/ui Table — applied via HTML element class overrides */
  table: DocTable,
  thead: DocThead,
  tbody: DocTbody,
  tr: DocTr,
  th: DocTh,
  td: DocTd,
};

export default MDXComponents;
