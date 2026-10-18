import React, { useId, useState } from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Label as AriaLabel,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  TextField as AriaTextField,
  Input as AriaInput,
} from 'react-aria-components';

export function Icon({ name, label }: { name: string; label?: string }) {
  return (
    <span
      className="hs-icon"
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
}

export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'destructive' | 'ghost';
  disabled?: boolean;
  onPress?: () => void;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  testId?: string;
}

export function Button({
  children,
  variant = 'default',
  disabled = false,
  onPress,
  type = 'button',
  ariaLabel,
  testId,
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'hs-btn hs-btn-primary'
      : variant === 'destructive'
        ? 'hs-btn hs-btn-destructive'
        : variant === 'ghost'
          ? 'hs-btn hs-btn-ghost'
          : 'hs-btn';

  return (
    <AriaButton
      type={type}
      isDisabled={disabled}
      onPress={onPress}
      aria-label={ariaLabel}
      data-testid={testId}
      className={variantClass}
    >
      {children}
    </AriaButton>
  );
}

export interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  testId?: string;
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
  error,
  testId,
}: InputProps) {
  return (
    <AriaTextField
      value={value}
      onChange={onChange}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      className="hs-field"
    >
      <AriaLabel className="hs-label">{label}</AriaLabel>
      <AriaInput
        type={type}
        placeholder={placeholder}
        data-testid={testId}
        className={error ? 'hs-input hs-input-error' : 'hs-input'}
      />
      {error ? (
        <span className="hs-field-error" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </span>
      ) : null}
    </AriaTextField>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  testId?: string;
}

export function Select({ label, value, options, onChange, disabled = false, testId }: SelectProps) {
  const id = useId();
  return (
    <div className="hs-field">
      <label htmlFor={id} className="hs-label">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        className="hs-select"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Checkbox({ label, checked, onChange, disabled = false, ariaLabel }: CheckboxProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="hs-checkbox-label">
      <input
        id={id}
        type="checkbox"
        className="hs-checkbox-input"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel || label}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export interface TagProps {
  tone?: 'nominal' | 'warning' | 'critical' | 'neutral';
  label: string;
}

export function Tag({ tone = 'neutral', label }: TagProps) {
  return (
    <span className={`hs-tag hs-tag-${tone}`}>
      <span className="hs-tag-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ isOpen, title, onClose, children }: ModalProps) {
  if (!isOpen) return null;
  return (
    <AriaModalOverlay isOpen={isOpen} isDismissable onOpenChange={(open) => !open && onClose()} className="hs-modal-backdrop">
      <AriaModal className="hs-modal">
        <AriaDialog aria-label={title}>
          <div className="hs-modal-header">
            <AriaHeading slot="title" className="hs-panel-title">
              {title}
            </AriaHeading>
            <Button variant="ghost" onPress={onClose} ariaLabel="Kapat">
              <Icon name="close" />
              <span>Kapat</span>
            </Button>
          </div>
          <div className="hs-modal-body">{children}</div>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}

export interface MenuProps {
  label: string;
  icon?: string;
  children: React.ReactNode;
}

export function Menu({ label, icon, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hs-menu-wrapper">
      <Button onPress={() => setOpen((v) => !v)} ariaLabel={label}>
        {icon ? <Icon name={icon} /> : null}
        <span>{label}</span>
      </Button>
      {open ? (
        <div className="hs-menu-popover" role="menu" aria-label={label}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return <span title={text}>{children}</span>;
}

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({
  items,
  selectedKey,
  onSelectionChange,
  ariaLabel,
}: {
  items: TabItem[];
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  ariaLabel: string;
}) {
  return (
    <AriaTabs
      selectedKey={selectedKey}
      onSelectionChange={(k) => onSelectionChange(String(k))}
      className="hs-tabs"
    >
      <AriaTabList aria-label={ariaLabel} className="hs-tab-list">
        {items.map((item) => (
          <AriaTab key={item.id} id={item.id} className="hs-tab">
            {item.label}
          </AriaTab>
        ))}
      </AriaTabList>
      {items.map((item) => (
        <AriaTabPanel key={item.id} id={item.id}>
          {item.content}
        </AriaTabPanel>
      ))}
    </AriaTabs>
  );
}

export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="hs-toast" role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Icon name="info" />
        <span>{message}</span>
      </div>
      <Button variant="ghost" onPress={onDismiss} ariaLabel="Bildirimi kapat">
        Kapat
      </Button>
    </div>
  );
}

export function StateBlock({
  state,
  title,
  description,
  onRetry,
}: {
  state: 'loading' | 'empty' | 'error';
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  const iconName = state === 'error' ? 'error' : state === 'loading' ? 'hourglass_empty' : 'inbox';
  return (
    <div className="hs-state-block" data-testid={`state-${state}`} role={state === 'error' ? 'alert' : 'status'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Icon name={iconName} />
        <strong style={{ color: 'var(--color-text-main)' }}>{title}</strong>
      </div>
      <span>{description}</span>
      {onRetry ? (
        <Button onPress={onRetry} variant="primary">
          <Icon name="refresh" />
          <span>Yeniden dene</span>
        </Button>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="hs-panel" aria-label={title}>
      <div className="hs-panel-header">
        <h2 className="hs-panel-title">{title}</h2>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="hs-code-block" tabIndex={0} role="region" aria-label="Kod ve rapor çıktısı">
      {content}
    </pre>
  );
}
