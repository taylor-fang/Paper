// Moves the mouse over the open Paper window and prints which cursor macOS shows there.
import AppKit
_ = NSApplication.shared

func cursorName(_ c: NSCursor?) -> String {
    guard let c else { return "nil" }
    let refs: [(String, NSCursor)] = [("arrow", .arrow), ("iBeam", .iBeam), ("pointingHand", .pointingHand), ("openHand", .openHand), ("closedHand", .closedHand)]
    for (n, r) in refs where r.hotSpot == c.hotSpot && r.image.size == c.image.size { return n }
    return "other(hotSpot \(c.hotSpot), size \(c.image.size))"
}
func move(_ p: CGPoint) {
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: p.x - 3, y: p.y), mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(150_000)
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(700_000)
}
func click(_ p: CGPoint) {
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(80_000)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(800_000)
}
let screen = NSScreen.main!
let full = screen.frame, vis = screen.visibleFrame
// CoreGraphics points: origin at the top left
let midY = full.height - vis.midY
let spots: [(String, CGPoint, String)] = [
    ("writing (middle of the page)", CGPoint(x: vis.midX, y: midY), "iBeam"),
    ("right edge (#edge, opens the side bar)", CGPoint(x: vis.maxX - 25, y: midY), "pointingHand"),
    ("title bar strip", CGPoint(x: vis.midX, y: full.height - vis.maxY + 10), "arrow"),
]
print("AX trusted (can post events):", AXIsProcessTrusted())
print("front app:", NSWorkspace.shared.frontmostApplication?.localizedName ?? "?")
let label = CommandLine.arguments.dropFirst().first ?? "run"
for round in ["before any click", "after clicking the page"] {
    if round == "after clicking the page" { click(CGPoint(x: vis.midX, y: midY)) }
    print("== \(label), \(round); front app: \(NSWorkspace.shared.frontmostApplication?.localizedName ?? "?")")
    for (i, (name, p, want)) in spots.enumerated() {
        move(p)
        let got = cursorName(NSCursor.currentSystem)
        print("  \(name): \(got)   (page asks for \(want))\(got == want ? "" : "   <-- WRONG")")
        let task = Process(); task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        task.arguments = ["-C", "-x", "shots/\(label)-\(round.prefix(5))-\(i).png"]; try? task.run(); task.waitUntilExit()
    }
}
