import { ref, onMounted, type Ref } from 'vue'
import { api } from '../api'
import type { LearningWord } from '../learning'

function browserSpeak(text: string, wordLocale: string) {
  try {
    speechSynthesis.cancel()
    speechSynthesis.resume() // autoplay policy can leave it paused -> silence
    const u = new SpeechSynthesisUtterance(text)
    u.lang = wordLocale
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith(wordLocale))
    if (v) u.voice = v
    u.rate = 0.8
    speechSynthesis.speak(u)
    speechSynthesis.resume()
  } catch {}
}

export function useAudio(current: Ref<string>, currentWord: Ref<LearningWord>) {
  // ponytail: static per-word file, browser caches it; missing file -> browser voice
  let audioEl: HTMLAudioElement | null = null
  const audioLoading = ref(false)
  async function speak(autoplay = false, word = current.value, wordLocale = currentWord.value.locale) {
    if (!word) return
    const text = word
    audioLoading.value = true
    // Fall back once: onerror and play() rejection can both fire; autoplay has no gesture for browser voice.
    let fellBack = false
    const fallback = () => { if (!fellBack) { fellBack = true; if (!autoplay) browserSpeak(text,wordLocale) } }
    try {
      audioEl?.pause()
      audioEl = new Audio(api.audioUrl(wordLocale, text))
      audioEl.onerror = fallback
      await audioEl.play()
    } catch {
      fallback()
    } finally {
      audioLoading.value = false
    }
  }
  onMounted(() => {
    try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices() } catch {}
  })
  return { speak, audioLoading }
}
