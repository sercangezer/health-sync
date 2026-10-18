import React from 'react';
import { Button, Tag, TagProps } from '../primitives';

export interface MetricStripItem {
  key: string;
  label: string;
  value: string;
  delta: string;
  target_tab: string;
}

export function DashboardTemplate({
  title,
  lastUpdated,
  filterBar,
  metrics,
  onSelectMetricTarget,
  children,
}: {
  title: string;
  lastUpdated: string;
  filterBar: React.ReactNode;
  metrics: MetricStripItem[];
  onSelectMetricTarget: (targetTab: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="hs-template">
      <header className="hs-template-header">
        <div>
          <h1 className="hs-page-title">{title}</h1>
          <p className="hs-page-subtitle">{`Son güncelleme: ${lastUpdated}`}</p>
        </div>
        <div className="hs-filter-bar">{filterBar}</div>
      </header>

      <section className="hs-metric-strip" aria-label="Temel sağlık metrikleri">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            className="hs-metric-cell"
            onClick={() => onSelectMetricTarget(m.target_tab)}
          >
            <span className="hs-metric-label">{m.label}</span>
            <span className="hs-metric-value">{m.value}</span>
            <span className="hs-metric-delta">{m.delta}</span>
          </button>
        ))}
      </section>

      {children}
    </div>
  );
}

export function ListTemplate({
  title,
  subtitle,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: string;
  toolbar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="hs-template">
      <header className="hs-template-header">
        <div>
          <h1 className="hs-page-title">{title}</h1>
          {subtitle ? <p className="hs-page-subtitle">{subtitle}</p> : null}
        </div>
        <div className="hs-filter-bar">{toolbar}</div>
      </header>
      {children}
    </div>
  );
}

export function DetailTemplate({
  title,
  statusLabel,
  statusTone = 'nominal',
  actionBar,
  kvItems,
  children,
}: {
  title: string;
  statusLabel: string;
  statusTone?: TagProps['tone'];
  actionBar?: React.ReactNode;
  kvItems: Array<{ label: string; value: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="hs-template">
      <header className="hs-template-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <h1 className="hs-page-title">{title}</h1>
          <Tag tone={statusTone} label={statusLabel} />
        </div>
        {actionBar ? <div className="hs-filter-bar">{actionBar}</div> : null}
      </header>

      <section className="hs-kv-grid" aria-label="Özet göstergeler">
        {kvItems.map((kv) => (
          <div key={kv.label} className="hs-kv-item">
            <span className="hs-kv-label">{kv.label}</span>
            <span className="hs-kv-value">{kv.value}</span>
          </div>
        ))}
      </section>

      {children}
    </div>
  );
}

export function FormTemplate({
  title,
  description,
  onSubmit,
  onCancel,
  submitLabel = 'Kaydet',
  cancelLabel = 'Sıfırla',
  children,
}: {
  title: string;
  description?: string;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      className="hs-form-container"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <h2 className="hs-panel-title">{title}</h2>
        {description ? <p className="hs-page-subtitle">{description}</p> : null}
      </div>
      {children}
      <div className="hs-form-footer">
        <Button variant="default" onPress={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="primary" type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
