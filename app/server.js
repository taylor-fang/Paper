#!/usr/bin/env node
// Paper: serves the writing page and keeps everything in plain files.
//
//   ~/Paper/page.html        the page (opens in any browser)
//   ~/Paper/page.md          the same page as markdown, kept up to date as you type
//   ~/Paper/notes.txt        side bar notes
//   ~/Paper/todo.md          side bar to-dos, as "- [ ]" lines
//   ~/Paper/days/*.html|.md  daily pages, when that option is on
//   ~/Paper/.history/<date>/ each file as it was before that day's first change
//
// Run: node server.js [--port 4610] [--dir ~/Paper]

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', 4610));
const DIR = path.resolve(arg('dir', path.join(os.homedir(), 'Paper')));
const APP = __dirname;

const NAMED = { notes: 'notes.txt', todo: 'todo.md' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAPER = /^paper-[a-z0-9]+$/; // further papers, saved in ~/Paper/papers

// each paper's own notes and to-dos: ~/Paper/notes/<paper>.txt and ~/Paper/todos/<paper>.md
const SIDE = /^(notes|todo)-(page|paper-[a-z0-9]+|file-[a-z0-9]+)$/;
const sideFiles = (paper) => [path.join(DIR, 'notes', paper + '.txt'), path.join(DIR, 'todos', paper + '.md')];
function fileFor(name) {
  if (name === 'page' || PAPER.test(name)) return locate(name);
  if (NAMED[name]) return path.join(DIR, NAMED[name]);
  const side = name.match(SIDE);
  if (side) return sideFiles(side[2])[side[1] === 'notes' ? 0 : 1];
  if (DAY.test(name)) return path.join(DIR, 'days', name + '.html');
  return null;
}

// ---------- paper file names, as the Mac app does them (see Names in Paper.swift) ----------
// Each paper's ID is written inside its file as <meta name="paper" content="ID">, so the file can be called
// anything: first-paper.html for the first, and every other paper is named after its first line (30 characters at
// most, cut at a word) when you leave it, starting as Untitled. A file you rename yourself keeps your name.
// ~/Paper/.names.json remembers each paper's file and the name Paper last gave it.
const INDEX = path.join(DIR, '.names.json');
const PAPERS = path.join(DIR, 'papers');
const loadNames = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return {}; } };
const saveNames = (m) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify(m, null, 2)); };
const rel = (f) => path.relative(DIR, f);
const htmls = (dir) => { try { return fs.readdirSync(dir).filter((f) => /\.html$/i.test(f)).map((f) => path.join(dir, f)); } catch { return []; } };
const homeOf = (id) => (id === 'page' ? DIR : PAPERS);
const mdOf = (f) => f.replace(/\.html$/i, '.md');
// the ID written inside a file; for a file from before IDs, what its name and place say
function idOf(file) {
  try {
    const fd = fs.openSync(file, 'r'), b = Buffer.alloc(1024), n = fs.readSync(fd, b, 0, 1024, 0);
    fs.closeSync(fd);
    const m = b.toString('utf8', 0, n).match(/<meta name="paper" content="([a-z0-9-]+)">/);
    if (m) return m[1];
  } catch { return null; }
  const base = path.basename(file, '.html'), dir = path.dirname(file);
  if (dir === PAPERS && PAPER.test(base)) return base;
  if (dir === DIR && base === 'page') return 'page';
  return null;
}
// a free name in that folder: the name itself, or "name 2", "name 3"... (not one another paper is already down for)
function unique(want, dir, keep, m = {}, self = null) {
  const taken = new Set(Object.entries(m).filter(([k]) => k !== self).map(([, r]) => String(r.file || '').toLowerCase()));
  for (let n = 1; ; n++) {
    const base = n === 1 ? want : `${want} ${n}`, f = path.join(dir, base + '.html');
    if (keep && f.toLowerCase() === keep.toLowerCase()) return base;
    if (!fs.existsSync(f) && !taken.has(rel(f).toLowerCase())) return base;
  }
}
// a file from before IDs gets its ID written in, before anything renames it, so it's still known by any name
function ensureId(file, id) {
  try {
    const t = fs.readFileSync(file, 'utf8');
    if (/<meta name="paper" content=/.test(t)) return;
    const tag = `<meta name="paper" content="${id}">`;
    fs.writeFileSync(file, /<meta charset="utf-8">/i.test(t) ? t.replace(/<meta charset="utf-8">/i, (x) => `${x}\n${tag}`) : `${tag}\n${t}`);
  } catch {}
}
const legacyName = (f, id) => path.basename(f, '.html') === id;
function move(from, to) {
  fs.renameSync(from, to);
  if (fs.existsSync(mdOf(from)) && !fs.existsSync(mdOf(to))) { try { fs.renameSync(mdOf(from), mdOf(to)); } catch {} }
}
// where a paper's file is now: where it was last, or found by the ID inside it (after a rename in Finder)
function locate(id) {
  const m = loadNames();
  if (m[id]?.file) {
    const f = path.join(DIR, m[id].file);
    if (fs.existsSync(f) && idOf(f) === id) { if (legacyName(f, id)) ensureId(f, id); return f; }
  }
  let f = htmls(homeOf(id)).find((x) => idOf(x) === id);
  if (f) {
    ensureId(f, id);
    const rec = m[id] || {};
    if (rec.file) { // renamed in Finder: its markdown copy follows
      const oldMd = mdOf(path.join(DIR, rec.file));
      if (fs.existsSync(oldMd) && !fs.existsSync(mdOf(f))) { try { fs.renameSync(oldMd, mdOf(f)); } catch {} }
    }
    if (id === 'page' && path.basename(f, '.html') === 'page') { // the first paper from before: page.html is now first-paper.html
      const to = path.join(DIR, unique('first-paper', DIR, null, m, id) + '.html');
      try { move(f, to); f = to; rec.auto = path.basename(to, '.html'); } catch {}
    }
    rec.file = rel(f);
    m[id] = rec;
    saveNames(m);
    return f;
  }
  const base = unique(id === 'page' ? 'first-paper' : 'Untitled', homeOf(id), null, m, id); // a paper with no file yet
  f = path.join(homeOf(id), base + '.html');
  m[id] = { file: rel(f), auto: base };
  saveNames(m);
  return f;
}
// a file name from a paper's first line: 30 characters at most, cut at a word, without characters a file can't have
function nameFrom(html) {
  const line = firstLine(html).split('\n').map((t) => t.trim()).find(Boolean) || '';
  let s = line.replace(/[/:\\]/g, ' ').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').replace(/^[.\s]+/, ''); // no characters a file name can't have
  const chars = [...s];
  if (chars.length > 30) {
    const cut = chars.slice(0, 30).join(''), sp = cut.lastIndexOf(' ');
    s = /\s/.test(chars[30]) || sp < 12 ? cut : cut.slice(0, sp); // a word that ends right at 30 stays whole
  }
  return s.replace(/[\s.,;:\-\u2013\u2014]+$/, '').trim();
}
// when you leave a paper: named after its first line (the first paper, first-paper), unless you've named it yourself
function settle(id) {
  if (!(id === 'page' || PAPER.test(id))) return;
  const f = locate(id);
  if (!fs.existsSync(f)) return;
  const m = loadNames(), base = path.basename(f, '.html');
  if (!(m[id]?.auto === base || base === id)) return; // renamed by you: your name stays
  const want = id === 'page' ? 'first-paper' : nameFrom(fs.readFileSync(f, 'utf8'));
  if (!want || want === base) return;
  const name = unique(want, path.dirname(f), f, m, id);
  if (name === base) return;
  const to = path.join(path.dirname(f), name + '.html');
  try { move(f, to); } catch { return; }
  m[id] = { file: rel(to), auto: name };
  saveNames(m);
}
const isPage = (name) => name === 'page' || DAY.test(name) || PAPER.test(name);

// a paper's first line, as plain text, for the list of papers
// a paper's writing from the top, a line per paragraph, blank lines kept (for its tiny page)
function firstLine(html) {
  const decode = (t) => t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const lines = [...unwrap(html).replace(/<sup class="fn"[^>]*>[\s\S]*?<\/sup>/g, '').matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => decode(m[2]));
  return lines.join('\n').replace(/\s+$/, '').slice(0, 600);
}

// pages are saved as complete HTML documents, so they open on their own
const START = '<!-- paper:start -->';
const END = '<!-- paper:end -->';
const wrap = (body, id) => `<!doctype html>
<meta charset="utf-8">${id ? `\n<meta name="paper" content="${id}">` : ''}
<title>Paper</title>
<style>body{max-width:34em;margin:12vh auto;padding:0 16px;font:20px/1.55 "Times New Roman",serif;color:#000;background:#f3efe6}sup.fn{font-size:.62em;color:#978972}</style>
${START}
${body}
${END}
`;
function unwrap(text) {
  const a = text.indexOf(START);
  const b = text.lastIndexOf(END);
  return a > -1 && b > a ? text.slice(a + START.length, b).trim() : text;
}

const today = () => new Date().toLocaleDateString('en-CA');

function backup(file) {
  if (!fs.existsSync(file)) return;
  const dest = path.join(DIR, '.history', today(), path.relative(DIR, file));
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
}

function write(file, text, keepHistory = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (keepHistory) backup(file);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function send(res, status, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 20 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // only answer to this machine, by name, so other sites can't reach in
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, 'forbidden');
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(APP, 'index.html')), 'text/html; charset=utf-8');
    }

    // the side bar's handwriting font, Inter, and the drawn marks
    const asset = url.pathname.match(/^\/assets\/([\w-]+\.(png|css|woff2))$/);
    if (req.method === 'GET' && asset) {
      const type = { png: 'image/png', css: 'text/css; charset=utf-8', woff2: 'font/woff2' }[asset[2]];
      try { return send(res, 200, fs.readFileSync(path.join(APP, 'assets', asset[1])), type); } catch { return send(res, 404, 'not found'); }
    }

    if (req.method === 'GET' && url.pathname === '/api/papers') {
      const list = [];
      const add = (name, file) => {
        try { list.push({ name, first: firstLine(fs.readFileSync(file, 'utf8')), modified: fs.statSync(file).mtimeMs }); } catch {}
      };
      add('page', locate('page'));
      const seen = new Set();
      for (const f of htmls(PAPERS)) {
        const id = idOf(f);
        if (!id || !PAPER.test(id) || seen.has(id)) continue;
        seen.add(id);
        if (path.basename(f, '.html') === id) settle(id); // a paper from before names: named now
        add(id, locate(id));
      }
      return send(res, 200, JSON.stringify(list), 'application/json');
    }

    if (req.method === 'GET' && url.pathname === '/api/days') {
      let days = [];
      try { days = fs.readdirSync(path.join(DIR, 'days')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)); } catch {}
      return send(res, 200, JSON.stringify(days.filter((d) => DAY.test(d)).sort()), 'application/json');
    }

    // a markdown copy of each page, written next to it
    const md = url.pathname.match(/^\/api\/markdown\/([\w-]+)$/);
    if (md && req.method === 'PUT' && isPage(md[1])) {
      if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
      write(fileFor(md[1]).replace(/\.html$/, '.md'), await readBody(req), false);
      return send(res, 204);
    }

    // leaving a paper: its file is named after its first line (see settle)
    const leave = url.pathname.match(/^\/api\/settle\/([\w-]+)$/);
    if (leave && req.method === 'POST') {
      if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
      settle(leave[1]);
      return send(res, 204);
    }

    const m = url.pathname.match(/^\/api\/files\/([\w-]+)$/);
    if (m) {
      const name = m[1];
      const file = fileFor(name);
      if (!file) return send(res, 404, 'unknown file');

      if (req.method === 'GET') {
        let text = '';
        try { text = fs.readFileSync(file, 'utf8'); } catch {}
        return send(res, 200, isPage(name) ? unwrap(text) : text);
      }
      if (req.method === 'PUT') {
        if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
        const body = await readBody(req);
        write(file, isPage(name) ? wrap(body, name === 'page' || PAPER.test(name) ? name : null) : body);
        return send(res, 204);
      }
      // the X on a tiny page: the paper and its notes and to-dos move, untouched, into ~/Paper/removed (laid out like ~/Paper)
      if (req.method === 'DELETE' && PAPER.test(name) && url.searchParams.get('away') === '1') {
        if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
        for (const f of [file, file.replace(/\.html$/, '.md'), ...sideFiles(name)]) {
          if (!fs.existsSync(f)) continue;
          const to = path.join(DIR, 'removed', path.basename(path.dirname(f)), path.basename(f));
          fs.mkdirSync(path.dirname(to), { recursive: true });
          try { fs.renameSync(f, to); } catch {}
        }
        return send(res, 204);
      }
      // Delete from the tiny pages: the paper moves to ~/Paper/.trash, where it can be got back
      if (req.method === 'DELETE' && PAPER.test(name) && url.searchParams.get('trash') === '1') {
        if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
        const bin = path.join(DIR, '.trash');
        fs.mkdirSync(bin, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const [notesFile, todoFile] = sideFiles(name);
        for (const [f, as] of [[file], [file.replace(/\.html$/, '.md')], [notesFile, name + ' notes.txt'], [todoFile, name + ' to-do.md']]) {
          try { fs.renameSync(f, path.join(bin, (as || path.basename(f)).replace(/(\.\w+)$/, ` ${stamp}$1`))); } catch {}
        }
        return send(res, 204);
      }
      // a blank paper is removed (never the first page, and never one with anything written on it)
      if (req.method === 'DELETE' && PAPER.test(name)) {
        if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
        let text = '';
        try { text = fs.readFileSync(file, 'utf8'); } catch { return send(res, 204); }
        if (unwrap(text).replace(/<[^>]+>/g, '').replace(/&nbsp;|&#8203;|[\s\u00a0\u200b]/g, '')) return send(res, 409, 'not blank');
        for (const f of [file, file.replace(/\.html$/, '.md'), ...sideFiles(name)]) { try { if (f === file || f.endsWith('.md') && f.includes('/papers/') || !fs.readFileSync(f, 'utf8').trim()) fs.unlinkSync(f); } catch {} }
        const names = loadNames(); delete names[name]; saveNames(names);
        return send(res, 204);
      }
    }

    send(res, 404, 'not found');
  } catch (err) {
    console.error(err);
    send(res, 500, String(err.message || err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Paper on http://localhost:${PORT}, saving to ${DIR}`);
});
