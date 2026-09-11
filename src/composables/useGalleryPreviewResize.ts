import { onBeforeUnmount, ref } from 'vue';

export function useGalleryPreviewResize() {
  const isPreviewOpen = ref(false);
  const previewWidth = ref(300);
  const isResizing = ref(false);

  const togglePreview = () => {
    isPreviewOpen.value = !isPreviewOpen.value;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 200 && newWidth <= 600) previewWidth.value = newWidth;
  };

  const stopResizing = () => {
    isResizing.value = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  onBeforeUnmount(stopResizing);

  const startResizing = () => {
    isResizing.value = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return {
    isPreviewOpen,
    previewWidth,
    isResizing,
    togglePreview,
    startResizing,
    stopResizing,
  };
}
