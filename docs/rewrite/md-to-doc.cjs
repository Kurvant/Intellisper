/* One-off converter: markdown spec -> Word-openable HTML (.doc).
   Tailored to tenancy-and-enterprise-capability-spec.md. Converts headings by
   hierarchy, bold/italic/code, ordered/unordered lists, checkbox items,
   blockquotes, tables, and horizontal rules; strips raw markdown symbols. */
const fs = require('fs')
const path = require('path')

const srcPath = path.join(__dirname, 'tenancy-and-enterprise-capability-spec.md')
const outPath = path.join(__dirname, 'tenancy-and-enterprise-capability-spec.doc')
const md = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n')
const lines = md.split('\n')

function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// Inline: **bold**, *italic*, `code`. Apply on already-escaped text.
function inline(s) {
    let t = esc(s)
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    return t
}

const out = []
let i = 0
const listStack = [] // track open <ul>/<ol>

function closeLists() {
    while (listStack.length) { out.push(`</${listStack.pop()}>`) }
}

while (i < lines.length) {
    let line = lines[i]
    const trimmed = line.trim()

    // Horizontal rule
    if (/^---+$/.test(trimmed)) { closeLists(); out.push('<hr/>'); i++; continue }
    // Blank
    if (trimmed === '') { closeLists(); i++; continue }

    // Headings by hierarchy
    let m
    if ((m = /^(#{1,6})\s+(.*)$/.exec(trimmed))) {
        closeLists()
        const level = m[1].length
        out.push(`<h${level}>${inline(m[2])}</h${level}>`)
        i++; continue
    }

    // Table block: a line with | and the next line a separator |---|
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        closeLists()
        const header = trimmed.slice(1, -1).split('|').map(c => c.trim())
        i += 2
        const rows = []
        while (i < lines.length && lines[i].trim().startsWith('|')) {
            rows.push(lines[i].trim().slice(1, -1).split('|').map(c => c.trim()))
            i++
        }
        out.push('<table border="1" cellspacing="0" cellpadding="4">')
        out.push('<tr>' + header.map(h => `<th>${inline(h)}</th>`).join('') + '</tr>')
        for (const r of rows) { out.push('<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>') }
        out.push('</table>')
        continue
    }

    // Blockquote (possibly multi-line)
    if (trimmed.startsWith('>')) {
        closeLists()
        const buf = []
        while (i < lines.length && lines[i].trim().startsWith('>')) {
            buf.push(lines[i].trim().replace(/^>\s?/, ''))
            i++
        }
        out.push(`<p style="margin-left:24px;border-left:3px solid #999;padding-left:10px;">${inline(buf.join(' '))}</p>`)
        continue
    }

    // Checkbox list item: - [ ] text
    if ((m = /^[-*]\s+\[ \]\s+(.*)$/.exec(trimmed))) {
        if (listStack[listStack.length - 1] !== 'ul') { closeLists(); out.push('<ul>'); listStack.push('ul') }
        out.push(`<li>&#9744; ${inline(m[1])}</li>`)
        i++; continue
    }
    // Ordered list item
    if ((m = /^\d+\.\s+(.*)$/.exec(trimmed))) {
        if (listStack[listStack.length - 1] !== 'ol') { closeLists(); out.push('<ol>'); listStack.push('ol') }
        out.push(`<li>${inline(m[1])}</li>`)
        i++; continue
    }
    // Unordered list item (also handles nested "  - " by flattening one level)
    if ((m = /^[-*]\s+(.*)$/.exec(trimmed))) {
        if (listStack[listStack.length - 1] !== 'ul') { closeLists(); out.push('<ul>'); listStack.push('ul') }
        out.push(`<li>${inline(m[1])}</li>`)
        i++; continue
    }

    // Continuation of a list item that wrapped to the next indented line:
    // append to the previous <li> if we are inside a list and the line is indented.
    if (listStack.length && /^\s+\S/.test(line) && out.length && out[out.length - 1].startsWith('<li>')) {
        out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, '') + ' ' + inline(trimmed) + '</li>'
        i++; continue
    }

    // Plain paragraph (merge following non-blank, non-structural lines)
    closeLists()
    const para = [trimmed]
    i++
    while (i < lines.length) {
        const t = lines[i].trim()
        if (t === '' || /^(#{1,6})\s/.test(t) || t.startsWith('>') || t.startsWith('|') || /^---+$/.test(t) || /^[-*]\s/.test(t) || /^\d+\.\s/.test(t)) break
        para.push(t); i++
    }
    out.push(`<p>${inline(para.join(' '))}</p>`)
}
closeLists()

const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<title>Multi-Tenant Automation Platform — Capability &amp; Requirements Specification</title>
<style>
 body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; color:#1a1a1a; }
 h1 { font-size: 20pt; font-weight: bold; margin: 18pt 0 8pt; }
 h2 { font-size: 15pt; font-weight: bold; margin: 14pt 0 6pt; }
 h3 { font-size: 12.5pt; font-weight: bold; margin: 10pt 0 4pt; }
 p { margin: 4pt 0; }
 code { font-family: Consolas, "Courier New", monospace; font-size: 10pt; background:#f2f2f2; }
 table { border-collapse: collapse; margin: 6pt 0; }
 th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
 th { background:#eee; }
 ul, ol { margin: 4pt 0 4pt 0; }
 li { margin: 2pt 0; }
 hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
</style>
</head>
<body>
${out.join('\n')}
</body>
</html>
`
fs.writeFileSync(outPath, html, 'utf8')
console.log('Wrote', outPath, '(', html.length, 'bytes )')
