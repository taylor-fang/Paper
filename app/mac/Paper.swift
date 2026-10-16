// Paper.app: the writing page in a plain Mac window, one window per paper.
// It's self-contained: the page is bundled inside the app, and the app saves to ~/Paper itself,
// in the same files the local server uses, so the two can be used side by side.
//
//   ~/Paper/page.html          the first paper (opens in any browser)
//   ~/Paper/papers/*.html      every other paper; each has a .md copy beside it
//   ~/Paper/notes.txt          side bar notes
//   ~/Paper/todo.md            side bar to-dos, as "- [ ]" lines
//   ~/Paper/.settings.json     font, size, spacing, paper
//   ~/Paper/.history/<date>/   each file as it was before that day's first change
//
// File › New Paper (⌘N) opens a new window with a new paper; File › Show in Finder
// reveals the paper in the front window. The side bar's pages icon lists them all.

import Cocoa
import WebKit

let home = FileManager.default.homeDirectoryForCurrentUser
let dataDir = home.appendingPathComponent("Paper")
let paperColor = NSColor(srgbRed: 0xf3 / 255, green: 0xef / 255, blue: 0xe6 / 255, alpha: 1)

// ---------- files ----------

enum Store {
    static let named = ["page": "page.html", "notes": "notes.txt", "todo": "todo.md"]
    static let start = "<!-- paper:start -->"
    static let end = "<!-- paper:end -->"

    static func isPaperName(_ name: String) -> Bool {
        name.range(of: "^paper-[a-z0-9]+$", options: .regularExpression) != nil
    }
    static func isPage(_ name: String) -> Bool { name == "page" || isPaperName(name) }

    static func url(_ name: String) -> URL? {
        if isPaperName(name) { return dataDir.appendingPathComponent("papers").appendingPathComponent(name + ".html") }
        return named[name].map { dataDir.appendingPathComponent($0) }
    }

    // pages are saved as complete HTML documents, so they open on their own
    static func wrap(_ body: String) -> String {
        """
        <!doctype html>
        <meta charset="utf-8">
        <title>Paper</title>
        <style>body{max-width:34em;margin:12vh auto;padding:0 16px;font:20px/1.4 "Times New Roman",serif;color:#000;background:#f3efe6}</style>
        \(start)
        \(body)
        \(end)

        """
    }

    static func unwrap(_ text: String) -> String {
        guard let a = text.range(of: start), let b = text.range(of: end, options: .backwards), a.upperBound <= b.lowerBound else { return text }
        return text[a.upperBound..<b.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func read(_ name: String) -> String {
        guard let u = url(name), let text = try? String(contentsOf: u, encoding: .utf8) else { return "" }
        return isPage(name) ? unwrap(text) : text
    }

    static func today() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    // the first save each day keeps a copy of the file as it was
    static func backup(_ file: URL) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: file.path) else { return }
        let dest = dataDir.appendingPathComponent(".history").appendingPathComponent(today()).appendingPathComponent(file.lastPathComponent)
        guard !fm.fileExists(atPath: dest.path) else { return }
        try? fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? fm.copyItem(at: file, to: dest)
    }

    static func write(_ file: URL, _ text: String, keepHistory: Bool = true) -> Bool {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        if keepHistory { backup(file) }
        return (try? text.write(to: file, atomically: true, encoding: .utf8)) != nil
    }

    static func save(_ name: String, _ text: String) -> Bool {
        guard let u = url(name) else { return false }
        return write(u, isPage(name) ? wrap(text) : text)
    }

    static func saveMarkdown(_ name: String, _ text: String) -> Bool {
        guard isPage(name), let u = url(name) else { return false }
        return write(u.deletingPathExtension().appendingPathExtension("md"), text, keepHistory: false)
    }

    // a paper's writing from the top, a line per paragraph, blank lines kept (for its tiny page)
    static func firstLine(_ html: String) -> String {
        guard let re = try? NSRegularExpression(pattern: "<(p|li)[^>]*>([\\s\\S]*?)</\\1>", options: .caseInsensitive) else { return "" }
        let ns = html as NSString
        var lines: [String] = []
        for m in re.matches(in: html, range: NSRange(location: 0, length: ns.length)) {
            var s = ns.substring(with: m.range(at: 2)).replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            for (a, b) in [("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&amp;", "&")] {
                s = s.replacingOccurrences(of: a, with: b)
            }
            s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            lines.append(s)
            if lines.joined(separator: "\n").count > 600 { break }
        }
        let text = lines.joined(separator: "\n").replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression)
        return String(text.prefix(600))
    }

    static func list() -> [[String: Any]] {
        var names = ["page"]
        let dir = dataDir.appendingPathComponent("papers")
        if let files = try? FileManager.default.contentsOfDirectory(atPath: dir.path) {
            names += files.filter { $0.hasSuffix(".html") }.map { String($0.dropLast(5)) }.filter(isPaperName)
        }
        return names.compactMap { name in
            guard let u = url(name), let text = try? String(contentsOf: u, encoding: .utf8) else { return nil }
            let modified = (try? FileManager.default.attributesOfItem(atPath: u.path)[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
            return ["name": name, "first": firstLine(unwrap(text)), "modified": modified * 1000]
        }
    }

    static func newName() -> String {
        "paper-" + String(Int(Date().timeIntervalSince1970 * 1000), radix: 36)
    }

    static let settingsURL = dataDir.appendingPathComponent(".settings.json")

    // settings, checked to be plain JSON before they go back into the page
    static func settingsJSON() -> String {
        guard let data = try? Data(contentsOf: settingsURL),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let clean = try? JSONSerialization.data(withJSONObject: obj),
              let text = String(data: clean, encoding: .utf8) else { return "null" }
        return text
    }
}

// the top edge of the window: drag to move, double-click to zoom, like a title bar
final class DragStrip: NSView {
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 { window?.performZoom(nil) } else { window?.performDrag(with: event) }
    }
}

// one window, one paper
final class PaperWindow: NSObject, NSWindowDelegate {
    let window: NSWindow
    let web: WKWebView
    var paper: String

    init(paper: String?, handler: AppDelegate) {
        self.paper = paper ?? "page"
        let config = WKWebViewConfiguration()
        // never finish words for you: no grey suggested words, no inline predictions
        if #available(macOS 14.0, *) { config.allowsInlinePredictions = false }
        let content = config.userContentController
        content.addScriptMessageHandler(handler, contentWorld: .page, name: "paper")
        content.addUserScript(WKUserScript(source: "window.PAPER_SETTINGS = \(Store.settingsJSON());", injectionTime: .atDocumentStart, forMainFrameOnly: true))

        web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground")

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = paperColor
        window.collectionBehavior = [.fullScreenPrimary]
        window.isReleasedWhenClosed = false
        window.title = "Paper"

        let view = NSView(frame: NSRect(x: 0, y: 0, width: 1100, height: 780))
        web.frame = view.bounds
        web.autoresizingMask = [.width, .height]
        view.addSubview(web)
        // leaves the right edge to the page, where the S opens the side bar
        let strip = DragStrip(frame: NSRect(x: 0, y: view.bounds.height - 28, width: view.bounds.width - 60, height: 28))
        strip.autoresizingMask = [.width, .minYMargin]
        view.addSubview(strip)
        window.contentView = view
        super.init()

        web.navigationDelegate = handler
        web.uiDelegate = handler
        window.delegate = self

        if let page = Bundle.main.url(forResource: "index", withExtension: "html") {
            var target = page
            if let paper, var parts = URLComponents(url: page, resolvingAgainstBaseURL: false) {
                parts.queryItems = [URLQueryItem(name: "paper", value: paper)]
                target = parts.url ?? page
            }
            web.loadFileURL(target, allowingReadAccessTo: page.deletingLastPathComponent())
        }
    }

    func windowWillClose(_ notification: Notification) {
        web.evaluateJavaScript("window.dispatchEvent(new Event('pagehide'))", completionHandler: nil)
        (NSApp.delegate as? AppDelegate)?.closed(self)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    var windows: [PaperWindow] = []
    var server: Process?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let first = open(paper: nil)
        first.window.center()
        first.window.setFrameAutosaveName("Paper")
        NSApp.activate(ignoringOtherApps: true)
        startLocalServer()
    }

    @discardableResult
    func open(paper: String?) -> PaperWindow {
        let pw = PaperWindow(paper: paper, handler: self)
        if let front = NSApp.keyWindow ?? windows.last?.window {
            pw.window.setFrame(front.frame, display: false)
            pw.window.setFrameTopLeftPoint(pw.window.cascadeTopLeft(from: NSPoint(x: front.frame.minX, y: front.frame.maxY)))
        }
        windows.append(pw)
        pw.window.makeKeyAndOrderFront(nil)
        return pw
    }

    func closed(_ pw: PaperWindow) { windows.removeAll { $0 === pw } }

    // File › New Paper: a new paper in its own window
    @objc func newPaper(_ sender: Any?) {
        let name = Store.newName()
        _ = Store.save(name, "<p><br></p>")
        open(paper: name)
    }

    // File › Show in Finder: the front window's paper
    @objc func showInFinder(_ sender: Any?) {
        guard let pw = windows.first(where: { $0.window == NSApp.keyWindow }) ?? windows.last, let u = Store.url(pw.paper) else { return }
        NSWorkspace.shared.activateFileViewerSelecting([u])
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // let every page save anything still pending before quitting
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        for pw in windows { pw.web.evaluateJavaScript("window.dispatchEvent(new Event('pagehide'))", completionHandler: nil) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { sender.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }

    func applicationWillTerminate(_ notification: Notification) { server?.terminate() }

    // ---------- the page talks to the app ----------

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let op = body["op"] as? String else { return replyHandler(nil, "bad message") }
        let name = body["name"] as? String ?? ""
        let text = body["text"] as? String ?? ""
        let pw = windows.first { $0.web == message.webView }
        switch op {
        case "get": replyHandler(Store.read(name), nil)
        case "put": replyHandler(Store.save(name, text), nil)
        case "markdown": replyHandler(Store.saveMarkdown(name, text), nil)
        case "settings": replyHandler(Store.write(Store.settingsURL, text, keepHistory: false), nil)
        case "list": replyHandler(Store.list(), nil)
        case "open":
            if Store.isPage(name) { pw?.paper = name }
            replyHandler(true, nil)
        case "title":
            pw?.window.title = text.isEmpty ? "Paper" : text // shown in the Window menu and Mission Control
            replyHandler(true, nil)
        case "export":
            export(kind: body["kind"] as? String ?? "md", name: name, text: text, font: body["font"] as? String ?? "times", in: pw?.window ?? NSApp.keyWindow) { replyHandler($0, nil) }
        default: replyHandler(nil, "unknown op")
        }
    }

    // export: a normal Save dialog; word files are made with macOS's own textutil
    func export(kind: String, name: String, text: String, font: String, in window: NSWindow?, done: @escaping (Bool) -> Void) {
        guard let window else { return done(false) }
        let ext = kind == "docx" ? "docx" : "md"
        let panel = NSSavePanel()
        panel.nameFieldStringValue = (name.isEmpty ? "Paper" : name) + "." + ext
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let dest = panel.url else { return done(false) }
            try? FileManager.default.removeItem(at: dest) // the panel already asked about replacing
            if ext == "md" { return done((try? text.write(to: dest, atomically: true, encoding: .utf8)) != nil) }

            let family = ["inter": "Inter", "helvetica": "Helvetica Neue", "palatino": "Palatino"][font] ?? "Times New Roman"
            let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("paper-\(UUID().uuidString)")
            try? FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: tmp) }
            let html = tmp.appendingPathComponent("page.html")
            let source = "<!doctype html><meta charset=\"utf-8\"><style>body{font-family:\"\(family)\";font-size:12px}p,ul,ol{margin:0 0 8px}</style>\(text)"
            guard (try? source.write(to: html, atomically: true, encoding: .utf8)) != nil else { return done(false) }
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/textutil")
            p.arguments = ["-convert", "docx", "-format", "html", html.path, "-output", dest.path]
            do { try p.run(); p.waitUntilExit(); done(p.terminationStatus == 0) } catch { done(false) }
        }
    }

    // ---------- links ----------

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, !url.isFileURL, action.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    // ⌘-click on a link opens it in the default browser
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // ---------- the browser version, on Macs that have it ----------
    // If ~/Paper/app/server.js and Node.js are both here, start the server too, so
    // http://localhost:4610 works while the app is open. Elsewhere this does nothing.

    func startLocalServer() {
        let script = dataDir.appendingPathComponent("app/server.js")
        guard FileManager.default.fileExists(atPath: script.path), let node = findNode() else { return }
        var req = URLRequest(url: URL(string: "http://localhost:4610/api/files/notes")!)
        req.timeoutInterval = 0.5
        URLSession.shared.dataTask(with: req) { _, res, _ in
            guard (res as? HTTPURLResponse)?.statusCode != 200 else { return } // already running
            DispatchQueue.main.async {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: node)
                p.arguments = [script.path]
                p.standardOutput = FileHandle.nullDevice
                p.standardError = FileHandle.nullDevice
                if (try? p.run()) != nil { self.server = p }
            }
        }.resume()
    }

    func findNode() -> String? {
        var candidates: [String] = []
        let nvm = home.appendingPathComponent(".nvm/versions/node")
        if let versions = try? FileManager.default.contentsOfDirectory(atPath: nvm.path) {
            for v in versions.sorted(by: { $0.compare($1, options: .numeric) == .orderedDescending }) {
                candidates.append(nvm.appendingPathComponent(v).appendingPathComponent("bin/node").path)
            }
        }
        candidates += ["/opt/homebrew/bin/node", "/usr/local/bin/node"]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    // ---------- menus: needed for copy, paste, undo and quit ----------

    func buildMenu() {
        let main = NSMenu()

        let app = NSMenu()
        app.addItem(withTitle: "Hide Paper", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(.separator())
        app.addItem(withTitle: "Quit Paper", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        main.addItem(submenu: app, title: "Paper")

        let file = NSMenu(title: "File")
        file.addItem(withTitle: "New Paper", action: #selector(newPaper(_:)), keyEquivalent: "n")
        file.addItem(.separator())
        file.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        file.addItem(withTitle: "Show in Finder", action: #selector(showInFinder(_:)), keyEquivalent: "")
        main.addItem(submenu: file, title: "File")

        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z").keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        main.addItem(submenu: edit, title: "Edit")

        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]
        main.addItem(submenu: view, title: "View")

        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        main.addItem(submenu: win, title: "Window")
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }
}

extension NSMenu {
    func addItem(submenu: NSMenu, title: String) {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        addItem(item)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
