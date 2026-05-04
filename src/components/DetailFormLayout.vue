<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  showClose?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-content glass-panel">
      <button v-if="showClose !== false" class="close-btn" @click="emit('close')">✖</button>
      
      <div class="modal-body">
        <div class="modal-left">
          <slot name="left"></slot>
        </div>
        
        <div class="modal-right">
          <div class="header-section">
            <h2 class="title" :title="title">{{ title }}</h2>
            <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
          </div>
          <slot name="right"></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-scrim-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-content {
  width: 90%;
  max-width: 1000px;
  height: 85vh;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes slideUp {
  from { transform: translateY(30px) scale(0.98); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}

.close-btn {
  position: absolute;
  top: 15px; right: 15px;
  background: transparent;
  color: var(--text-on-accent);
  font-size: 1.5rem;
  padding: 5px 10px;
  border-radius: 50%;
  z-index: 10;
}
.close-btn:hover { background: var(--bg-overlay-strong); transform: rotate(90deg); }

.modal-body {
  display: flex;
  height: 100%;
  padding: 30px;
  gap: 30px;
  overflow: hidden;
}

.modal-left {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.modal-right {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.title { font-size: 1.8rem; margin-bottom: 5px; line-height: 1.3; }
.subtitle { font-size: 0.8rem; color: var(--text-secondary); word-break: break-all; margin-bottom: 20px; }

@media (max-width: 800px) {
  .modal-body { flex-direction: column; overflow-y: auto; }
  .modal-left { width: 100%; height: auto; }
}
</style>
