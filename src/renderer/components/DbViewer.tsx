import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Database,
  Pencil,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DbColumn } from '@/electron';

interface DbViewerProps {
  appId: string;
  appName: string;
  onClose: () => void;
}

export default function DbViewer({ appId, appName, onClose }: DbViewerProps) {
  const [tables, setTables] = useState<string[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<DbColumn[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [showSql, setShowSql] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const refreshData = useCallback(async (table: string) => {
    const result = await window.electron.db.queryTable(appId, table, page, pageSize);
    if (result.success) {
      setRows(result.rows ?? []);
      setColumns(result.columns ?? []);
      setTotal(result.total ?? 0);
      setError(null);
    } else {
      setError(result.error ?? '加载数据失败');
    }
  }, [appId, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tablesResult, statusResult] = await Promise.all([
        window.electron.db.getTables(appId),
        window.electron.db.getAppStatus(appId),
      ]);
      if (cancelled) return;
      if (statusResult.success) {
        const s = statusResult.status;
        setReadOnly(s === 'running' || s === 'developing');
      }
      if (!tablesResult.success) {
        setError(tablesResult.error ?? '加载数据表失败');
        return;
      }
      setTables(tablesResult.tables);
      const firstTable = tablesResult.tables[0];
      if (!firstTable) return;
      setActiveTable(firstTable);
      const dataResult = await window.electron.db.queryTable(appId, firstTable, 1, pageSize);
      if (cancelled) return;
      if (dataResult.success) {
        setRows(dataResult.rows ?? []);
        setColumns(dataResult.columns ?? []);
        setTotal(dataResult.total ?? 0);
      }
    })();
    return () => { cancelled = true; };
  }, [appId, pageSize]);

  useEffect(() => {
    if (!activeTable) return;
    let cancelled = false;
    (async () => {
      const result = await window.electron.db.queryTable(appId, activeTable, page, pageSize);
      if (cancelled) return;
      if (result.success) {
        setRows(result.rows ?? []);
        setColumns(result.columns ?? []);
        setTotal(result.total ?? 0);
        setError(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTable, page, appId, pageSize]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const pkColumn = columns.find((c) => c.pk)?.name;
  const totalPages = Math.ceil(total / pageSize);

  const handleCellDoubleClick = (rowId: string, column: string, value: unknown) => {
    if (readOnly || column === pkColumn) return;
    setEditingCell({ rowId, column });
    setEditValue(value === null ? '' : String(value));
  };

  const handleSaveCell = async () => {
    if (!editingCell || !activeTable) return;
    let parsedValue: unknown = editValue;
    try {
      parsedValue = JSON.parse(editValue);
    } catch {
      // Keep as string
    }
    const result = await window.electron.db.updateCell(
      appId,
      activeTable,
      editingCell.rowId,
      editingCell.column,
      parsedValue
    );
    if (result.success) {
      setEditingCell(null);
      refreshData(activeTable);
    } else {
      setError(result.error ?? '更新失败');
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    if (!activeTable) return;
    const result = await window.electron.db.deleteRow(appId, activeTable, rowId);
    if (result.success) {
      refreshData(activeTable);
    } else {
      setError(result.error ?? '删除失败');
    }
  };

  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) return;
    const result = await window.electron.db.runQuery(appId, sqlQuery);
    if (result.success) {
      setRows(result.rows ?? []);
      setColumns(result.columns ?? []);
      setTotal(result.total ?? 0);
      setActiveTable(null);
      setError(null);
    } else {
      setError(result.error ?? '查询失败');
    }
  };

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Database className="h-4 w-4 text-neutral-500" />
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {appName} - 数据
        </span>
        {readOnly && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            只读（应用运行中）
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowSql(!showSql)}
          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            showSql
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          SQL
        </button>
      </div>

      {/* SQL Query Bar */}
      {showSql && (
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-700">
          <input
            type="text"
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunQuery()}
            placeholder="SELECT * FROM records WHERE ..."
            className="flex-1 rounded border border-neutral-300 bg-neutral-50 px-2 py-1 font-mono text-xs text-neutral-800 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
          />
          <button
            onClick={handleRunQuery}
            className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700"
          >
            <Search className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Table tabs */}
      {tables.length > 0 && (
        <div className="flex gap-1 border-b border-neutral-200 px-3 py-1 dark:border-neutral-700">
          {tables.map((table) => (
            <button
              key={table}
              onClick={() => {
                setActiveTable(table);
                setPage(1);
              }}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                activeTable === table
                  ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              {table}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Data table */}
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ?
          <div className="flex h-32 items-center justify-center text-xs text-neutral-400">
            暂无数据
          </div>
        : <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-800">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="whitespace-nowrap border-b border-r border-neutral-200 px-2 py-1.5 text-left font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    {col.name}
                    {col.pk && (
                      <span className="ml-1 text-[9px] text-amber-500" title="主键">
                        PK
                      </span>
                    )}
                    {col.type && (
                      <span className="ml-1 text-[9px] text-neutral-400">{col.type}</span>
                    )}
                  </th>
                ))}
                {!readOnly && (
                  <th className="w-8 border-b border-neutral-200 px-1 dark:border-neutral-700" />
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const rowId = pkColumn ? String(row[pkColumn]) : String(rowIdx);
                return (
                  <tr
                    key={rowId}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    {columns.map((col) => {
                      const isEditing =
                        editingCell?.rowId === rowId && editingCell?.column === col.name;
                      const cellValue = row[col.name];

                      return (
                        <td
                          key={col.name}
                          className="max-w-[300px] truncate border-b border-r border-neutral-100 px-2 py-1 text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
                          onDoubleClick={() => handleCellDoubleClick(rowId, col.name, cellValue)}
                        >
                          {isEditing ?
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleSaveCell}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveCell();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              className="w-full rounded border border-indigo-400 bg-white px-1 py-0 text-xs dark:bg-neutral-900"
                            />
                          : <span
                              className={
                                cellValue === null
                                  ? 'italic text-neutral-400'
                                  : col.pk
                                    ? 'font-mono text-amber-600 dark:text-amber-400'
                                    : ''
                              }
                            >
                              {formatCellValue(cellValue)}
                            </span>
                          }
                        </td>
                      );
                    })}
                    {!readOnly && (
                      <td className="border-b border-neutral-100 px-1 py-1 dark:border-neutral-800">
                        <div className="flex gap-0.5">
                          {pkColumn && !editingCell && (
                            <>
                              <button
                                onClick={() =>
                                  handleCellDoubleClick(
                                    rowId,
                                    columns.find((c) => !c.pk)?.name ?? '',
                                    row[columns.find((c) => !c.pk)?.name ?? '']
                                  )
                                }
                                className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-indigo-600 dark:hover:bg-neutral-700"
                                title="编辑"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteRow(rowId)}
                                className="rounded p-0.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                title="删除"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-1.5 dark:border-neutral-700">
          <span className="text-[10px] text-neutral-500">
            共 {total} 条
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] text-neutral-600 dark:text-neutral-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
