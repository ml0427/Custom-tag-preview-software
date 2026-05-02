import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { useThemeStore } from './stores/themeStore'

const app = createApp(App)
app.use(createPinia())

useThemeStore().init()

app.mount('#app')
