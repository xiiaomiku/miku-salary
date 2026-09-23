import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CALCULATION_NOTE,
  defaultSettings,
  formatDuration,
  formatMoney,
  isoFromLocalDateTimeInput,
  localDateTimeInputValue,
  SalarySettings,
  snapshotAt,
  validateSettings,
} from '../shared/salary';
import mikuCompanion from './assets/miku-clock-companion.png';

const REFRESH_MS = 1_000;

function ClockNumber({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="metric">
      <p className="eyebrow">{label}</p>
      <p className="metric-number">{value}</p>
      {hint && <p className="metric-hint">{hint}</p>}
    </article>
  );
}

export function App() {
  const [settings, setSettings] = useState<SalarySettings>(defaultSettings);
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!window.salaryClock) {
      setLoaded(true);
      return;
    }
    void window.salaryClock.loadSettings()
      .then((saved) => setSettings(saved))
      .catch(() => setNotice('使用本机预设值；下次储存时会建立设定。'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const snapshot = useMemo(() => {
    try {
      return snapshotAt(settings, now);
    } catch {
      return snapshotAt(defaultSettings, now);
    }
  }, [settings, now]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const next = validateSettings({
        currency: String(form.get('currency')) === 'TWD' ? 'TWD' : 'MYR',
        monthlySalary: Number(form.get('monthlySalary')),
        payday: Number(form.get('payday')),
        payoutTime: String(form.get('payoutTime')),
        startAt: isoFromLocalDateTimeInput(String(form.get('startAt'))),
      });
      const result = window.salaryClock
        ? await window.salaryClock.saveSettings(next)
        : { settings: next, widgetPublished: false };
      setSettings(result.settings);
      setSettingsOpen(false);
      setNotice(result.widgetPublished ? '设定已储存，并已同步至 macOS 小组件。' : '设定已储存。');
      if (result.widgetError) setNotice(`设定已储存；小组件同步失败：${result.widgetError}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法储存设定。');
    }
  }

  const progressPercent = `${(snapshot.cycleProgress * 100).toFixed(2)}%`;
  const status = snapshot.hasStarted
    ? `下一次发薪还有 ${formatDuration(snapshot.timeToNextPaydayMs)}`
    : `将从 ${new Date(settings.startAt).toLocaleString('zh-MY')} 开始计算`;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="wordmark">MIKU SALARY</p>
          <p className="tagline">看着你的薪资，安静地持续增长。</p>
        </div>
        <div className="topbar-actions">
          <span className="miku-mark"><strong>01</strong><span>MIKU MODE</span></span>
          <button className="round-button" type="button" onClick={() => setNow(new Date())}>现在刷新</button>
        </div>
      </header>

      <div className="rule" />

      <section className="hero" aria-live="polite">
        <img className="miku-companion" src={mikuCompanion} alt="" aria-hidden="true" />
        <div className="hero-label-row">
          <p className="eyebrow">从开始计算至今</p>
          <span className="live-pill"><span className="live-dot" />{settings.currency} · MIKU LIVE</span>
        </div>
        <h1>{formatMoney(snapshot.totalEarned, settings.currency, 4)}</h1>
        <p className="hero-status">{status}</p>
      </section>

      <div className="rule" />

      <section className="cycle-section" aria-label="当前薪资周期">
        <div className="section-heading">
          <div>
            <p className="eyebrow">当前薪资周期</p>
            <p className="period">{snapshot.cycle.start.toLocaleString('zh-MY')} — {snapshot.cycle.end.toLocaleString('zh-MY')}</p>
          </div>
          <p className="cycle-earned">{formatMoney(snapshot.cycleEarned, settings.currency, 2)}</p>
        </div>
        <div className="progress-track" aria-label={`周期进度 ${progressPercent}`}>
          <div className="progress-fill" style={{ width: progressPercent }} />
        </div>
        <p className="progress-label">周期已过去 {progressPercent}</p>
      </section>

      <section className="metrics" aria-label="实时薪资速率">
        <ClockNumber label="日薪" value={formatMoney(snapshot.perDay, settings.currency, 2)} hint="按当前周期折算为 24 小时" />
        <ClockNumber label="每小时" value={formatMoney(snapshot.perHour, settings.currency, 2)} />
        <ClockNumber label="每分钟" value={formatMoney(snapshot.perMinute, settings.currency, 4)} />
        <ClockNumber label="每秒" value={formatMoney(snapshot.perSecond, settings.currency, 6)} />
      </section>

      <section className="settings-section">
        <div className="settings-summary">
          <div>
            <p className="eyebrow">设定</p>
            <p>薪资、发薪节奏与累计起点会储存在这台设备上。</p>
          </div>
          <button className="text-button" type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
            {settingsOpen ? '收起' : '调整设定'}
          </button>
        </div>
        {settingsOpen && (
          <form className="settings-form" onSubmit={save}>
            <label>
              <span>货币</span>
              <select name="currency" defaultValue={settings.currency} required>
                <option value="MYR">MYR — 马来西亚令吉</option>
                <option value="TWD">TWD — 新台币</option>
              </select>
            </label>
            <label>
              <span>月薪金额</span>
              <input name="monthlySalary" type="number" min="0" max="10000000" step="0.01" defaultValue={settings.monthlySalary} required />
            </label>
            <label>
              <span>每月发薪日</span>
              <input name="payday" type="number" min="1" max="31" step="1" defaultValue={settings.payday} required />
              <small>遇到短月份时，29–31 日会自动使用当月最后一天。</small>
            </label>
            <label>
              <span>发薪时间</span>
              <input name="payoutTime" type="time" defaultValue={settings.payoutTime} required />
            </label>
            <label>
              <span>开始计算时间</span>
              <input name="startAt" type="datetime-local" defaultValue={localDateTimeInputValue(settings.startAt)} required />
            </label>
            <div className="form-footer">
              <p>{CALCULATION_NOTE}</p>
              <button className="save-button" type="submit">储存设定</button>
            </div>
          </form>
        )}
        {(notice || error) && <p className={error ? 'message error' : 'message'}>{error || notice}</p>}
      </section>

      <footer>自动每秒更新 · {loaded ? '本机设定已载入' : '载入设定中…'}</footer>
    </main>
  );
}
