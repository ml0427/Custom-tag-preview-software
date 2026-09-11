<script lang="ts">
import { defineComponent, type PropType } from 'vue';

export type AppIconName =
  | 'archive'
  | 'folder'
  | 'tag'
  | 'shield'
  | 'settings'
  | 'search'
  | 'arrow-up'
  | 'refresh'
  | 'list'
  | 'grid'
  | 'star'
  | 'panel-right'
  | 'chevron-left'
  | 'chevron-right'
  | 'x'
  | 'play'
  | 'more'
  | 'trash'
  | 'check'
  | 'alert'
  | 'theme';

export default defineComponent({
  name: 'AppIcon',
  props: {
    name: {
      type: String as PropType<AppIconName>,
      required: true,
    },
    size: {
      type: Number,
      default: 18,
    },
    strokeWidth: {
      type: Number,
      default: 1.8,
    },
  },
});
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'theme'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'archive'">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 13h6" />
    </template>
    <template v-else-if="name === 'folder'">
      <path d="M3.5 7.5h6.8l2-2h8.2v13H3.5z" />
    </template>
    <template v-else-if="name === 'tag'">
      <path d="M4 4h7l9 9-7 7-9-9z" />
      <circle cx="8" cy="8" r="1" />
    </template>
    <template v-else-if="name === 'shield'">
      <path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </template>
    <template v-else-if="name === 'arrow-up'">
      <path d="m7 10 5-5 5 5M12 5v14" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 8.5A7 7 0 0 1 18.8 10M17.9 15.5A7 7 0 0 1 5.2 14" />
    </template>
    <template v-else-if="name === 'list'">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </template>
    <template v-else-if="name === 'grid'">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </template>
    <template v-else-if="name === 'star'">
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z" />
    </template>
    <template v-else-if="name === 'panel-right'">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M14 4v16" />
    </template>
    <path v-else-if="name === 'chevron-left'" d="m15 18-6-6 6-6" />
    <path v-else-if="name === 'chevron-right'" d="m9 18 6-6-6-6" />
    <path v-else-if="name === 'x'" d="M6 6l12 12M18 6 6 18" />
    <path v-else-if="name === 'play'" d="m8 5 11 7-11 7z" />
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </template>
    <path v-else-if="name === 'check'" d="m5 12 4 4L19 6" />
    <template v-else-if="name === 'alert'">
      <path d="M12 3 2.8 20h18.4z" />
      <path d="M12 9v4M12 17h.01" />
    </template>
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
  overflow: visible;
}
</style>
