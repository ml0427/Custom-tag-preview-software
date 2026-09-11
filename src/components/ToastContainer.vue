<script setup lang="ts">
import { useToast } from '../composables/useToast';
import AppIcon, { type AppIconName } from './AppIcon.vue';
const { toasts, confirmState, resolveConfirm } = useToast();

const toastIcon = (type: string): AppIconName => {
  if (type === 'success') return 'check';
  if (type === 'error') return 'alert';
  return 'archive';
};
</script>

<template>
  <div class="toast-container">
    <transition-group name="toast" tag="div">
      <div v-for="t in toasts" :key="t.id" :class="['toast', 'toast-card', `toast-${t.type}`]">
        <span class="toast-icon"><AppIcon :name="toastIcon(t.type)" :size="16" /></span>
        <span class="toast-message">{{ t.message }}</span>
      </div>
    </transition-group>
  </div>

  <Teleport to="body">
    <div v-if="confirmState.visible" class="confirm-overlay" @click.self="resolveConfirm(false)">
      <div class="confirm-dialog confirm-card workbench-card" role="alertdialog" aria-modal="true">
        <span class="confirm-icon"><AppIcon name="alert" :size="20" /></span>
        <span class="confirm-kicker">Confirm action</span>
        <p class="confirm-message">{{ confirmState.message }}</p>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="resolveConfirm(false)">{{ confirmState.cancelLabel ?? '取消' }}</button>
          <button class="btn-ok" @click="resolveConfirm(true)">{{ confirmState.confirmLabel ?? '確定' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  position: relative;
  min-width: 260px;
  padding: 11px 14px 11px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--content-primary);
  background: var(--surface-raised);
  border: 1px solid var(--line-default);
  border-left: 3px solid var(--color-info);
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 500;
  max-width: 360px;
  box-shadow: var(--shadow-popover);
  pointer-events: auto;
}

.toast-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
}

.toast-success { border-left-color: var(--color-success); }
.toast-error { border-left-color: var(--color-danger); }
.toast-info .toast-icon { color: var(--color-info); }
.toast-success .toast-icon { color: var(--color-success); }
.toast-error .toast-icon { color: var(--color-danger); }

.toast-message {
  min-width: 0;
  line-height: 1.45;
}

.toast-enter-active { transition: all 0.25s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from   { opacity: 0; transform: translateY(12px); }
.toast-leave-to     { opacity: 0; transform: translateX(24px); }

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-scrim);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.confirm-dialog {
  position: relative;
  padding: 26px 28px 24px;
  min-width: 280px;
  max-width: 400px;
  border-left: 2px solid var(--catalog-spine);
}

.confirm-icon {
  width: 36px;
  height: 36px;
  margin-bottom: 12px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
}

.confirm-kicker {
  color: var(--content-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.confirm-message {
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-top: 6px;
  margin-bottom: 20px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel, .btn-ok {
  padding: 7px 18px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
}
.btn-cancel {
  background: var(--bg-overlay-soft);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}
.btn-cancel:hover { opacity: 0.8; }
.btn-ok {
  background: var(--accent);
  color: var(--text-on-accent);
}
.btn-ok:hover { opacity: 0.85; }
</style>
