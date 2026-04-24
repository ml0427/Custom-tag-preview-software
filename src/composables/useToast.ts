import { ref, reactive } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmState {
  visible: boolean;
  message: string;
  resolve: ((v: boolean) => void) | null;
}

let _id = 0;
const toasts = ref<Toast[]>([]);
const confirmState = reactive<ConfirmState>({ visible: false, message: '', resolve: null });

export function useToast() {
  const show = (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = ++_id;
    toasts.value.push({ id, message, type });
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, duration);
  };

  const confirm = (message: string): Promise<boolean> =>
    new Promise(resolve => {
      confirmState.visible = true;
      confirmState.message = message;
      confirmState.resolve = resolve;
    });

  const resolveConfirm = (value: boolean) => {
    confirmState.visible = false;
    confirmState.resolve?.(value);
    confirmState.resolve = null;
  };

  return { toasts, confirmState, show, confirm, resolveConfirm };
}
