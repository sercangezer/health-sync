import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Button, CodeBlock, Icon, Menu, Modal, Tag } from './primitives';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Gösterge paneli', icon: 'dashboard' },
  { id: 'scale', label: 'Tartı ve kompozisyon', icon: 'monitor_weight' },
  { id: 'insights', label: 'Anlamlandırma ve korelasyon', icon: 'analytics' },
  { id: 'wearables', label: 'Watch6 ve Garmin kıyaslama', icon: 'watch' },
  { id: 'ai', label: 'AI danışman ve otomasyon', icon: 'psychology' },
  { id: 'settings', label: 'Ayarlar ve heartbeat', icon: 'settings' },
];

export function Shell({
  activeTab,
  onSelectTab,
  theme,
  onToggleTheme,
  children,
}: {
  activeTab: string;
  onSelectTab: (id: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [versionInfo, setVersionInfo] = useState({
    version: '1.0.0',
    commit: 'HEAD',
    changelog: '# Değişiklik Günlüğü\n\n## v1.0.0\n- Çoklu mikroservis sağlık senkronizasyon platformu.',
  });
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded'>('healthy');
  const [changelogOpen, setChangelogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .getChangelog<{ version: string; commit: string; changelog: string }>()
      .then((res) => {
        if (active && res) {
          setVersionInfo(res);
        }
      })
      .catch(() => {
        // Keep baseline version info if offline preview
      });

    apiClient
      .getHealth<{ status: string }>()
      .then((res) => {
        if (active && res?.status) {
          setHealthStatus(res.status === 'healthy' ? 'healthy' : 'degraded');
        }
      })
      .catch(() => {
        if (active) setHealthStatus('degraded');
      });

    return () => {
      active = false;
    };
  }, []);

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="hs-shell">
      <aside
        className={collapsed ? 'hs-sidebar hs-sidebar-collapsed' : 'hs-sidebar'}
        aria-label="Ana gezinme"
      >
        <div className="hs-sidebar-header">
          {!collapsed ? <span className="hs-brand-title">HealthSync</span> : null}
          <Button
            variant="ghost"
            onPress={() => setCollapsed((c) => !c)}
            ariaLabel={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
          >
            <Icon name={collapsed ? 'menu_open' : 'menu'} />
          </Button>
        </div>

        <nav className="hs-nav-list" aria-label="Modüller">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={isActive ? 'hs-nav-item hs-nav-item-active' : 'hs-nav-item'}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
              >
                <Icon name={item.icon} />
                {!collapsed ? <span>{item.label}</span> : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="hs-main-wrapper">
        <header className="hs-topbar">
          <div className="hs-breadcrumb" aria-label="Sayfa konumu">
            <span>HealthSync</span>
            <Icon name="chevron_right" />
            <span className="hs-breadcrumb-current">{currentNav.label}</span>
          </div>

          <div className="hs-topbar-actions">
            <Tag
              tone={healthStatus === 'healthy' ? 'nominal' : 'warning'}
              label={healthStatus === 'healthy' ? '8 Mikroservis Aktif' : 'Kısmi Servis Koruması'}
            />
            <Button
              variant="default"
              onPress={onToggleTheme}
              ariaLabel={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
              testId="theme-toggle"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} />
              <span>{theme === 'dark' ? 'Açık tema' : 'Koyu tema'}</span>
            </Button>
            <Menu label="Cihaz profili" icon="account_circle">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <strong>Aktif Cihaz Envanteri</strong>
                <span>1. Renpho ES-26BB-B (BLE + Cloud)</span>
                <span>2. Samsung Galaxy Watch6 (HC)</span>
                <span>3. Garmin Smart Band (Connect)</span>
              </div>
            </Menu>
          </div>
        </header>

        <main className="hs-content">{children}</main>

        <footer className="hs-footer">
          <span>Çoklu Cihaz Telemetri ve Biyometrik Anlamlandırma Sistemi</span>
          <button
            type="button"
            className="hs-footer-version-btn"
            onClick={() => setChangelogOpen(true)}
            data-testid="footer-version-btn"
          >
            {`Version: v${versionInfo.version} | Commit: ${versionInfo.commit}`}
          </button>
        </footer>
      </div>

      <Modal
        isOpen={changelogOpen}
        title={`Sürüm Notları — v${versionInfo.version} (${versionInfo.commit})`}
        onClose={() => setChangelogOpen(false)}
      >
        <CodeBlock content={versionInfo.changelog} />
      </Modal>
    </div>
  );
}
