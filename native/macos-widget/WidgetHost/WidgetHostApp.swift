import SwiftUI

/// This is a lightweight Xcode host used only to build/sign the WidgetKit
/// extension. In the shipped product the extension is embedded into the
/// Electron app by scripts/after-pack.cjs.
@main
struct WidgetHostApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 12) {
                Text("Miku Salary Widget")
                    .font(.title2)
                Text("The WidgetKit extension is bundled with Miku Salary.")
                    .foregroundStyle(.secondary)
            }
            .frame(minWidth: 360, minHeight: 180)
            .padding()
        }
    }
}
