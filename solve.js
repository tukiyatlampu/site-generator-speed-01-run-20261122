// Fast drop-in for makefun-site 1.0.0 (site-generator-speed-01-run-20261122).
// run(input) returns, byte for byte, the output tree makefun-site 1.0.0's build
// returns for the same input. Dependency-free ES module; no imports, no I/O,
// no clock, no randomness. Optimised for CPU time: templates are compiled to
// JS functions once per case, Markdown is lexed and rendered in a single fused
// pass, slugify results are cached per case, and strings are built in arrays.

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- text
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const HTML_SPECIAL = /[&<>"']/g;

/** HTML-escape, with a fast path when nothing needs escaping. */
function escapeHtml(text) {
  if (
    text.indexOf('&') === -1 && text.indexOf('<') === -1 && text.indexOf('>') === -1 &&
    text.indexOf('"') === -1 && text.indexOf("'") === -1
  ) return text;
  return text.replace(HTML_SPECIAL, (c) => ESCAPES[c]);
}

const SLUG_MAX = 64;
const NON_ASCII = /[^\x00-\x7F]/;

/** Slug of `text`, cached per case in `cache` (Map). ASCII fast path skips NFKD. */
function slugify(text, cache) {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let plain;
  if (NON_ASCII.test(text)) plain = text.normalize('NFKD').replace(/\p{M}/gu, '');
  else plain = text;
  let out = '';
  let gap = false;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    let keep = null;
    if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
    else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
    if (keep === null) {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += keep;
  }
  out = out.slice(0, SLUG_MAX).replace(/-+$/, '');
  const slug = out === '' ? 'untitled' : out;
  cache.set(text, slug);
  return slug;
}

function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(date) {
  const y = date.slice(0, 4);
  const m = date.slice(5, 7);
  const d = date.slice(8, 10);
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// ---------------------------------------------------------------- front matter
const FM_KEYS = ['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary'];
const FM_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FM_NAME = /^[a-z0-9-]+$/;
const FM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FM_TAG = /^[^"[\]]+$/;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function stringOf(raw) {
  if (raw.charCodeAt(0) === 34) {
    if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.charCodeAt(0) === 91) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = FM_DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(raw.length - 1) !== 93) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      if (tags.some((t) => t === '' || !FM_TAG.test(t))) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return FM_NAME.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return FM_SLUG.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

function isBlankLine(line) {
  if (line.length === 0) return true;
  const c0 = line[0];
  if (c0 !== ' ' && c0 !== '\t') return false;
  for (let i = 1; i < line.length; i++) {
    const c = line[i];
    if (c !== ' ' && c !== '\t') return false;
  }
  return true;
}

/** Front matter + body, or { error }. `text` has "\n" line ends. */
function parseFrontMatter(text) {
  if (text !== '---' && !text.startsWith('---\n')) return { error: 'no front matter' };
  // Find the closing '---' line.
  let pos = 4; // just past '---\n'
  let closeStart = -1;
  let closeEnd = -1; // index just past the closing line's '\n', or text.length
  let lineNo = 1; // 0-based index of the line starting at pos
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    const line = text.slice(pos, end);
    if (line === '---') {
      closeStart = pos;
      closeEnd = nl === -1 ? text.length : nl + 1;
      break;
    }
    if (nl === -1) break;
    pos = nl + 1;
    lineNo++;
  }
  if (closeStart === -1) return { error: 'the front matter is not closed' };
  const data = {};
  pos = 4;
  let n = 1; // 0-based line index of the line starting at pos (opening --- is 0)
  while (pos < closeStart) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? closeStart : nl;
    const line = text.slice(pos, end);
    if (!isBlankLine(line) && line.charCodeAt(0) !== 35) {
      // Must match: key [a-z_]+, ':', then end or ' ' + rest.
      let k = 0;
      while (k < line.length) {
        const c = line.charCodeAt(k);
        if ((c >= 97 && c <= 122) || c === 95) k++;
        else break;
      }
      const key = line.slice(0, k);
      let raw;
      if (k === 0 || line.charCodeAt(k) !== 58) {
        return { error: `line ${n + 1} is not "key: value"` };
      } else if (k + 1 === line.length) {
        raw = '';
      } else if (line.charCodeAt(k + 1) === 32) {
        raw = line.slice(k + 2).replace(/[ \t]+$/, '');
      } else {
        return { error: `line ${n + 1} is not "key: value"` };
      }
      if (!FM_KEYS.includes(key)) return { error: `unknown key "${key}"` };
      if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
      if (raw === '') return { error: `key "${key}" has no value` };
      const v = valueOf(key, raw);
      if ('error' in v) return v;
      data[key] = v.value;
    }
    pos = nl === -1 ? closeStart : nl + 1;
    n++;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: closeEnd >= text.length ? '' : text.slice(closeEnd) };
}

// ---------------------------------------------------------------- markdown
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

function findUnescaped(s, what, from) {
  for (let j = from; j <= s.length - what.length; j++) {
    if (s[j] === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (c !== '*') continue;
    if (s[j + 1] === '*') {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

const WS_RE = /\s/;

const MD_SPECIAL = /[\\`*\[&<>"']/g;

/** Inline Markdown to HTML. `link(target)` resolves a link target. */
function inlineMd(s, link) {
  const out = [];
  const n = s.length;
  let i = 0;
  let run = 0; // start of the pending plain run (holds no special char by construction)
  while (i < n) {
    MD_SPECIAL.lastIndex = i;
    const m = MD_SPECIAL.exec(s);
    const p = m === null ? n : m.index;
    if (p === n) break;
    const c = s[p];
    if (c === '&' || c === '<' || c === '>' || c === '"' || c === "'") {
      if (p > run) out.push(s.slice(run, p));
      out.push(ESCAPES[c]);
      i = p + 1;
      run = i;
      continue;
    }
    if (c === '\\') {
      if (p + 1 < n && ESCAPABLE.has(s[p + 1])) {
        if (p > run) out.push(s.slice(run, p));
        out.push(ESCAPES[s[p + 1]] ?? s[p + 1]);
        i = p + 2;
        run = i;
      } else {
        i = p + 1; // a lone backslash is plain text; keep scanning
      }
      continue;
    }
    if (c === '`') {
      const j = s.indexOf('`', p + 1);
      if (j > p + 1) {
        if (p > run) out.push(s.slice(run, p));
        out.push('<code>', escapeHtml(s.slice(p + 1, j)), '</code>');
        i = j + 1;
        run = i;
      } else {
        i = p + 1; // a backtick with no closer is itself
      }
      continue;
    }
    if (c === '*') {
      if (s[p + 1] === '*') {
        const j = findUnescaped(s, '**', p + 2);
        if (j > p + 2) {
          if (p > run) out.push(s.slice(run, p));
          out.push('<strong>', inlineMd(s.slice(p + 2, j), link), '</strong>');
          i = j + 2;
          run = i;
        } else {
          if (p > run) out.push(s.slice(run, p));
          out.push('**');
          i = p + 2;
          run = i;
        }
        continue;
      }
      const j = findSingleStar(s, p + 1);
      if (j > p + 1) {
        if (p > run) out.push(s.slice(run, p));
        out.push('<em>', inlineMd(s.slice(p + 1, j), link), '</em>');
        i = j + 1;
        run = i;
      } else {
        i = p + 1; // a lone * is itself
      }
      continue;
    }
    // c === '[' (any other char reaching here is plain text)
    if (c !== '[') {
      i = p + 1;
      continue;
    }
    const k = findUnescaped(s, ']', p + 1);
    const q = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
    const target = q === -1 ? '' : s.slice(k + 2, q);
    if (target !== '' && !WS_RE.test(target)) {
      if (p > run) out.push(s.slice(run, p));
      out.push('<a href="', escapeHtml(link(target)), '">', inlineMd(s.slice(p + 1, k), link), '</a>');
      i = q + 1;
      run = i;
    } else {
      i = p + 1; // a '[' that opens no link is itself
    }
  }
  if (n > run) out.push(s.slice(run, n));
  return out.join('');
}

const LANG_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_+-';

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b && (line[a] === ' ' || line[a] === '\t')) a++;
  while (b > a && (line[b - 1] === ' ' || line[b - 1] === '\t')) b--;
  return line.slice(a, b);
}

/** Fence-open language, or null. Line starts with ``` then lang chars then spaces/tabs. */
function fenceLang(line) {
  if (line.length < 3 || line[0] !== '`' || line[1] !== '`' || line[2] !== '`') return null;
  let j = 3;
  while (j < line.length && LANG_CHARS.indexOf(line[j]) !== -1) j++;
  const lang = line.slice(3, j);
  while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
  return j === line.length ? lang : null;
}

function fenceClose(line) {
  if (line.length < 3 || line[0] !== '`' || line[1] !== '`' || line[2] !== '`') return false;
  for (let j = 3; j < line.length; j++) if (line[j] !== ' ' && line[j] !== '\t') return false;
  return true;
}

/** { depth, text } or null. */
function headingOf(line) {
  let i = 0;
  while (i < line.length && line[i] === '#') i++;
  if (i === 0 || i > 6) return null;
  if (i >= line.length || (line[i] !== ' ' && line[i] !== '\t')) return null;
  let j = i;
  while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
  let end = line.length;
  while (end > j && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--;
  if (end === j) return null;
  return { depth: i, text: line.slice(j, end) };
}

function isHr(line) {
  if (line.length < 3) return false;
  const c = line[0];
  if (c !== '-' && c !== '*') return false;
  if (line[1] !== c || line[2] !== c) return false;
  for (let j = 3; j < line.length; j++) if (line[j] !== ' ' && line[j] !== '\t') return false;
  return true;
}

function isContinued(line) {
  let j = 0;
  while (j < line.length && line[j] === ' ') j++;
  return j >= 2 && j < line.length && !WS_RE.test(line[j]);
}

function endsParagraph(line) {
  return isBlankLine(line) || fenceLang(line) !== null || headingOf(line) !== null || isHr(line);
}

/** Words in one line: runs of non-whitespace (the same set /\S/ matches). */
function countLineWords(line, words, inWord) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    const ws = c <= 32 || c === 0x00a0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
      c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
    if (ws) inWord = false;
    else if (!inWord) {
      inWord = true;
      words++;
    }
  }
  return words;
}

/**
 * Render a Markdown body: { html, toc, excerpt, words }. Single fused pass over
 * the lines (word counting rides along: a word run never spans a line, since
 * "\n" is whitespace); `link` resolves link targets; `slugCache` is the case's
 * slug cache.
 */
function renderMarkdown(src, link, slugCache) {
  const lines = src.split('\n');
  const blocks = [];
  const toc = [];
  const ids = new Set();
  let excerpt = null;
  let words = 0;
  let i = 0;
  const L = lines.length;
  while (i < L) {
    const line = lines[i];
    words = countLineWords(line, words, false);
    if (isBlankLine(line)) {
      i++;
      continue;
    }
    const lang = fenceLang(line);
    if (lang !== null) {
      const body = [];
      i++;
      while (i < L && !fenceClose(lines[i])) {
        words = countLineWords(lines[i], words, false);
        body.push(lines[i++]);
      }
      if (i < L) words = countLineWords(lines[i], words, false); // the closing fence line
      i++;
      const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
      let code = '';
      for (let k = 0; k < body.length; k++) code += `${escapeHtml(body[k])}\n`;
      blocks.push(`<pre><code${cls}>${code}</code></pre>\n`);
      continue;
    }
    const heading = headingOf(line);
    if (heading !== null) {
      const id = uniqueSlug(slugify(heading.text, slugCache), ids);
      const html = inlineMd(heading.text, link);
      blocks.push(`<h${heading.depth} id="${id}">${html}</h${heading.depth}>\n`);
      if (heading.depth === 2 || heading.depth === 3) toc.push({ level: heading.depth, id, html });
      i++;
      continue;
    }
    if (isHr(line)) {
      blocks.push('<hr>\n');
      i++;
      continue;
    }
    if (line.charCodeAt(0) === 62) {
      const body = [];
      const first = i;
      while (i < L && lines[i].charCodeAt(0) === 62) {
        if (i !== first) words = countLineWords(lines[i], words, false);
        let t = lines[i].slice(1);
        if (t.charCodeAt(0) === 32) t = t.slice(1);
        t = trimLine(t);
        if (t !== '') body.push(t);
        i++;
      }
      blocks.push(body.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inlineMd(body.join('\n'), link)}</p>\n</blockquote>\n`);
      continue;
    }
    // List?
    let bullet = null;
    let ordered = null;
    if (line.length >= 2 && (line[0] === '-' || line[0] === '*') && line[1] === ' ') bullet = line.slice(2);
    if (bullet === null) {
      let d = 0;
      while (d < line.length && line.charCodeAt(d) >= 48 && line.charCodeAt(d) <= 57) d++;
      if (d >= 1 && d <= 9 && line[d] === '.' && line[d + 1] === ' ') {
        ordered = { start: Number(line.slice(0, d)), text: line.slice(d + 2) };
      }
    }
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const items = [];
      const first = i;
      while (i < L) {
        const l = lines[i];
        let item = null;
        if (!isOrdered) {
          if (l.length >= 2 && (l[0] === '-' || l[0] === '*') && l[1] === ' ') item = l.slice(2);
        } else {
          let d = 0;
          while (d < l.length && l.charCodeAt(d) >= 48 && l.charCodeAt(d) <= 57) d++;
          if (d >= 1 && d <= 9 && l[d] === '.' && l[d + 1] === ' ') item = l.slice(d + 2);
        }
        if (item !== null) {
          if (i !== first) words = countLineWords(l, words, false);
          items.push([trimLine(item)]);
          i++;
        } else if (isContinued(l)) {
          if (i !== first) words = countLineWords(l, words, false);
          items[items.length - 1].push(trimLine(l));
          i++;
        } else break;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      const open = isOrdered && ordered.start !== 1 ? `<ol start="${ordered.start}">` : `<${tag}>`;
      let listHtml = `${open}\n`;
      for (let k = 0; k < items.length; k++) listHtml += `<li>${inlineMd(items[k].join('\n'), link)}</li>\n`;
      blocks.push(`${listHtml}</${tag}>\n`);
      continue;
    }
    // Paragraph.
    const body = [trimLine(line)];
    i++;
    while (i < L && !endsParagraph(lines[i])) {
      words = countLineWords(lines[i], words, false);
      body.push(trimLine(lines[i++]));
    }
    const html = inlineMd(body.join('\n'), link);
    if (excerpt === null) excerpt = html;
    blocks.push(`<p>${html}</p>\n`);
  }
  return { html: blocks.join(''), toc, excerpt: excerpt ?? '', words };
}

// ---------------------------------------------------------------- templates
const INCLUDE_DEPTH = 8;
const TPL_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const TPL_FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const TPL_IF = /^if (not )?(\S+)$/;
const TPL_INCLUDE = /^include "([a-z0-9-]+)"$/;

class TemplateError extends Error {}

function pathOf(name, text) {
  if (!TPL_PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = TPL_FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = TPL_IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = TPL_INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

function lookup(scope, path) {
  let s = scope;
  while (s !== null && !Object.hasOwn(s.vars, path[0])) s = s.parent;
  if (s === null) return undefined;
  let v = s.vars[path[0]];
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

/** Interpreted render (fallback when codegen is unavailable). */
function renderNodes(nodes, scope, R, depth, out) {
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        out.push(n.text);
        break;
      case 'var':
        out.push(R.esc(textOf(lookup(scope, n.path))));
        break;
      case 'raw':
        out.push(textOf(lookup(scope, n.path)));
        break;
      case 'if': {
        const v = truthy(lookup(scope, n.path));
        const branch = v !== n.not ? n.then : n.else;
        if (branch !== null) renderNodes(branch, scope, R, depth, out);
        break;
      }
      case 'for': {
        const xs = lookup(scope, n.path);
        if (!Array.isArray(xs)) break;
        for (let k = 0; k < xs.length; k++) {
          const vars = { [n.name]: xs[k], loop: { index: k + 1, first: k === 0, last: k === xs.length - 1, length: xs.length } };
          renderNodes(n.body, { vars, parent: scope }, R, depth, out);
        }
        break;
      }
      case 'include': {
        const t = R.nodes.get(n.name);
        if (t !== undefined && depth < INCLUDE_DEPTH) renderNodes(t, scope, R, depth + 1, out);
        break;
      }
    }
  }
}

/** Compile one template's node tree into a fast function (sc, R, D) => string. */
function compileTemplate(nodes) {
  let uid = 0;
  const gen = (ns, sc) => {
    let code = '';
    for (const n of ns) {
      if (n.kind === 'text') code += `o.push(${JSON.stringify(n.text)});`;
      else if (n.kind === 'var') code += `o.push(R.esc(R.txt(R.lk(${sc},${JSON.stringify(n.path)}))));`;
      else if (n.kind === 'raw') code += `o.push(R.txt(R.lk(${sc},${JSON.stringify(n.path)})));`;
      else if (n.kind === 'if') {
        code += `if(R.tru(R.lk(${sc},${JSON.stringify(n.path)}))!==${n.not}){${gen(n.then, sc)}}`;
        if (n.else !== null) code += `else{${gen(n.else, sc)}}`;
      } else if (n.kind === 'for') {
        const u = uid++;
        code += `const _a${u}=R.lk(${sc},${JSON.stringify(n.path)});if(Array.isArray(_a${u})){for(let _k${u}=0;_k${u}<_a${u}.length;_k${u}++){const _s${u}={vars:{[${JSON.stringify(n.name)}]:_a${u}[_k${u}],loop:{index:_k${u}+1,first:_k${u}===0,last:_k${u}===_a${u}.length-1,length:_a${u}.length}},parent:${sc}};${gen(n.body, `_s${u}`)}}}`;
      } else if (n.kind === 'include') {
        const u = uid++;
        code += `const _f${u}=R.fns.get(${JSON.stringify(n.name)});if(_f${u}!==undefined&&D<${INCLUDE_DEPTH})o.push(_f${u}(${sc},R,D+1));`;
      }
    }
    return code;
  };
  const src = `let o=[];${gen(nodes, 'sc')}return o.join('');`;
  return new Function('sc', 'R', 'D', src); // eslint-disable-line no-new-func
}

/** Compile every parsed template; a template whose codegen fails gets an interpreter wrapper. */
function compileAll(templates) {
  const fns = new Map();
  for (const [name, nodes] of templates) {
    try {
      fns.set(name, compileTemplate(nodes));
    } catch {
      fns.set(name, (sc, R, D) => {
        const out = [];
        renderNodes(nodes, sc, R, D, out);
        return out.join('');
      });
    }
  }
  return fns;
}

// ---------------------------------------------------------------- pipeline
const RESERVED = ['posts', 'tags', 'page'];

/** Count runs of non-whitespace (the same set /\S/ matches). */
function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** makefun-site 1.0.0's answer for one case's input. */
export function run(input) {
  const slugCache = new Map();
  const report = [];
  const templates = new Map();
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    try {
      templates.set(name, parseTemplate(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const fns = compileAll(templates);
  const R = { fns, nodes: templates, esc: escapeHtml, txt: textOf, tru: truthy, lk: lookup };
  const base = input.site.base_url.replace(/\/+$/, '');
  const output = {};

  // 1. Sources, sorted by path in code-unit order; .md sources, the rest static.
  const files = [...input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  const sources = [];
  const statics = [];
  for (const f of files) {
    if (f.path.endsWith('.md')) sources.push({ path: f.path, text: f.content.replace(/\r\n?/g, '\n') });
    else statics.push({ path: f.path, content: f.content });
  }

  // 2. Front matter, in source order; first failing check is reported.
  const kept = [];
  for (const s of sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) {
      report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = RESERVED.find((d) => d !== 'posts' && s.path.startsWith(`${d}/`));
    if (own !== undefined) {
      report.push(`refused ${s.path}: ${own}/ is the generator's own`);
      continue;
    }
    if (s.post && !Object.hasOwn(s.data, 'date')) {
      report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!templates.has(layout)) {
      report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }

  // 3. Permalinks: slug unique in its directory, in source order.
  const taken = new Map();
  const bySource = new Map();
  for (const s of kept) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    let set = taken.get(dir);
    if (set === undefined) {
      set = new Set(dir === '' ? RESERVED : []);
      taken.set(dir, set);
    }
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title, slugCache), set);
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${base}/${s.outDir}/`;
    bySource.set(s.path, s);
  }

  // 4. Markdown, links resolved to pages and static files.
  const staticPaths = new Set(statics.map((f) => f.path));
  const broken = new Set();
  for (const s of kept) {
    const dir = dirOf(s.path);
    const link = (target) => {
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('/') || target.startsWith('#')) return target;
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const frag = hash === -1 ? '' : target.slice(hash);
      const path = rel === '' ? null : resolvePath(dir, rel);
      if (path !== null && bySource.has(path)) return `${bySource.get(path).url}${frag}`;
      if (path !== null && staticPaths.has(path)) return `${base}/${path}${frag}`;
      broken.add(`broken-link ${s.path} -> ${target}`);
      return target;
    };
    const md = renderMarkdown(s.body, link, slugCache);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
    s.words = md.words;
  }

  // 5. Collections: posts newest first, ties by slug; newer/older neighbours.
  const posts = kept.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  posts.forEach((p, k) => {
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  });

  // 6. Tags, grouped by slug, ordered by count then slug.
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    const out = [];
    for (const name of s.data.tags ?? []) {
      const slug = slugify(name, slugCache);
      if (!seen.has(slug)) {
        seen.add(slug);
        out.push(name);
      }
    }
    return out;
  };
  for (const p of posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const slug = slugify(name, slugCache);
      let tag = bySlug.get(slug);
      if (tag === undefined) {
        tag = { name, slug, url: `${base}/tags/${slug}/`, posts: [] };
        bySlug.set(slug, tag);
      }
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of kept) {
    if (!s.post) {
      s.tagRefs = ownTags(s).map((name) => {
        const slug = slugify(name, slugCache);
        return bySlug.get(slug) ?? { name, slug, url: '', posts: [] };
      });
    }
  }
  const tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));

  // Cards, pages and layouts.
  const linkOf = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) });
  const cardOf = (s) => ({
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: Math.max(1, Math.ceil(s.words / 200)),
    tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
  });
  for (const p of posts) p.card = cardOf(p);
  const pageOf = (s) => {
    const c = s.post ? s.card : cardOf(s);
    return {
      title: c.title,
      url: c.url,
      date: c.date,
      date_long: c.date_long,
      summary: c.summary,
      excerpt: c.excerpt,
      reading_minutes: c.reading_minutes,
      tags: c.tags,
      slug: s.slug,
      content: s.html,
      toc: s.toc.map((h) => ({ level: h.level, id: h.id, html: h.html })),
      newer: linkOf(s.newer ?? null),
      older: linkOf(s.older ?? null),
      is_post: s.post,
    };
  };
  const site = { title: input.site.title, base_url: base };
  const allTags = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => p.card);
  const render = (name, vars) => {
    const fn = fns.get(name);
    if (fn === undefined) return null;
    return fn({ vars: { site, tags: allTags, recent, ...vars }, parent: null }, R, 0);
  };
  for (const s of kept) output[`${s.outDir}/index.html`] = render(s.layout, { page: pageOf(s) });
  const per = input.site.per_page;
  const pages = Math.max(1, Math.ceil(posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${base}/` : `${base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: posts.slice((k - 1) * per, k * per).map((p) => p.card),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of tags) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => p.card) } });
    if (html !== null) output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) output['tags/index.html'] = tagsHtml;
  for (const f of statics) {
    if (Object.hasOwn(output, f.path)) report.push(`shadowed ${f.path}: a built page has its path`);
    else output[f.path] = f.content;
  }

  // 7. Report.
  const lines = [...report, ...broken].sort(byCodeUnits);
  const pageCount = kept.filter((s) => !s.post).length;
  lines.push(`built ${pageCount} pages, ${posts.length} posts, ${tags.length} tags and ${statics.length} static files`);
  output['build-report.txt'] = `${lines.join('\n')}\n`;
  return output;
}
