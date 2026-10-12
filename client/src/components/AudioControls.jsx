import { Headphones, RefreshCw, Volume2 } from 'lucide-react';

const SPEEDS = [0.8, 0.9, 1, 1.15, 1.3, 1.5];
const PITCHES = [-6, -3, 0, 3, 6];

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`seg-btn ${active ? 'active' : ''}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, hint, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function AudioControls({
  t,
  settings,
  onChange,
  devices,
  sinkSupported,
  onRefreshDevices,
  onTestVoice,
}) {
  return (
    <section className="glass-card hover-glow">
      <div className="glass-card-header">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100">
          <Headphones className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        </div>
        <h2 className="text-sm font-bold text-slate-900">{t.controlsTitle}</h2>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {/* Balance slider */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="balance" className="field-label mb-0">
              {t.balanceLabel}
            </label>
            <span className="text-xs font-bold tabular-nums text-indigo-600">{settings.balance}%</span>
          </div>
          <input
            id="balance"
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.balance}
            onChange={(e) => onChange({ balance: Number(e.target.value) })}
            className="range"
          />
          <div className="mt-2 flex justify-between text-xs font-medium text-slate-500">
            <span>{t.balanceOriginal}</span>
            <span>{t.balanceTranslated}</span>
          </div>
        </div>

        {/* Master volume */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="master" className="flex items-center gap-1.5 field-label mb-0">
              <Volume2 className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
              {t.masterVolume}
            </label>
            <span className="text-xs font-bold tabular-nums text-indigo-600">{settings.master}%</span>
          </div>
          <input
            id="master"
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.master}
            onChange={(e) => onChange({ master: Number(e.target.value) })}
            className="range"
          />
        </div>

        {/* Checkboxes */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={settings.monitorOriginal}
              onChange={(e) => onChange({ monitorOriginal: e.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-semibold text-slate-800">{t.monitorOriginal}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{t.monitorOriginalHint}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={settings.autoDuck}
              onChange={(e) => onChange({ autoDuck: e.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span className="font-semibold text-slate-800">{t.autoDuck}</span>
          </label>
        </div>

        {/* Output device */}
        <Field label={t.outputDevice} htmlFor="output-device" hint={sinkSupported ? t.headsetTip : t.sinkUnsupported}>
          <div className="flex gap-2">
            <select
              id="output-device"
              value={settings.outputDevice}
              onChange={(e) => onChange({ outputDevice: e.target.value })}
              disabled={!sinkSupported}
              className="glass-select min-w-0 flex-1 disabled:opacity-40"
            >
              <option value="default">{t.defaultDevice}</option>
              {devices
                .filter((d) => d.id && d.id !== 'default' && d.id !== 'communications')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={onRefreshDevices}
              title={t.refreshDevices}
              aria-label={t.refreshDevices}
              className="btn-secondary !px-3"
            >
              <RefreshCw className="h-4 w-4 text-slate-600" aria-hidden="true" />
            </button>
          </div>
        </Field>

        {/* Voice section */}
        <div className="border-t border-slate-200 pt-5">
          <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-sm font-bold text-slate-900">
            <input
              type="checkbox"
              checked={!settings.muted}
              onChange={(e) => onChange({ muted: !e.target.checked })}
              className="h-4 w-4"
            />
            {t.voiceOn}
          </label>

          <div className="space-y-4">
            <Field label={t.voiceType}>
              <Segmented
                label={t.voiceType}
                value={settings.gender}
                onChange={(gender) => onChange({ gender })}
                options={[
                  { value: 'FEMALE', label: t.female },
                  { value: 'MALE', label: t.male },
                ]}
              />
            </Field>

            <Field label={t.speed}>
              <Segmented
                label={t.speed}
                value={settings.speed}
                onChange={(speed) => onChange({ speed })}
                options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
              />
            </Field>

            <Field label={t.pitch} hint={t.pitchHint}>
              <Segmented
                label={t.pitch}
                value={settings.pitch}
                onChange={(pitch) => onChange({ pitch })}
                options={PITCHES.map((p) => ({ value: p, label: p > 0 ? `+${p}` : String(p) }))}
              />
            </Field>

            <button
              type="button"
              id="test-voice-btn"
              onClick={onTestVoice}
              className="btn-secondary w-full justify-center"
            >
              <Volume2 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              {t.testVoice}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
