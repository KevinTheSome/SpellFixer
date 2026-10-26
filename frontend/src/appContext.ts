import { inject, provide, type InjectionKey } from 'vue'
import { createSpellingApp } from './composables/createSpellingApp'

const appKey: InjectionKey<ReturnType<typeof createSpellingApp>> = Symbol('spelling-app')

export function provideSpellingApp() {
  const app = createSpellingApp()
  provide(appKey, app)
  return app
}

export function useSpellingApp() {
  const app = inject(appKey)
  if (!app) throw new Error('Spelling app must be provided by App.vue')
  return app
}
