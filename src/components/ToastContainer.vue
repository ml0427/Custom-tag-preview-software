<script setup lang="ts">
import { useToast } from '../composables/useToast';
const { toasts, confirmState, resolveConfirm } = useToast();
</script>

<template>
  <div class="toast-container">
    <transition-group name="toast" tag="div">
      <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.type}`]">
        {{ t.message }}
      </div>
    </transition-group>
  </div>

  <Teleport to="body">
    <div v-if="confirmState.visible" class="confirm-overlay" @click.self="resolveConfirm(false)">
      <div class="confirm-dialog glass-panel">
        <p class="confirm-message">{{ confirmState.message }}</p>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="resolveConfirm(false)">取消</button>
          <button class="btn-ok" @click="resolveConfirm(true)">確定</button>
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
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  max-width: 360px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.toast-info    { background: rgba(47, 129, 247, 0.9); color: #fff; }
.toast-success { background: rgba(46, 160, 67, 0.9);  color: #fff; }
.toast-error   { background: rgba(248, 81, 73, 0.9);  color: #fff; }

.toast-enter-active { transition: all 0.25s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from   { opacity: 0; transform: translateY(12px); }
.toast-leave-to     { opacity: 0; transform: translateX(24px); }

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.confirm-dialog {
  padding: 24px 28px;
  border-radius: 12px;
  min-width: 280px;
  max-width: 400px;
}

.confirm-message {
  font-size: 0.95rem;
  color: var(--text-primary);
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
  background: rgba(255,255,255,0.08);
  color: var(--text-secondary);
  border: 1px solid var(--panel-border);
}
.btn-cancel:hover { opacity: 0.8; }
.btn-ok {
  background: var(--accent-color);
  color: #fff;
}
.btn-ok:hover { opacity: 0.85; }
</style>
