import { ref, computed, watch, onMounted } from 'vue'

type Theme = { primary:string, secondary:string, text:string, bg:string, font:string }
const LS_THEME = 'st-theme'
const APPLE_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', Inter, system-ui, sans-serif"
const defaultTheme: Theme = { primary:'#0071e3', secondary:'#e5e5ea', text:'#1d1d1f', bg:'#fbfbfd', font: APPLE_FONT }
const PRESETS: { id:string, label:string, theme:Theme }[] = [
  { id:'light', label:'Light', theme:{ primary:'#0071e3', secondary:'#e5e5ea', text:'#1d1d1f', bg:'#fbfbfd', font: APPLE_FONT } },
  { id:'gray', label:'Gray', theme:{ primary:'#515154', secondary:'#d2d2d7', text:'#1d1d1f', bg:'#f5f5f7', font: APPLE_FONT } },
  { id:'black', label:'Black', theme:{ primary:'#0a84ff', secondary:'#38383a', text:'#f5f5f7', bg:'#1d1d1f', font: APPLE_FONT } },
  { id:'pitch', label:'Pitch Black', theme:{ primary:'#0a84ff', secondary:'#2c2c2e', text:'#ffffff', bg:'#000000', font: APPLE_FONT } },
  { id:'navy', label:'Navy', theme:{ primary:'#79b8ff', secondary:'#394b65', text:'#e8eef7', bg:'#1c293c', font: APPLE_FONT } },
  { id:'forest', label:'Forest', theme:{ primary:'#8dd6ae', secondary:'#3b574c', text:'#e5f0e9', bg:'#20372e', font: APPLE_FONT } },
  { id:'sage', label:'Sage', theme:{ primary:'#4c7c5c', secondary:'#d8e0d4', text:'#1c2520', bg:'#f2f4ef', font: APPLE_FONT } },
  { id:'peach', label:'Peach', theme:{ primary:'#d96c47', secondary:'#ecd9cc', text:'#33231a', bg:'#fdf6f0', font: APPLE_FONT } },
  { id:'lavender', label:'Lavender', theme:{ primary:'#7d7abf', secondary:'#dcd8f0', text:'#26244a', bg:'#f5f3ff', font: APPLE_FONT } },
  { id:'sky', label:'Sky', theme:{ primary:'#0a84ff', secondary:'#cfe3f7', text:'#16283d', bg:'#f0f7ff', font: APPLE_FONT } },
]
const fonts = [APPLE_FONT, 'Georgia, serif', 'ui-monospace, Consolas, monospace', "'Comic Sans MS', cursive", 'Inter, system-ui, sans-serif']

// ponytail: luminance guess, full contrast calc if theming grows
function isDark(hex: string){
  const m = hex.replace('#','')
  if (m.length < 6) return false
  const r = parseInt(m.slice(0,2),16), g = parseInt(m.slice(2,4),16), b = parseInt(m.slice(4,6),16)
  return (0.2126*r + 0.7152*g + 0.0722*b) < 128
}
function applyTheme(th: Theme){
  const r = document.documentElement
  r.style.setProperty('--accent', th.primary)
  r.style.setProperty('--on-accent', isDark(th.primary) ? '#ffffff' : '#1d1d1f')
  r.style.setProperty('--border', th.secondary)
  r.style.setProperty('--text-h', th.text)
  r.style.setProperty('--bg', th.bg)
  r.style.setProperty('--sans', th.font)
  r.style.setProperty('--heading', th.font)
  r.style.colorScheme = isDark(th.bg) ? 'dark' : 'light'
}

export function useTheme() {
  const theme = ref<Theme>({ ...defaultTheme, ...JSON.parse(localStorage.getItem(LS_THEME) || 'null') })
  const activePreset = computed(() => PRESETS.find(p =>
    p.theme.primary===theme.value.primary && p.theme.secondary===theme.value.secondary &&
    p.theme.text===theme.value.text && p.theme.bg===theme.value.bg)?.id ?? 'custom')
  function pickPreset(id: string){
    const p = PRESETS.find(x=>x.id===id)
    if (p) theme.value = { ...p.theme, font: theme.value.font }
  }
  function resetTheme(){ theme.value={...defaultTheme} }
  watch(theme, v => { localStorage.setItem(LS_THEME, JSON.stringify(v)); applyTheme(v) }, { deep:true })
  onMounted(() => applyTheme(theme.value))
  return { theme, activePreset, pickPreset, resetTheme, PRESETS, fonts }
}
