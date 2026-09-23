import SwiftUI
import WidgetKit

private let appGroupIdentifier = "group.com.mikusalary.app"

private struct SalarySettings: Codable {
    let currency: String?
    let monthlySalary: Double
    let payday: Int
    let payoutTime: String
    let startAt: String
}

private struct WidgetState: Codable {
    let schemaVersion: Int
    let updatedAt: String
    let settings: SalarySettings
}

private struct Cycle {
    let start: Date
    let end: Date
}

private struct SalaryValues {
    let currency: String
    let total: Double
    let perDay: Double
    let cycleEarned: Double
    let progress: Double
    let nextPayday: Date
}

/// A native mirror of src/shared/salary.ts. Widget extensions cannot execute
/// JavaScript, so it consumes the Electron app's shared JSON state and follows
/// the same documented calendar-period formula.
private enum SalaryMath {
    static let calendar = Calendar.autoupdatingCurrent

    static func stateURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent("Library/Application Support/Miku Salary/widget-state.json")
    }

    static func loadSettings() -> SalarySettings? {
        guard let url = stateURL(), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WidgetState.self, from: data).settings
    }

    static func startDate(_ value: String) -> Date? {
        ISO8601DateFormatter().date(from: value)
    }

    static func clock(_ value: String) -> (Int, Int) {
        let values = value.split(separator: ":").compactMap { Int($0) }
        guard values.count == 2, (0...23).contains(values[0]), (0...59).contains(values[1]) else { return (9, 0) }
        return (values[0], values[1])
    }

    static func payday(in month: Date, settings: SalarySettings) -> Date {
        let base = calendar.dateComponents([.year, .month], from: month)
        let lastDay = calendar.range(of: .day, in: .month, for: month)?.count ?? 28
        let (hour, minute) = clock(settings.payoutTime)
        var components = DateComponents()
        components.year = base.year
        components.month = base.month
        components.day = min(max(settings.payday, 1), lastDay)
        components.hour = hour
        components.minute = minute
        components.second = 0
        return calendar.date(from: components) ?? month
    }

    static func cycle(at date: Date, settings: SalarySettings) -> Cycle {
        let thisPayday = payday(in: date, settings: settings)
        if date < thisPayday {
            let previousMonth = calendar.date(byAdding: .month, value: -1, to: date) ?? date
            return Cycle(start: payday(in: previousMonth, settings: settings), end: thisPayday)
        }
        let nextMonth = calendar.date(byAdding: .month, value: 1, to: date) ?? date
        return Cycle(start: thisPayday, end: payday(in: nextMonth, settings: settings))
    }

    static func earned(from start: Date, to end: Date, settings: SalarySettings) -> Double {
        guard end > start, settings.monthlySalary > 0 else { return 0 }
        var cursor = start
        var result = 0.0
        var guardCount = 0
        while cursor < end && guardCount < 2_500 {
            let currentCycle = cycle(at: cursor, settings: settings)
            let sliceEnd = min(currentCycle.end, end)
            let periodSeconds = currentCycle.end.timeIntervalSince(currentCycle.start)
            result += settings.monthlySalary * (sliceEnd.timeIntervalSince(cursor) / periodSeconds)
            cursor = sliceEnd
            guardCount += 1
        }
        return result
    }

    static func values(now: Date, settings: SalarySettings) -> SalaryValues? {
        guard let start = startDate(settings.startAt) else { return nil }
        let current = cycle(at: now, settings: settings)
        let duration = current.end.timeIntervalSince(current.start)
        let hasStarted = now >= start
        let cycleStart = max(start, current.start)
        let cycleElapsed = max(0, min(1, now.timeIntervalSince(cycleStart) / duration))
        return SalaryValues(
            currency: settings.currency == "TWD" ? "TWD" : "MYR",
            total: hasStarted ? earned(from: start, to: now, settings: settings) : 0,
            perDay: settings.monthlySalary * 86_400 / duration,
            cycleEarned: hasStarted ? settings.monthlySalary * cycleElapsed : 0,
            progress: max(0, min(1, now.timeIntervalSince(current.start) / duration)),
            nextPayday: current.end
        )
    }

    static func money(_ value: Double, currency: String, digits: Int = 2) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.currencySymbol = currency == "TWD" ? "NT$" : "RM"
        formatter.locale = Locale(identifier: currency == "TWD" ? "zh_TW" : "en_MY")
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter.string(from: NSNumber(value: value)) ?? "RM 0.00"
    }

    static func timeRemaining(until date: Date, now: Date) -> String {
        let minutes = max(0, Int(date.timeIntervalSince(now) / 60))
        let days = minutes / (24 * 60)
        let hours = (minutes % (24 * 60)) / 60
        if days > 0 { return "\(days)天 \(hours)小时" }
        return "\(hours)小时 \(minutes % 60)分钟"
    }
}

private struct SalaryEntry: TimelineEntry {
    let date: Date
    let values: SalaryValues?
}

private struct SalaryProvider: TimelineProvider {
    func placeholder(in context: Context) -> SalaryEntry {
        SalaryEntry(date: .now, values: SalaryValues(currency: "TWD", total: 1234.56, perDay: 100, cycleEarned: 890.12, progress: 0.42, nextPayday: .now.addingTimeInterval(4 * 86_400)))
    }

    func getSnapshot(in context: Context, completion: @escaping (SalaryEntry) -> Void) {
        completion(SalaryEntry(date: .now, values: SalaryMath.loadSettings().flatMap { SalaryMath.values(now: .now, settings: $0) }))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SalaryEntry>) -> Void) {
        let now = Date()
        let entry = SalaryEntry(date: now, values: SalaryMath.loadSettings().flatMap { SalaryMath.values(now: now, settings: $0) })
        // WidgetKit controls real-world refresh frequency; one-minute entries are
        // requested so the visible amount stays close to the desktop clock.
        let next = Calendar.current.date(byAdding: .minute, value: 1, to: now) ?? now.addingTimeInterval(60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private struct SalaryWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SalaryEntry

    var body: some View {
        if let values = entry.values {
            VStack(alignment: .leading, spacing: family == .systemSmall ? 7 : 10) {
                Text("累计收入")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(SalaryMath.money(values.total, currency: values.currency, digits: family == .systemSmall ? 2 : 4))
                    .font(family == .systemSmall ? .title2.weight(.bold) : .title.weight(.bold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.62)
                    .lineLimit(1)
                if family == .systemMedium {
                    Text("日薪 \(SalaryMath.money(values.perDay, currency: values.currency))")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 1)
                HStack {
                    Text("本周期 \(Int((values.progress * 100).rounded()))%")
                    Spacer()
                    Text(SalaryMath.money(values.cycleEarned, currency: values.currency))
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.secondary.opacity(0.2))
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [.purple, .cyan],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(3, geometry.size.width * values.progress))
                    }
                }
                .frame(height: 5)
                Text("距下次发薪 \(SalaryMath.timeRemaining(until: values.nextPayday, now: entry.date))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .containerBackground(for: .widget) {
                LinearGradient(
                    colors: [
                        Color(nsColor: .windowBackgroundColor).opacity(0.92),
                        Color.purple.opacity(0.22),
                        Color.cyan.opacity(0.24)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text("Miku Salary").font(.headline)
                Text("请先在主应用储存薪资设定。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .containerBackground(for: .widget) {
                LinearGradient(
                    colors: [Color(nsColor: .windowBackgroundColor), Color.purple.opacity(0.18), Color.cyan.opacity(0.2)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }
}

struct SalaryClockWidget: Widget {
    let kind = "SalaryClockWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SalaryProvider()) { entry in
            SalaryWidgetView(entry: entry)
        }
        .configurationDisplayName("Miku Salary")
        .description("显示累计收入、当前薪资周期及距离下一次发薪的时间。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct SalaryClockWidgetBundle: WidgetBundle {
    var body: some Widget {
        SalaryClockWidget()
    }
}
