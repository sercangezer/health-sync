import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Button, CodeBlock, Icon, Menu, Modal, Tag } from './primitives';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Özet', icon: 'dashboard' },
  { id: 'profile', label: 'Profilim', icon: 'person' },
  { id: 'scale', label: 'Tartı', icon: 'monitor_weight' },
  { id: 'insights', label: 'Analiz', icon: 'analytics' },
  { id: 'wearables', label: 'Cihazlar', icon: 'watch' },
  { id: 'ai', label: 'Yapay Zeka', icon: 'psychology' },
  { id: 'settings', label: 'Ayarlar', icon: 'settings' },
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
              label={healthStatus === 'healthy' ? 'Bağlantılar Aktif' : 'Kontrol Gerekli'}
            />
            <Button
              variant="default"
              onPress={onToggleTheme}
              ariaLabel={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
              testId="theme-toggle"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} />
              <span>{theme === 'dark' ? 'Açık' : 'Koyu'}</span>
            </Button>
            <Menu label="Cihazlarım" icon="account_circle">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <strong>Bağlı Cihazlar</strong>
                <span>• Renpho Akıllı Tartı</span>
                <span>• Samsung Galaxy Watch6</span>
                <span>• Garmin Akıllı Bileklik</span>
              </div>
            </Menu>
          </div>
        </header>

        <main className="hs-content">{children}</main>

        <footer className="hs-footer">
          <span>Kişisel Sağlık ve Vücut Takip Asistanı</span>
          <button
            type="button"
            className="hs-footer-version-btn"
            onClick={() => setChangelogOpen(true)}
            data-testid="footer-version-btn"
          >
            {`v${versionInfo.version}`}
          </button>
        </footer>
      </div>

      <nav className="hs-bottom-nav" aria-label="Mobil alt gezinme">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeTab;
          return (
            <button
              key={`bottom-${item.id}`}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={isActive ? 'hs-bottom-nav-item hs-bottom-nav-item-active' : 'hs-bottom-nav-item'}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <Icon name={item.icon} />
              <span className="hs-bottom-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

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
