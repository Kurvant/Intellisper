import { ErrorCode, IntellisperError } from '@intelblocks/shared'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'

/**
 * Parse + SANITISE a batch input file (CSV or Excel) into parameter-set rows: an array of
 * { columnHeader → cellValue }, one per data row (first row = header).
 *
 * Security posture (uploads are UNTRUSTED user content):
 *  - Safe parsers only: papaparse (CSV) + exceljs (xlsx). We deliberately do NOT use `xlsx`/SheetJS
 *    (known prototype-pollution + ReDoS with no fix) on untrusted files.
 *  - CSV/FORMULA INJECTION: this data is later EXPORTED back to CSV/Excel, so any cell beginning with
 *    `= + - @` (or a control char that re-anchors the cell) is neutralised with a leading apostrophe —
 *    it can never execute as a formula in a spreadsheet, nor be smuggled into the export.
 *  - PROTOTYPE POLLUTION: __proto__/constructor/prototype keys are dropped and rows are built on
 *    NULL-prototype objects, so a crafted header can't pollute Object.prototype.
 *  - Values are coerced to BOUNDED plain strings (control chars → spaces, length capped). They later
 *    become routine params typed into web pages, so they must be inert text — never objects/formulas.
 *  - Hard ceilings on rows and columns regardless of plan (the per-plan cap is a separate, stricter
 *    check enforced at batch-create time).
 */

const MAX_ROWS = 10000 // hard ceiling (per-plan cap is stricter, enforced at create)
const MAX_COLS = 100 // columns/headers per sheet
const MAX_CELL_LEN = 2000 // chars per cell value
const MAX_KEY_LEN = 100 // chars per header

/** Header names that could pollute Object.prototype — never used as keys. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Leading characters a spreadsheet may interpret as a formula (incl. re-anchoring control chars). */
const FORMULA_LEADERS = /^[=+\-@\t\r]/

/**
 * Collapse C0/C1 control characters (including newlines/tabs) to spaces → inert single-line text.
 * Built from char codes (no raw control bytes in source) so the file stays grep/diff-clean while
 * stripping U+0000–U+001F and U+007F–U+009F.
 */
const CONTROL_CHARS = new RegExp(
    `[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}-${String.fromCharCode(0x9f)}]`,
    'g',
)

function stripControl(s: string): string {
    return s.replace(CONTROL_CHARS, ' ')
}

/**
 * Sanitise a cell value into bounded, inert text. Neutralises formula-injection, strips control
 * chars, caps length. Non-string inputs (numbers/dates from Excel) are stringified.
 */
export function sanitizeCell(v: unknown): string {
    if (v === null || v === undefined) return ''
    let s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : String(v)
    s = stripControl(s).trim()
    if (s.length > MAX_CELL_LEN) s = s.slice(0, MAX_CELL_LEN)
    // Formula/CSV-injection neutralisation: prefix a literal apostrophe so a spreadsheet treats the
    // cell strictly as text on any later export/open.
    if (s && FORMULA_LEADERS.test(s)) s = `'${s}`
    return s
}

/** Sanitise a header into a safe, non-polluting key, or '' if unusable. */
export function sanitizeKey(k: unknown): string {
    if (k === null || k === undefined) return ''
    let key = stripControl(String(k)).trim()
    if (key.length > MAX_KEY_LEN) key = key.slice(0, MAX_KEY_LEN)
    if (!key || FORBIDDEN_KEYS.has(key.toLowerCase())) return ''
    return key
}

function badRequest(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.VALIDATION, params: { message } })
}

/** Build sanitised, null-prototype row objects from a header + data matrix. */
function rowsFromMatrix(rawHeader: unknown[], dataRows: unknown[][]): Record<string, unknown>[] {
    if (rawHeader.length > MAX_COLS) throw badRequest(`Too many columns (max ${MAX_COLS}).`)
    // Sanitise + de-duplicate headers; remember each column's resolved key (or null).
    const seen = new Set<string>()
    const colKeys: (string | null)[] = rawHeader.map((h) => {
        const key = sanitizeKey(h)
        if (!key || seen.has(key)) return null
        seen.add(key)
        return key
    })
    if (!seen.size) throw badRequest('The file has no usable column headers in its first row.')

    const out: Record<string, unknown>[] = []
    for (const row of dataRows) {
        if (!row || row.every((c) => sanitizeCell(c) === '')) continue
        const obj: Record<string, unknown> = Object.create(null)
        colKeys.forEach((key, i) => {
            if (key) obj[key] = sanitizeCell(row[i])
        })
        out.push(obj)
        if (out.length > MAX_ROWS) throw badRequest(`Too many rows (max ${MAX_ROWS}).`)
    }
    if (!out.length) throw badRequest('The file has no data rows.')
    return out
}

function isExcel(mime: string, name: string): boolean {
    return (
        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mime === 'application/vnd.ms-excel' ||
        /\.xlsx?$/i.test(name)
    )
}

function isCsv(mime: string, name: string): boolean {
    return mime === 'text/csv' || mime === 'application/csv' || /\.csv$/i.test(name) || mime === 'text/plain'
}

/** Parse + sanitise an uploaded CSV/Excel file buffer into parameter-set rows. */
export async function parseBatchFile(buffer: Buffer, mime: string, name: string): Promise<Record<string, unknown>[]> {
    if (isExcel(mime, name)) {
        const wb = new ExcelJS.Workbook()
        // exceljs' load() expects its own Buffer typing; the Node Buffer is byte-compatible.
        await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
        const ws = wb.worksheets[0]
        if (!ws) throw badRequest('The Excel file has no worksheets.')
        const matrix: unknown[][] = []
        ws.eachRow({ includeEmpty: false }, (row) => {
            const vals = (row.values as unknown[]).slice(1).map((v) =>
                v && typeof v === 'object' && 'text' in v ? (v as { text: unknown }).text
                    : v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result
                        : v,
            )
            matrix.push(vals)
        })
        if (matrix.length < 2) throw badRequest('The Excel file needs a header row and at least one data row.')
        return rowsFromMatrix(matrix[0], matrix.slice(1))
    }

    if (isCsv(mime, name)) {
        const text = buffer.toString('utf8')
        // Parse WITHOUT header mode so we control header sanitisation + de-dup and never let papaparse
        // build object keys directly from untrusted headers.
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
        const matrix = (parsed.data ?? []).filter((r): r is string[] => Array.isArray(r))
        if (matrix.length < 2) throw badRequest('The CSV needs a header row and at least one data row.')
        return rowsFromMatrix(matrix[0], matrix.slice(1))
    }

    throw badRequest('Unsupported file type. Upload a CSV or Excel (.xlsx) file.')
}

/** Normalise + sanitise a pasted/JSON list of row objects into parameter sets. */
export function normaliseRows(rows: unknown): Record<string, unknown>[] {
    if (!Array.isArray(rows)) throw badRequest('Rows must be a list.')
    if (rows.length > MAX_ROWS) throw badRequest(`Too many rows (max ${MAX_ROWS}).`)
    const out = rows
        .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
        .map((r) => {
            const obj: Record<string, unknown> = Object.create(null)
            let cols = 0
            for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
                const key = sanitizeKey(k)
                if (!key || key in obj) continue
                if (++cols > MAX_COLS) break
                obj[key] = sanitizeCell(v)
            }
            return obj
        })
        .filter((r) => Object.keys(r).length > 0)
    if (!out.length) throw badRequest('No usable rows were provided.')
    return out
}

export const BATCH_INPUT_LIMITS = { MAX_ROWS, MAX_COLS, MAX_CELL_LEN, MAX_KEY_LEN }
