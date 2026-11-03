# Paper

A quiet page for writing. It comes three ways, all saving to the same files in `~/Paper`:

- **The Mac app**: `~/Applications/Paper.app`, one window per paper.
- **The browser version**: http://localhost:4610, running while the Mac app is open (or with `node ~/Paper/app/server.js`).
- **The website**: `~/Paper/site`, which saves in the browser itself.

Move the mouse to the right edge of the window and click the **pencil** for the side bar: notes and to-dos for the paper you're on, the settings, the word count, export, and the tiny pages for all your papers.

## Shortcuts

⌘ is Command, ⌥ is Option, ⇧ is Shift, ⌃ is Control.

### Writing

| Keys | What it does |
|---|---|
| ⌘B · ⌘I · ⌘U | Bold, italic, underline |
| ⌘K | Add or edit a link (empty the address and press Enter to remove it) |
| ⌘⌥F | Add a footnote where the cursor is, and start writing it in the margin |
| ⌘F | Find on the page (whole words, in their forms: "origin" also finds "origins") |
| Enter · ⇧Enter (in find) | Next match · previous match |
| ⌘G · ⇧⌘G | Next match · previous match, while find is open |
| Esc (in find) | Close find, leaving the match selected |
| `* ` or `- ` at the start of a line | Start a bulleted list |
| `1. ` at the start of a line | Start a numbered list |
| Tab · ⇧Tab (in a list) | Indent · outdent the item |
| Enter on an empty item, or Backspace at its start | Leave the list |
| Backspace just after a footnote number | Delete the footnote (Delete just before it does the same) |
| ⌘Z · ⇧⌘Z | Undo · redo |
| ⌘S | Save now (Paper also saves as you type) |

### Footnotes

| Keys | What it does |
|---|---|
| Enter or Esc (in a note) | Back to the writing, just after the number |
| ⌘B · ⌘I · ⌘U (in a note) | Bold, italic, underline in the note |
| Click a footnote number | Go to its note |

### To-dos (in the side bar)

| Keys | What it does |
|---|---|
| Enter | New to-do, taking the rest of the line with it |
| ⇧Enter | New line inside the same to-do |
| Backspace at the start of a to-do | Join it to the one above |
| ⌘Enter | Tick or untick the to-do (or every to-do selected) |
| ⌘Z · ⇧⌘Z | Undo · redo in the to-dos |

### Side bar and windows

| Keys | What it does |
|---|---|
| ⌘\ | Open or close the side bar |
| Esc | Close the side bar |
| ⌘N | New paper in a new window (Mac app) |
| ⌘W | Close the window (Mac app) |
| ⌃⌘F | Full screen (Mac app) |
| ⌘M · ⌘H · ⌘Q | Minimise · hide · quit (Mac app) |

### With the mouse

| Action | What it does |
|---|---|
| Click below the writing | Adds empty lines down to where you clicked, so you can start there |
| Triple-click | Select the whole paragraph |
| Click into a link | Shows its address: click the address to edit it, ↗ to open it |
| ⌘-click a link | Open it |
| Click a to-do's box | Tick it; with several to-dos selected, ticks them all |
| Drag across to-dos | Select several, to delete, cut, copy or retype them together |
| Hover a number in the settings, then click or hold its arrows | Change the size or spacing (drag the number left or right too) |
| Click a setting's value | Cycle through the fonts or paper types |
| The pages icon (bottom right of the side bar) | Show all your papers as tiny pages; the arrow goes back |
| Click a tiny page · the + | Open that paper · start a new one |
| Hover a tiny page, then click its X | Take the paper off the tiny pages. Nothing is deleted: it moves to `~/Paper/removed` (your first paper has no X) |
| Right-click a tiny page | Duplicate, or Delete (to the Trash) |
| Finder: right-click an `.html` or `.md` file › Open With › Paper | Edit it in Paper, saved back where it is (Mac app) |

## Copying and pasting

- **Copying out** keeps bold, italic, underline, links, lists and empty lines in apps that take formatting. Plain-text apps get a line per paragraph, with the empty lines kept.
- **Pasting in** keeps bold, italic, links and lists, but drops other fonts and colours so the page stays one voice. Markdown pasted as plain text is turned into formatting.
- **Spacing** follows the page: paragraphs that were set apart where you copied them get an empty line between them, list items sit close together, stray spaces at the ends of lines go, and paragraphs pasted at the end of a line start on the next one. Word's bullets become a real list.
- **Footnotes** copy with their notes and paste back as footnotes.

## Where things are saved

| What | Where |
|---|---|
| Your first paper | `~/Paper/page.html` (and `page.md`) |
| Other papers | `~/Paper/papers/<paper>.html` (and `.md`) |
| Each paper's notes and to-dos | `~/Paper/notes/<paper>.txt`, `~/Paper/todos/<paper>.md` |
| Settings | `~/Paper/.settings.json` |
| Daily backups | `~/Paper/.history/<date>/`, each file as it was before that day's first change |
| Deleted papers (browser version) | `~/Paper/.trash/` (the Mac app uses the Trash) |
| Papers taken off with the X | `~/Paper/removed/`, laid out like `~/Paper` (`papers/`, `notes/`, `todos/`) |

To delete a removed paper for good, open `~/Paper/removed` in Finder and move its files to the Trash yourself. To bring one back, move its files back into the same folders in `~/Paper`.
