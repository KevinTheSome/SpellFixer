import { ref, watch } from 'vue'

const LS_LOCALE = 'st-locale'
const dict = {
  en: {
    correctSpelling:'Correct spelling', writingIntro:'Read, notice, correct. Type one word — no audio needed.', loadingPractice:'Loading writing practice…', curriculumFailed:'Could not load writing practice. Retry when connected; downloaded lessons work offline.', microLesson:'One-minute lesson', applyRule:'Put it into practice →', fixWord:'Type only the corrected word:', fillWord:'Type the missing word or contraction.', whyCorrect:'Why this spelling works', practiceSkill:'Practise a skill', pilotNote:'English writing practice · explanations, not guessing', skillProgress:'Progress by skill', skillEvidence:'Up to 20 independent answers per skill in this period. Item retention is not proof of skill mastery.', noSkillEvidence:'Complete some writing practice to see your skill progress.', mistakeNotebook:'My mistakes', notebookNote:'Your actual mistakes, with corrections and explanations. Practising a revealed answer is assisted study.', noMistakes:'No independent mistakes recorded in this period.', reviewMistake:'Practise this mistake', skillPractice:'Practise this skill', examplesTried:'different examples tried', firstNewItems:'First recall of new items',
    accountData:'Account data', currentPassword:'Current password', deleteData:'Delete data', deleteAccount:'Delete account',
    deleteDataNote:'Permanently delete your saved words, answers, tests, statistics and XP. Keep your account and password; other login sessions will be signed out.',
    deleteAccountNote:'Permanently delete your account and all its data. All login sessions will be signed out.',
    deleteLocalNote:'Guest data is kept. Offline copies on other devices are not erased.',
    confirmDeleteData:'Permanently delete all data for this account? This cannot be undone.',
    confirmDeleteAccount:'Permanently delete this account and all its data? This cannot be undone.',
    dataDeleted:'Account data deleted.', accountDeleted:'Account deleted. You are now using guest mode.',
    localDeleteFailed:'Server deletion completed, but this device cache could not be cleared. Clear browser storage before signing in again.',
    practice:'Practice', selfTest:'Test', statistics:'Statistics', settings:'Settings', myWords:'My words', practiceWords:'Practice these words', wordSaved:'Word saved.', wordRemoved:'Word removed.', duplicateWord:'This word is already saved.', invalidWord:'Use letters, spaces, apostrophes or hyphens (50 characters max).', periodXp:'XP earned', periodNote:'Applies to every section below. Week = last 7 days; month = last 30 days.',
    listen:'Listen', hint:'Click listen, then spell what you hear',
    typeph:'type spelling...', check:'Check', next:'Next →', retry:'Try again',
    correct:'Nice! 🎉', was:'It was', reveal:'Correct spelling:', hearAgain:'hear again',
    repeatMode:'Repeat', spellThis:'Spell this word:', pasteDisabled:'Paste is disabled in this mode',
    manage:'manage', hide:'hide', wordList:'word list', addph:'add word...', add:'Add',
    noWords:'No words yet. Add some below.', savedLocal:'Saved locally (guest). Login to sync.',
    savedServer:'Saved on server. Per-word stats: seen/correct tracked.',
    guestNote:'Guest mode — works offline. Login to sync.', synced:'Synced as',
    wordsAndStats:'words & stats saved on server.', offline:'Guest (offline) · ', noTracking:'No tracking · Learn at your own pace', exampleContext:'Practice sentence', wordDrills:'Word-list drills',
    theme:'Theme', preset:'Preset', custom:'Custom', background:'Background', primary:'Primary color', secondary:'Secondary color', textColor:'Text color', font:'Font', resetTheme:'Reset theme',
    lang:'Language', appLangNote:'App language (not word list)',     defSettings:'Defaults', resetAll:'Reset all settings',
    statsTitle:'Per-word statistics', word:'Word', seen:'Times spelled', correctH:'Correct', accuracy:'Accuracy', total:'total', streak:'streak', best:'best',
    activity:'Activity', dayStreak:'day streak', less:'Less', more:'More', noActivity:'No activity yet — practice to fill the grid.',
    today:'Today', last7:'Last 7 days', last30:'Last 30 days', allTime:'All time', attempted:'Words attempted',
    wordsTyped:'Words typed', day:'Day', week:'Week', month:'Month', perHour:'per hour', perDay:'per day',
    wordDetails:'Per-word details', noData:'No data for this period yet.',
    clearStats:'clear stats', login:'Login', register:'Register', logout:'Logout → guest', username:'username', password:'password', account:'Account', close:'Close',
    empty:'empty', secondaryNote:'Used for borders & accents',
    packs:'Word packs', usePack:'Use pack', using:'Using', wordsLabel:'words', difficulty:'Difficulty', packsEmpty:'No packs found — is the backend running?', packsLoadFail:'Could not load packs.', loadingPacks:'Loading packs…', loadingPack:'Loading…',
    showHint:'Show hint 💡', hintUsedNote:'Hint used — this word is not scored', youWrote:'You wrote', remember:'Remember', practiceFocus:'Practice focus', reviewSoon:'This word will return soon.', mode:'Mode', seqMode:'In order', randMode:'Random', weakMode:'Weakest first', weakLocked:'Spell over half the pack to unlock weakest mode',
    byLang:'Language', byDiff:'Difficulty', avgAcc:'avg', otherLang:'Other', easyBand:'Starter ★1–2', medBand:'Intermediate ★3–4', hardBand:'Expert ★5', unsorted:'Unsorted',
    level:'Level', xp:'XP', toNext:'to next', leaderboard:'Leaderboard', topLevels:'Top levels', noScores:'No scores yet — be the first!', guestBoardNote:'Guest XP is local only — login to join the board.',
    testTitle:'Self test', testIntro:'Choose a language and difficulty. Each test has 10 random words, mostly from that level.', startTest:'Start test', starter:'Starter', intermediate:'Intermediate', expert:'Expert', testProgress:'Progress', finish:'Finish', testComplete:'Test complete', right:'right', wrongLabel:'wrong', pastResults:'Past test results', noTestResults:'No tests completed yet.', testAgain:'Test again',
    dailyLesson:'Daily lesson', weakSpots:'Practice my weak spots', due:'Reviews due', learning:'Learning', retained:'Retained after a delay', startDaily:'Start daily lesson', continueReview:'Continue → review later', lessonComplete:'Lesson complete', leaveLesson:'End lesson', manual:'Practice saved words', nextReview:'Next review', independent:'Independent first attempts', assisted:'Assisted study', mistakes:'Practice my mistakes', saved:'Progress saved', unsaved:'Saved on this device · sync pending', saving:'Saving…', retrySave:'Retry sync', importGuest:'Import guest words, answers and tests when registering', importNote:'Matching language + spelling is merged; answer IDs prevent duplicates. Guest data stays on this device.', confirmWord:'Confirm this spelling (name or unusual word)', customLanguage:'Word language', recentWords:'Words to review', patternTitle:'Supported spelling patterns', noPatterns:'More independent answers are needed to identify a recurring pattern.', sample:'mistakes / opportunities', cover:'Cover and recall', studyNote:'Visible spelling is study, not independent recall.', recallNote:'Recall from memory. Correction retries do not count toward mastery.', contentGap:'No related words in this pack yet; reviewing your original words.', lessonNote:'Up to 10 questions · about five minutes · no account needed', recallSummary:'Independent successes', studySummary:'Study answers', answered:'Questions completed', reviewNeeded:'Need another review', errorMissing:'Missing', errorExtra:'Extra', errorSubstituted:'Changed', errorTransposed:'Reversed', patternNote:'Observed spelling differences, not an assumed cause. Use a meaning cue if the words sound alike.',
  },
  es: {
    correctSpelling:'Corregir ortografía', writingIntro:'Lee, observa y corrige. Escribe una palabra; no necesitas audio.', loadingPractice:'Cargando práctica escrita…', curriculumFailed:'No se pudo cargar la práctica. Reinténtalo con conexión; las lecciones descargadas funcionan sin conexión.', microLesson:'Lección de un minuto', applyRule:'Ponerlo en práctica →', fixWord:'Escribe solo la palabra corregida:', fillWord:'Escribe la palabra o contracción que falta.', whyCorrect:'Por qué esta forma es correcta', practiceSkill:'Practicar una habilidad', pilotNote:'Práctica escrita en inglés · explicaciones, no adivinanzas', skillProgress:'Progreso por habilidad', skillEvidence:'Hasta 20 respuestas sin ayuda por habilidad en este periodo. Recordar un ejercicio no demuestra el dominio de una regla.', noSkillEvidence:'Completa práctica escrita para ver tu progreso por habilidad.', mistakeNotebook:'Mis errores', notebookNote:'Tus errores reales, con correcciones y explicaciones. Practicar una respuesta revelada cuenta como estudio con ayuda.', noMistakes:'No hay errores sin ayuda en este periodo.', reviewMistake:'Practicar este error', skillPractice:'Practicar esta habilidad', examplesTried:'ejemplos diferentes practicados', firstNewItems:'Primer recuerdo de ejercicios nuevos',
    accountData:'Datos de la cuenta', currentPassword:'Contraseña actual', deleteData:'Eliminar datos', deleteAccount:'Eliminar cuenta',
    deleteDataNote:'Elimina permanentemente tus palabras guardadas, respuestas, pruebas, estadísticas y XP. Conserva tu cuenta y contraseña; se cerrarán las demás sesiones.',
    deleteAccountNote:'Elimina permanentemente tu cuenta y todos sus datos. Se cerrarán todas las sesiones.',
    deleteLocalNote:'Los datos de invitado se conservan. No se borran las copias sin conexión de otros dispositivos.',
    confirmDeleteData:'¿Eliminar permanentemente todos los datos de esta cuenta? No se puede deshacer.',
    confirmDeleteAccount:'¿Eliminar permanentemente esta cuenta y todos sus datos? No se puede deshacer.',
    dataDeleted:'Datos de la cuenta eliminados.', accountDeleted:'Cuenta eliminada. Ahora estás en modo invitado.',
    localDeleteFailed:'Los datos del servidor se eliminaron, pero no se pudo borrar la caché de este dispositivo. Borra el almacenamiento del navegador antes de volver a entrar.',
    practice:'Práctica', selfTest:'Prueba', statistics:'Estadísticas', settings:'Ajustes', myWords:'Mis palabras', practiceWords:'Practicar estas palabras', wordSaved:'Palabra guardada.', wordRemoved:'Palabra eliminada.', duplicateWord:'Esta palabra ya está guardada.', invalidWord:'Usa letras, espacios, apóstrofos o guiones (máximo 50 caracteres).', periodXp:'XP ganados', periodNote:'Se aplica a todas las secciones de abajo. Semana = últimos 7 días; mes = últimos 30 días.',
    listen:'Escuchar', hint:'Haz clic en escuchar y escribe lo que oyes',
    typeph:'escribe...', check:'Comprobar', next:'Siguiente →', retry:'Reintentar',
    correct:'¡Bien! 🎉', was:'Era', reveal:'Ortografía correcta:', hearAgain:'escuchar de nuevo',
    repeatMode:'Repetir', spellThis:'Escribe esta palabra:', pasteDisabled:'El pegado está deshabilitado en este modo',
    manage:'gestionar', hide:'ocultar', wordList:'lista de palabras', addph:'añadir palabra...', add:'Añadir',
    noWords:'Aún no hay palabras.', savedLocal:'Guardado local (invitado).',
    savedServer:'Guardado en el servidor.',
    guestNote:'Modo invitado — funciona sin conexión.', synced:'Sincronizado como',
    wordsAndStats:'palabras y estadísticas en el servidor.', offline:'Invitado (sin conexión) · ', noTracking:'Sin rastreo · Aprende a tu ritmo', exampleContext:'Frase de práctica', wordDrills:'Práctica de listas',
    theme:'Tema', preset:'Preajuste', custom:'Personalizado', background:'Fondo', primary:'Color primario', secondary:'Color secundario', textColor:'Color de texto', font:'Fuente', resetTheme:'Restablecer tema',
    lang:'Idioma', appLangNote:'Idioma de la app (no de la lista)', defSettings:'Valores por defecto', resetAll:'Restablecer todo',
    statsTitle:'Estadísticas por palabra', word:'Palabra', seen:'Veces', correctH:'Correctas', accuracy:'Precisión', total:'total', streak:'racha', best:'mejor',
    activity:'Actividad', dayStreak:'días seguidos', less:'Menos', more:'Más', noActivity:'Sin actividad — practica para llenar el calendario.',
    today:'Hoy', last7:'Últimos 7 días', last30:'Últimos 30 días', allTime:'Todo', attempted:'Intentos totales',
    wordsTyped:'Palabras escritas', day:'Día', week:'Semana', month:'Mes', perHour:'por hora', perDay:'por día',
    wordDetails:'Detalle por palabra', noData:'Sin datos en este periodo.',
    clearStats:'borrar estadísticas', login:'Entrar', register:'Registrar', logout:'Salir → invitado', username:'usuario', password:'contraseña', account:'Cuenta', close:'Cerrar',
    empty:'vacío', secondaryNote:'Usado para bordes y acentos',
    packs:'Paquetes', usePack:'Usar', using:'Usando', wordsLabel:'palabras', difficulty:'Dificultad', packsEmpty:'Sin paquetes — ¿backend activo?', packsLoadFail:'No se pudieron cargar.', loadingPacks:'Cargando…', loadingPack:'Cargando…',
    showHint:'Ver pista 💡', hintUsedNote:'Pista usada — esta palabra no cuenta', youWrote:'Escribiste', remember:'Recuerda', practiceFocus:'Practica', reviewSoon:'Esta palabra volverá pronto.', mode:'Modo', seqMode:'En orden', randMode:'Aleatorio', weakMode:'Más difíciles', weakLocked:'Deletrea más de la mitad para desbloquear',
    byLang:'Idioma', byDiff:'Dificultad', avgAcc:'prom', otherLang:'Otras', easyBand:'Inicial ★1–2', medBand:'Intermedio ★3–4', hardBand:'Experto ★5', unsorted:'Sin clasificar',
    level:'Nivel', xp:'XP', toNext:'al siguiente', leaderboard:'Clasificación', topLevels:'Mejores niveles', noScores:'Sin puntuaciones — ¡sé el primero!', guestBoardNote:'Tu XP de invitado es solo local — entra para unirte.',
    testTitle:'Prueba personal', testIntro:'Elige un idioma y una dificultad. Cada prueba tiene 10 palabras al azar, principalmente de ese nivel.', startTest:'Empezar prueba', starter:'Inicial', intermediate:'Intermedio', expert:'Experto', testProgress:'Progreso', finish:'Terminar', testComplete:'Prueba completada', right:'correctas', wrongLabel:'incorrectas', pastResults:'Resultados anteriores', noTestResults:'Aún no hay pruebas completadas.', testAgain:'Otra prueba',
    dailyLesson:'Lección diaria', weakSpots:'Practicar mis dificultades', due:'Repasos pendientes', learning:'En aprendizaje', retained:'Recordadas tras un plazo', startDaily:'Empezar lección diaria', continueReview:'Continuar → repasar después', lessonComplete:'Lección completada', leaveLesson:'Terminar lección', manual:'Practicar palabras guardadas', nextReview:'Próximo repaso', independent:'Primeros intentos sin ayuda', assisted:'Estudio con ayuda', mistakes:'Practicar mis errores', saved:'Progreso guardado', unsaved:'Guardado en este dispositivo · sincronización pendiente', saving:'Guardando…', retrySave:'Reintentar sincronización', importGuest:'Importar palabras, respuestas y pruebas al registrarse', importNote:'Se combinan idioma y palabra; los identificadores evitan duplicados. Los datos de invitado permanecen aquí.', confirmWord:'Confirmar esta ortografía (nombre o palabra inusual)', customLanguage:'Idioma de la palabra', recentWords:'Palabras para repasar', patternTitle:'Patrones con evidencia', noPatterns:'Se necesitan más respuestas sin ayuda para identificar un patrón recurrente.', sample:'errores / oportunidades', cover:'Ocultar y recordar', studyNote:'La palabra visible es estudio, no recuerdo independiente.', recallNote:'Recuerda de memoria. Los reintentos no cuentan para el dominio.', contentGap:'No hay palabras relacionadas en este paquete; repasaremos las originales.', lessonNote:'Hasta 10 preguntas · unos cinco minutos · sin cuenta', recallSummary:'Aciertos sin ayuda', studySummary:'Respuestas de estudio', answered:'Preguntas completadas', reviewNeeded:'Necesitan otro repaso', errorMissing:'Falta', errorExtra:'Sobra', errorSubstituted:'Cambio', errorTransposed:'Inversión', patternNote:'Diferencias observadas, sin suponer su causa. Usa el significado si las palabras suenan igual.',
  }
} as const
type Locale = keyof typeof dict

export function useI18n() {
  const locale = ref<Locale>((localStorage.getItem(LS_LOCALE) as Locale) || 'en')
  const t = (k: keyof typeof dict.en) => dict[locale.value][k] ?? dict.en[k]
  watch(locale, v => localStorage.setItem(LS_LOCALE, v))

  // ponytail: Intl names the language, no locale map to maintain
  function langName(packLocale: string): string {
    try {
      const n = new Intl.DisplayNames([locale.value, 'en'], { type: 'language' }).of(packLocale)
      if (n) return n[0].toUpperCase() + n.slice(1)
    } catch {}
    return packLocale
  }
  return { locale, t, langName }
}
