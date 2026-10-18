import React, { useMemo, useState } from 'react';
import { Button, Checkbox, Icon, StateBlock, Tooltip } from './primitives';

export interface TableColumn<T> {
  key: string;
  header: string;
  numeric?: boolean;
  render?: (row: T) => React.ReactNode;
}

export interface TableProps<T extends Record<string, any>> {
  title: string;
  columns: TableColumn<T>[];
  data: T[];
  rowKey: string;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onRetry?: () => void;
  selectable?: boolean;
  bulkActionLabel?: string;
  onBulkAction?: (selectedIds: any[]) => void;
  pageSize?: number;
}

export function Table<T extends Record<string, any>>({
  title,
  columns,
  data,
  rowKey,
  loading = false,
  error = null,
  emptyMessage = 'Gösterilecek kayıt bulunamadı.',
  onRetry,
  selectable = false,
  bulkActionLabel = 'Seçilenleri sil',
  onBulkAction,
  pageSize = 8,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string>(columns[0]?.key || '');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState<number>(1);

  const visibleColumns = columns;

  const filteredAndSorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortAsc, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredAndSorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const selectedList = Object.entries(selectedKeys)
    .filter(([, isSel]) => isSel)
    .map(([k]) => (typeof data[0]?.[rowKey] === 'number' ? Number(k) : k));

  if (loading) {
    return (
      <div className="hs-table-wrapper" aria-label={title}>
        <StateBlock
          state="loading"
          title={`${title} yükleniyor`}
          description="Telemetri kayıtları mikroservisten alınıyor..."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="hs-table-wrapper" aria-label={title}>
        <StateBlock state="error" title={`${title} yüklenemedi`} description={error} onRetry={onRetry} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="hs-table-wrapper" aria-label={title}>
        <StateBlock state="empty" title={title} description={emptyMessage} />
      </div>
    );
  }

  return (
    <section className="hs-table-wrapper" aria-label={title}>
      <div className="hs-table-toolbar">
        <strong className="hs-panel-title">{title}</strong>
        <div className="hs-filter-bar">
          {selectable && selectedList.length > 0 && onBulkAction ? (
            <Button
              variant="destructive"
              onPress={() => {
                onBulkAction(selectedList);
                setSelectedKeys({});
              }}
            >
              <Icon name="delete" />
              <span>{`${bulkActionLabel} (${selectedList.length})`}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="hs-table-scroll">
        <table className="hs-table">
          <thead>
            <tr>
              {selectable ? (
                <th scope="col">
                  <Checkbox
                    label=""
                    ariaLabel="Tüm satırları seç"
                    checked={pageRows.length > 0 && pageRows.every((r) => selectedKeys[String(r[rowKey])])}
                    onChange={(checked) => {
                      const next = { ...selectedKeys };
                      pageRows.forEach((r) => {
                        next[String(r[rowKey])] = checked;
                      });
                      setSelectedKeys(next);
                    }}
                  />
                </th>
              ) : null}
              {visibleColumns.map((col) => (
                <th key={col.key} scope="col" className={col.numeric ? 'hs-cell-numeric' : undefined}>
                  <button
                    type="button"
                    className="hs-sort-btn"
                    onClick={() => {
                      if (sortKey === col.key) {
                        setSortAsc((v) => !v);
                      } else {
                        setSortKey(col.key);
                        setSortAsc(true);
                      }
                    }}
                  >
                    <span>{col.header}</span>
                    {sortKey === col.key ? (
                      <Icon name={sortAsc ? 'arrow_upward' : 'arrow_downward'} />
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const rId = String(row[rowKey]);
              const isSelected = Boolean(selectedKeys[rId]);
              return (
                <tr key={rId} className={isSelected ? 'hs-table-row-selected' : undefined}>
                  {selectable ? (
                    <td>
                      <Checkbox
                        label=""
                        ariaLabel={`Satır ${rId} seç`}
                        checked={isSelected}
                        onChange={(checked) =>
                          setSelectedKeys((prev) => ({ ...prev, [rId]: checked }))
                        }
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((col) => {
                    const rawVal = row[col.key];
                    const rendered = col.render ? col.render(row) : rawVal ?? '-';
                    const tooltipStr = typeof rawVal === 'string' || typeof rawVal === 'number' ? String(rawVal) : col.header;
                    return (
                      <td key={col.key} className={col.numeric ? 'hs-cell-numeric' : undefined}>
                        <Tooltip text={tooltipStr}>
                          <span>{rendered}</span>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="hs-table-pagination">
          <span>{`${filteredAndSorted.length} kayıt • Sayfa ${safePage} / ${totalPages}`}</span>
          <div className="hs-filter-bar">
            <Button
              variant="default"
              disabled={safePage <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              Önceki
            </Button>
            <Button
              variant="default"
              disabled={safePage >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sonraki
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
