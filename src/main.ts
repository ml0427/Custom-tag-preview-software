import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { useThemeStore } from './stores/themeStore'
import { useFontSizeStore } from './stores/fontSizeStore'

const app = createApp(App)
app.use(createPinia())

useThemeStore().init()
useFontSizeStore().init()

app.mount('#app')
