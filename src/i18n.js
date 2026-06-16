// UI translations. Recipe content (user-entered titles, ingredient
// names, step descriptions) stays in whatever language it was authored
// — we only translate the chrome around it. The user-facing toggle is
// the language FAB in the bottom-right.
//
// Supported codes:
//   en — English (canonical)
//   pl — Polish
//   es — Mexican Spanish (Español de México)
//   el — Greek (Ελληνικά)
//   pt — European Portuguese (Português)

import { useStorage } from "./helpers.jsx";

const S = {
  // ─── Top nav ───
  addRecipe:    { en: "Add recipe",       pl: "Dodaj przepis",        es: "Agregar receta",        el: "Προσθήκη συνταγής",   pt: "Adicionar receita" },
  addARecipe:   { en: "Add a recipe",     pl: "Dodaj przepis",        es: "Agregar una receta",    el: "Προσθήκη συνταγής",   pt: "Adicionar uma receita" },
  inviteCook:   { en: "Invite cook",      pl: "Zaproś kucharza",      es: "Invitar cocinero",      el: "Πρόσκληση μάγειρα",   pt: "Convidar cozinheiro" },
  requestToJoin:{ en: "Request to join",  pl: "Poproś o dołączenie",  es: "Pedir unirme",          el: "Αίτημα συμμετοχής",   pt: "Pedir para entrar" },
  requested:    { en: "Request sent",     pl: "Prośba wysłana",       es: "Solicitud enviada",     el: "Στάλθηκε αίτημα",     pt: "Pedido enviado" },
  backToLibrary:{ en: "Back to library",  pl: "Powrót do biblioteki", es: "Volver a la biblioteca",el: "Πίσω στη βιβλιοθήκη", pt: "Voltar à biblioteca" },
  backToMyCookbooks:{ en: "Back to my cookbooks", pl: "Powrót do moich książek", es: "Volver a mis recetarios", el: "Πίσω στα βιβλία μου", pt: "Voltar aos meus livros" },
  backToAdminPage:{ en: "Back to admin page", pl: "Powrót do panelu administracyjnego", es: "Volver al panel de admin", el: "Πίσω στη σελίδα διαχείρισης", pt: "Voltar ao painel de admin" },
  roleOwner:    { en: "owner",            pl: "właściciel",           es: "propietario",           el: "ιδιοκτήτης",          pt: "proprietário" },
  roleEditor:   { en: "editor",           pl: "redaktor",             es: "editor",                el: "συντάκτης",           pt: "editor" },
  roleFollower: { en: "follower",         pl: "obserwujący",          es: "seguidor",              el: "ακόλουθος",           pt: "seguidor" },
  roleAdmin:    { en: "admin access",     pl: "dostęp administratora",es: "acceso de admin",       el: "πρόσβαση διαχειριστή",pt: "acesso de admin" },
  buildMeal:    { en: "Build a meal",     pl: "Złóż posiłek",         es: "Armar una comida",      el: "Φτιάξε ένα γεύμα",    pt: "Montar refeição" },
  signIn:       { en: "Sign in",          pl: "Zaloguj się",          es: "Iniciar sesión",        el: "Σύνδεση",             pt: "Entrar" },
  signOut:      { en: "Sign out",         pl: "Wyloguj się",          es: "Cerrar sesión",         el: "Αποσύνδεση",          pt: "Sair" },
  simpleModeOff:{ en: "Switch to simple view", pl: "Przełącz na widok uproszczony", es: "Cambiar a vista simple",  el: "Απλή προβολή",        pt: "Mudar para vista simples" },
  simpleModeOn: { en: "Switch to full view",   pl: "Przełącz na widok pełny",       es: "Cambiar a vista completa", el: "Πλήρης προβολή",      pt: "Mudar para vista completa" },
  filters:      { en: "Filters",          pl: "Filtry",               es: "Filtros",               el: "Φίλτρα",              pt: "Filtros" },
  accountMenu:  { en: "Account menu",     pl: "Menu konta",           es: "Menú de cuenta",        el: "Μενού λογαριασμού",   pt: "Menu da conta" },
  switchToPL:   { en: "Switch to Polish", pl: "Przełącz na polski",   es: "Cambiar a polaco",      el: "Αλλαγή σε πολωνικά",  pt: "Mudar para polaco" },
  switchToEN:   { en: "Switch to English",pl: "Przełącz na angielski",es: "Cambiar a inglés",      el: "Αλλαγή σε αγγλικά",   pt: "Mudar para inglês" },
  theLab:       { en: "The Lab",          pl: "Laboratorium",         es: "El Laboratorio",        el: "Το Εργαστήριο",       pt: "O Laboratório" },
  kitchenExp:   { en: "Kitchen experimentation", pl: "Eksperymenty kuchenne", es: "Experimentación en la cocina", el: "Πειραματισμοί στην κουζίνα", pt: "Experimentação na cozinha" },
  searchPlaceholder: {
    en: "Search by recipe, cook, cuisine, or ingredient…",
    pl: "Szukaj przepisu, kucharza, kuchni lub składnika…",
    es: "Busca por receta, cocinero, cocina o ingrediente…",
    el: "Αναζήτηση συνταγής, μάγειρα, κουζίνας ή υλικού…",
    pt: "Pesquisar receita, cozinheiro, cozinha ou ingrediente…",
  },
  searchPlaceholderShort: {
    en: "Search recipes…",
    pl: "Szukaj przepisów…",
    es: "Buscar recetas…",
    el: "Αναζήτηση συνταγών…",
    pt: "Pesquisar receitas…",
  },

  // ─── Home / browse ───
  filteringBy:    { en: "Filtering by",       pl: "Filtrowanie według", es: "Filtrando por",       el: "Φιλτράρισμα κατά",     pt: "A filtrar por" },
  clearAll:       { en: "Clear all",          pl: "Wyczyść wszystko",   es: "Borrar todo",         el: "Καθαρισμός όλων",      pt: "Limpar tudo" },
  browseByCourse: { en: "Browse by course",   pl: "Przeglądaj według dania", es: "Explorar por tiempo", el: "Αναζήτηση ανά πιάτο", pt: "Explorar por prato" },
  occasion:       { en: "Occasion",           pl: "Okazja",             es: "Ocasión",             el: "Περίσταση",            pt: "Ocasião" },
  originLbl:      { en: "Origin",             pl: "Pochodzenie",        es: "Origen",              el: "Προέλευση",            pt: "Origem" },
  noneLabel:      { en: "None",               pl: "Brak",               es: "Ninguno",             el: "Κανένα",               pt: "Nenhum" },
  resetSeed:      { en: "Reset to original",  pl: "Przywróć oryginał",  es: "Restaurar original",  el: "Επαναφορά αρχικής",    pt: "Repor original" },
  resetSeedHint:  { en: "Restore this recipe to the original copy shipped with the app", pl: "Przywróć ten przepis do oryginalnej wersji", es: "Restaurar esta receta a la versión original de la app", el: "Επαναφορά αυτής της συνταγής στην αρχική έκδοση της εφαρμογής", pt: "Restaurar esta receita à versão original da aplicação" },
  resetSeedConfirm:{ en: "Reset this recipe to the original? Your edits will be lost; comments and favourites stay.", pl: "Przywrócić ten przepis do oryginału? Twoje edycje zostaną utracone; komentarze i ulubione pozostają.", es: "¿Restaurar esta receta a la original? Tus cambios se perderán; los comentarios y favoritos se quedan.", el: "Επαναφορά αυτής της συνταγής στην αρχική; Οι αλλαγές σας θα χαθούν· τα σχόλια και τα αγαπημένα παραμένουν.", pt: "Repor esta receita à original? As suas edições perdem-se; comentários e favoritos mantêm-se." },
  familyFavorites:{ en: "Family favorites",   pl: "Ulubione rodziny",   es: "Favoritos de la familia", el: "Αγαπημένα της οικογένειας", pt: "Favoritos da família" },
  familyFavoritesSub: { en: "The ones we keep coming back for", pl: "Te, do których ciągle wracamy", es: "Los que repetimos una y otra vez", el: "Αυτά που επιστρέφουμε ξανά και ξανά", pt: "Aqueles a que voltamos sempre" },
  deeperShelves:  { en: "The deeper shelves", pl: "Z głębi szafki",     es: "Los estantes de atrás", el: "Τα πιο βαθιά ράφια",  pt: "As prateleiras mais fundas" },
  everythingElse: { en: "Everything else",    pl: "Wszystko inne",      es: "Todo lo demás",       el: "Όλα τα υπόλοιπα",       pt: "Tudo o resto" },
  searchResults:  { en: "Search results",     pl: "Wyniki wyszukiwania",es: "Resultados de búsqueda", el: "Αποτελέσματα αναζήτησης", pt: "Resultados da pesquisa" },
  noResultsTryAgain: { en: "Try fewer filters, or", pl: "Spróbuj z mniejszą liczbą filtrów lub", es: "Prueba con menos filtros, o", el: "Δοκίμασε λιγότερα φίλτρα ή", pt: "Tenta com menos filtros, ou" },
  addThisRecipeYourself: { en: "add this recipe yourself", pl: "dodaj ten przepis samodzielnie", es: "agrega esta receta tú mismo", el: "πρόσθεσε εσύ αυτή τη συνταγή", pt: "adiciona tu mesmo esta receita" },
  noResults:      { en: "No recipes match.",  pl: "Brak przepisów pasujących.", es: "Ninguna receta coincide.", el: "Δεν ταιριάζει καμία συνταγή.", pt: "Nenhuma receita corresponde." },

  // ─── Filters drawer ───
  filterTheCookbook: { en: "Filter the cookbook", pl: "Filtruj książkę kucharską", es: "Filtrar el recetario", el: "Φιλτράρισμα του βιβλίου", pt: "Filtrar o livro de receitas" },
  showResults:    { en: "Show results",       pl: "Pokaż wyniki",       es: "Mostrar resultados",   el: "Εμφάνιση αποτελεσμάτων", pt: "Mostrar resultados" },
  course:         { en: "Course",             pl: "Danie",              es: "Tiempo",               el: "Πιάτο",                pt: "Prato" },
  timeFromStartToFinish: { en: "Time from start to finish", pl: "Czas od początku do końca", es: "Tiempo de principio a fin", el: "Χρόνος από την αρχή ως το τέλος", pt: "Tempo do início ao fim" },
  difficulty:     { en: "Difficulty",         pl: "Trudność",           es: "Dificultad",           el: "Δυσκολία",             pt: "Dificuldade" },
  allergiesAndPreferences: { en: "Allergies & preferences", pl: "Alergie i preferencje", es: "Alergias y preferencias", el: "Αλλεργίες & προτιμήσεις", pt: "Alergias e preferências" },
  cuisine:        { en: "Cuisine",            pl: "Kuchnia",            es: "Cocina",               el: "Κουζίνα",              pt: "Cozinha" },
  createdBy:      { en: "Created by",         pl: "Autor",              es: "Creado por",           el: "Δημιουργήθηκε από",    pt: "Criado por" },
  anyTime:        { en: "Any time",           pl: "Dowolny czas",       es: "Cualquier tiempo",     el: "Οποιοσδήποτε χρόνος",  pt: "Qualquer tempo" },
  under30:        { en: "Under 30 min",       pl: "Poniżej 30 min",     es: "Menos de 30 min",      el: "Κάτω από 30 λεπτά",    pt: "Menos de 30 min" },
  under60:        { en: "Under 1 hour",       pl: "Poniżej godziny",    es: "Menos de 1 hora",      el: "Κάτω από 1 ώρα",       pt: "Menos de 1 hora" },
  under2h:        { en: "Under 2 hours",      pl: "Poniżej 2 godzin",   es: "Menos de 2 horas",     el: "Κάτω από 2 ώρες",      pt: "Menos de 2 horas" },

  // ─── Recipe page chrome ───
  back:           { en: "Back",               pl: "Wstecz",             es: "Atrás",                el: "Πίσω",                 pt: "Voltar" },
  backToCookbook: { en: "Back to cookbook",   pl: "Powrót do książki kucharskiej", es: "Volver al recetario", el: "Πίσω στο βιβλίο", pt: "Voltar ao livro" },
  startCooking:   { en: "Start cooking",      pl: "Zacznij gotować",    es: "Empezar a cocinar",    el: "Ξεκίνα το μαγείρεμα",  pt: "Começar a cozinhar" },
  startTimer:     { en: "Start timer",        pl: "Włącz minutnik",     es: "Iniciar temporizador", el: "Έναρξη χρονόμετρου",   pt: "Iniciar temporizador" },
  make:           { en: "Make",               pl: "Twórz",              es: "Hacer",                el: "Φτιάξε",               pt: "Fazer" },
  settings:       { en: "Settings",           pl: "Ustawienia",         es: "Ajustes",              el: "Ρυθμίσεις",            pt: "Definições" },
  signedIn:       { en: "Signed in",          pl: "Zalogowany",         es: "Sesión iniciada",      el: "Συνδεδεμένος",         pt: "Sessão iniciada" },
  notSignedIn:    { en: "Not signed in",      pl: "Niezalogowany",      es: "Sin sesión",           el: "Μη συνδεδεμένος",      pt: "Sem sessão" },
  editFinishTime: { en: "Tap to adjust finish time", pl: "Stuknij, aby zmienić godzinę", es: "Toca para ajustar la hora de fin", el: "Πατήστε για ρύθμιση ώρας", pt: "Toque para ajustar a hora de fim" },
  shoppingList:   { en: "Shopping list",      pl: "Lista zakupów",      es: "Lista de compras",     el: "Λίστα αγορών",         pt: "Lista de compras" },
  addToShoppingList: { en: "Add to shopping list", pl: "Dodaj do listy zakupów", es: "Agregar a la lista de compras", el: "Προσθήκη στη λίστα αγορών", pt: "Adicionar à lista de compras" },
  print:          { en: "Print",              pl: "Drukuj",             es: "Imprimir",             el: "Εκτύπωση",             pt: "Imprimir" },
  shareRecipe:    { en: "Share",              pl: "Udostępnij",         es: "Compartir",            el: "Κοινοποίηση",          pt: "Partilhar" },
  pdf:            { en: "PDF",                pl: "PDF",                es: "PDF",                  el: "PDF",                  pt: "PDF" },
  edit:           { en: "Edit",               pl: "Edytuj",             es: "Editar",               el: "Επεξεργασία",          pt: "Editar" },
  delete:         { en: "Delete",             pl: "Usuń",               es: "Eliminar",             el: "Διαγραφή",             pt: "Eliminar" },
  cancel:         { en: "Cancel",             pl: "Anuluj",             es: "Cancelar",             el: "Ακύρωση",              pt: "Cancelar" },
  save:           { en: "Save",               pl: "Zapisz",             es: "Guardar",              el: "Αποθήκευση",           pt: "Guardar" },
  saveChanges:    { en: "Save changes",       pl: "Zapisz zmiany",      es: "Guardar cambios",      el: "Αποθήκευση αλλαγών",   pt: "Guardar alterações" },
  saveRecipe:     { en: "Save recipe",        pl: "Zapisz przepis",     es: "Guardar receta",       el: "Αποθήκευση συνταγής",  pt: "Guardar receita" },
  prep:           { en: "Prep",               pl: "Przygotowanie",      es: "Preparación",          el: "Προετοιμασία",         pt: "Preparação" },
  cook:           { en: "Cook",               pl: "Gotowanie",          es: "Cocción",              el: "Μαγείρεμα",            pt: "Cozedura" },
  total:          { en: "Total",              pl: "Razem",              es: "Total",                el: "Σύνολο",               pt: "Total" },
  servings:       { en: "Servings",           pl: "Porcje",             es: "Porciones",            el: "Μερίδες",              pt: "Doses" },
  fewerServings:  { en: "Fewer servings",     pl: "Mniej porcji",       es: "Menos porciones",      el: "Λιγότερες μερίδες",    pt: "Menos doses" },
  moreServings:   { en: "More servings",      pl: "Więcej porcji",      es: "Más porciones",        el: "Περισσότερες μερίδες", pt: "Mais doses" },
  units:          { en: "Units",              pl: "Jednostki",          es: "Unidades",             el: "Μονάδες",              pt: "Unidades" },
  ingredients:    { en: "Ingredients",        pl: "Składniki",          es: "Ingredientes",         el: "Υλικά",                pt: "Ingredientes" },
  steps:          { en: "Steps",              pl: "Kroki",              es: "Pasos",                el: "Βήματα",               pt: "Passos" },
  cooksNotes:     { en: "Cook's notes",       pl: "Notatki kucharza",   es: "Notas del cocinero",   el: "Σημειώσεις μάγειρα",   pt: "Notas do cozinheiro" },
  notesInMargin:  { en: "Notes in the margin",pl: "Notatki na marginesie", es: "Notas al margen", el: "Σημειώσεις στο περιθώριο", pt: "Notas à margem" },
  goesGreatWith:  { en: "Goes great with",    pl: "Świetnie pasuje z",  es: "Acompaña bien con",    el: "Πάει υπέροχα με",      pt: "Combina muito bem com" },
  showNutrition:  { en: "Show nutrition per serving", pl: "Pokaż wartości odżywcze na porcję", es: "Mostrar nutrición por porción", el: "Εμφάνιση διατροφικών στοιχείων ανά μερίδα", pt: "Mostrar informação nutricional por dose" },
  hideNutrition:  { en: "Hide nutrition",     pl: "Ukryj wartości odżywcze", es: "Ocultar nutrición", el: "Απόκρυψη διατροφικών στοιχείων", pt: "Ocultar nutrição" },
  nutritionRough: { en: "Rough estimates — for precise tracking, edit the values yourself.", pl: "Wartości przybliżone — dla dokładnych pomiarów edytuj je samodzielnie.", es: "Estimaciones aproximadas — para un seguimiento preciso, edita los valores tú mismo.", el: "Κατά προσέγγιση — για ακριβή παρακολούθηση, επεξεργάσου τις τιμές μόνος.", pt: "Estimativas aproximadas — para um registo preciso, edita tu mesmo os valores." },
  iWantThisDoneBy:{ en: "I want this done by",pl: "Chcę żeby było gotowe na", es: "Lo quiero listo para", el: "Το θέλω έτοιμο μέχρι", pt: "Quero pronto às" },
  startAt:        { en: "Start at",           pl: "Zacznij o",          es: "Empezar a las",        el: "Έναρξη στις",          pt: "Começar às" },
  doneAt:         { en: "Done at",            pl: "Gotowe o",           es: "Listo a las",          el: "Έτοιμο στις",          pt: "Pronto às" },
  doneBy:         { en: "Done by",            pl: "Gotowe na",          es: "Listo para",           el: "Έτοιμο μέχρι",         pt: "Pronto até" },
  takes:          { en: "Takes",              pl: "Trwa",               es: "Toma",                 el: "Διαρκεί",              pt: "Demora" },
  handsOn:        { en: "Hands-on",           pl: "Czas pracy",         es: "Tiempo activo",        el: "Ενεργός χρόνος",       pt: "Tempo ativo" },
  parkOvernight:  { en: "park overnight",     pl: "zostaw na noc",      es: "dejar de un día para otro", el: "άστο όλη τη νύχτα", pt: "deixar de um dia para o outro" },
  itemsGrouped:   { en: "items, grouped by section", pl: "elementów, w sekcjach", es: "artículos, agrupados por sección", el: "στοιχεία, ομαδοποιημένα ανά κατηγορία", pt: "itens, agrupados por secção" },
  startMinEarlier:{ en: "Start 5 min earlier",pl: "Zacznij 5 min wcześniej", es: "Empezar 5 min antes", el: "Έναρξη 5 λεπτά νωρίτερα", pt: "Começar 5 min mais cedo" },
  startMinLater:  { en: "Start 5 min later",  pl: "Zacznij 5 min później", es: "Empezar 5 min después", el: "Έναρξη 5 λεπτά αργότερα", pt: "Começar 5 min mais tarde" },
  decreaseUnit:   { en: "Decrease",           pl: "Zmniejsz",           es: "Disminuir",            el: "Μείωση",               pt: "Diminuir" },
  increaseUnit:   { en: "Increase",           pl: "Zwiększ",            es: "Aumentar",             el: "Αύξηση",               pt: "Aumentar" },
  dismiss:        { en: "Dismiss",            pl: "Zamknij",            es: "Descartar",            el: "Απόρριψη",             pt: "Dispensar" },
  close:          { en: "Close",              pl: "Zamknij",            es: "Cerrar",               el: "Κλείσιμο",             pt: "Fechar" },
  removeFromFavorites: { en: "Remove from favorites", pl: "Usuń z ulubionych", es: "Quitar de favoritos", el: "Αφαίρεση από αγαπημένα", pt: "Remover dos favoritos" },
  addToFavorites: { en: "Add to favorites",   pl: "Dodaj do ulubionych", es: "Agregar a favoritos", el: "Προσθήκη στα αγαπημένα", pt: "Adicionar aos favoritos" },
  signInToFavorites: { en: "Sign in to save favorites.", pl: "Zaloguj się, aby zapisać ulubione.", es: "Inicia sesión para guardar favoritos.", el: "Συνδέσου για να αποθηκεύσεις αγαπημένα.", pt: "Entra para guardar favoritos." },

  // ─── Comments ───
  oneNote:        { en: "note",               pl: "notatka",            es: "nota",                 el: "σημείωση",             pt: "nota" },
  manyNotes:      { en: "notes",              pl: "notatki",            es: "notas",                el: "σημειώσεις",           pt: "notas" },
  leaveANote:     { en: "Leave a note",       pl: "Zostaw notatkę",     es: "Dejar una nota",       el: "Άφησε σημείωση",       pt: "Deixar uma nota" },
  postNote:       { en: "Post note",          pl: "Opublikuj notatkę",  es: "Publicar nota",        el: "Δημοσίευση",           pt: "Publicar nota" },
  posting:        { en: "Posting…",           pl: "Publikowanie…",      es: "Publicando…",          el: "Δημοσίευση…",          pt: "A publicar…" },
  yourName:       { en: "Your name",          pl: "Twoje imię",         es: "Tu nombre",            el: "Το όνομά σου",         pt: "O teu nome" },
  commentPlaceholder: {
    en: "What did you change? What did the kids say? What would your grandma do?",
    pl: "Co zmieniłeś? Co powiedziały dzieci? Co zrobiłaby Twoja babcia?",
    es: "¿Qué cambiaste? ¿Qué dijeron los niños? ¿Qué haría tu abuela?",
    el: "Τι άλλαξες; Τι είπαν τα παιδιά; Τι θα έκανε η γιαγιά σου;",
    pt: "O que mudaste? O que disseram os miúdos? O que faria a tua avó?",
  },
  ratingOptional: { en: "Rating (optional):", pl: "Ocena (opcjonalnie):", es: "Calificación (opcional):", el: "Βαθμολογία (προαιρετικό):", pt: "Avaliação (opcional):" },
  addPhoto:       { en: "Add photo",          pl: "Dodaj zdjęcie",      es: "Agregar foto",         el: "Προσθήκη φωτογραφίας", pt: "Adicionar foto" },
  photoAttached:  { en: "Photo attached",     pl: "Zdjęcie dołączone",  es: "Foto adjuntada",       el: "Φωτογραφία συνημμένη", pt: "Foto anexada" },
  uploading:      { en: "Uploading…",         pl: "Wysyłanie…",         es: "Subiendo…",            el: "Μεταφόρτωση…",         pt: "A carregar…" },
  removePhoto:    { en: "Remove photo",       pl: "Usuń zdjęcie",       es: "Quitar foto",          el: "Αφαίρεση φωτογραφίας", pt: "Remover foto" },
  deleteYourNote: { en: "Delete your note",   pl: "Usuń notatkę",       es: "Eliminar tu nota",     el: "Διαγραφή σημείωσης",   pt: "Eliminar a tua nota" },
  signInToLeaveNote: { en: "Sign in to leave a note.", pl: "Zaloguj się, aby zostawić notatkę.", es: "Inicia sesión para dejar una nota.", el: "Συνδέσου για να αφήσεις σημείωση.", pt: "Entra para deixar uma nota." },

  // ─── Meal plan ───
  planYourMeal:   { en: "Plan your meal",     pl: "Zaplanuj posiłek",   es: "Planea tu comida",     el: "Σχεδίασε το γεύμα σου", pt: "Planeia a tua refeição" },
  planSubtitle:   {
    en: "we'll back-time the schedule so everything lands at once.",
    pl: "rozplanujemy harmonogram, żeby wszystko było gotowe naraz.",
    es: "calcularemos el horario para que todo quede listo al mismo tiempo.",
    el: "θα προγραμματίσουμε ώστε όλα να είναι έτοιμα μαζί.",
    pt: "vamos planear o horário para que tudo fique pronto ao mesmo tempo.",
  },
  recipe:         { en: "recipe",             pl: "przepis",            es: "receta",               el: "συνταγή",              pt: "receita" },
  recipes:        { en: "recipes",            pl: "przepisy",           es: "recetas",              el: "συνταγές",             pt: "receitas" },
  date:           { en: "Date",               pl: "Data",               es: "Fecha",                el: "Ημερομηνία",           pt: "Data" },
  time:           { en: "Time",               pl: "Czas",               es: "Hora",                 el: "Ώρα",                  pt: "Hora" },
  orPickAPreset:  { en: "Or pick a preset",   pl: "Lub wybierz gotowy", es: "O elige un preestablecido", el: "Ή διάλεξε προεπιλογή", pt: "Ou escolhe uma predefinição" },
  lunchToday:     { en: "Lunch today",        pl: "Lunch dziś",         es: "Almuerzo hoy",         el: "Μεσημεριανό σήμερα",   pt: "Almoço hoje" },
  dinnerToday:    { en: "Dinner today",       pl: "Obiad dziś",         es: "Cena hoy",             el: "Δείπνο σήμερα",        pt: "Jantar hoje" },
  lateDinner:     { en: "Late dinner",        pl: "Późny obiad",        es: "Cena tarde",           el: "Αργό δείπνο",          pt: "Jantar tarde" },
  tomorrow:       { en: "Tomorrow",           pl: "Jutro",              es: "Mañana",               el: "Αύριο",                pt: "Amanhã" },
  saturday:       { en: "Saturday",           pl: "Sobota",             es: "Sábado",               el: "Σάββατο",              pt: "Sábado" },
  onTheMenu:      { en: "On the menu",        pl: "W menu",             es: "En el menú",           el: "Στο μενού",            pt: "No menu" },
  youllStartAt:   { en: "You'll start at",    pl: "Zaczynasz o",        es: "Empezarás a las",      el: "Θα ξεκινήσεις στις",   pt: "Vais começar às" },
  andEatAt:       { en: "And eat at",         pl: "I jesz o",           es: "Y comerás a las",      el: "Και θα φας στις",      pt: "E vais comer às" },
  buildSchedule:  { en: "Build the schedule", pl: "Zbuduj harmonogram", es: "Crear el horario",     el: "Φτιάξε το πρόγραμμα",  pt: "Criar o horário" },
  aiStaggers:     {
    en: "AI staggers prep so nothing gets cold.",
    pl: "AI rozplanuje przygotowania, żeby nic nie wystygło.",
    es: "La IA escalona la preparación para que nada se enfríe.",
    el: "Η AI κλιμακώνει την προετοιμασία ώστε τίποτα να μην κρυώσει.",
    pt: "A IA escalona a preparação para nada arrefecer.",
  },
  needsHeadStart: { en: "Needs a head start the night before", pl: "Wymaga przygotowania poprzedniego wieczoru", es: "Necesita empezar la noche anterior", el: "Χρειάζεται ξεκίνημα από το προηγούμενο βράδυ", pt: "Precisa de começar na noite anterior" },
  overnightExplain: {
    en: "has an overnight step (chilling, proofing, freezing). Instead of waking up at",
    pl: "ma krok nocny (chłodzenie, rośnięcie, mrożenie). Zamiast wstawać o",
    es: "tiene un paso de toda la noche (enfriar, levar, congelar). En vez de despertarte a las",
    el: "έχει βήμα ολονύχτιο (ψύξη, φούσκωμα, κατάψυξη). Αντί να ξυπνήσεις στις",
    pt: "tem um passo de uma noite (refrigerar, levedar, congelar). Em vez de acordar às",
  },
  theDayOf:       { en: "the day of, we'll start the night-before prep at:", pl: "w dniu gotowania, zaczniemy przygotowanie wieczorem o:", es: "el día, empezaremos la preparación la noche anterior a las:", el: "την ίδια μέρα, θα ξεκινήσουμε την προετοιμασία το προηγούμενο βράδυ στις:", pt: "no próprio dia, vamos começar a preparação na noite anterior às:" },
  theDayBefore:   { en: "the day before",     pl: "dzień wcześniej",    es: "el día anterior",      el: "την προηγούμενη μέρα", pt: "no dia anterior" },
  dayBefore:      { en: "the day before",     pl: "dzień wcześniej",    es: "el día anterior",      el: "την προηγούμενη μέρα", pt: "no dia anterior" },
  dayOf:          { en: "day of",             pl: "dzień gotowania",    es: "el día mismo",         el: "την ίδια μέρα",        pt: "no próprio dia" },
  tonightsPlan:   { en: "Tonight's plan",     pl: "Plan na dziś",       es: "Plan para esta noche", el: "Σχέδιο για απόψε",     pt: "Plano para esta noite" },
  allReadyBy:     { en: "All ready by",       pl: "Wszystko gotowe na", es: "Todo listo para",      el: "Όλα έτοιμα μέχρι",     pt: "Tudo pronto até" },
  dish:           { en: "dish",               pl: "danie",              es: "platillo",             el: "πιάτο",                pt: "prato" },
  dishes:         { en: "dishes",             pl: "dania",              es: "platillos",            el: "πιάτα",                pt: "pratos" },
  aboutXOfCooking:{ en: "of cooking",         pl: "gotowania",          es: "de cocción",           el: "μαγειρέματος",         pt: "de cozedura" },
  staggeredSo:    { en: "staggered so everything lands at", pl: "rozłożone tak, żeby wszystko było gotowe na", es: "escalonado para que todo quede listo a las", el: "κλιμακωμένα ώστε όλα να είναι έτοιμα στις", pt: "escalonado para tudo ficar pronto às" },
  starts:         { en: "starts",             pl: "zaczyna o",          es: "empieza",              el: "ξεκινά",               pt: "começa" },
  combinedTimeline:{ en: "Combined timeline", pl: "Wspólny harmonogram", es: "Cronograma combinado", el: "Συνδυασμένο χρονοδιάγραμμα", pt: "Cronograma combinado" },
  reviewMeal:     { en: "Review meal",        pl: "Sprawdź posiłek",    es: "Revisar comida",       el: "Έλεγχος γεύματος",     pt: "Rever refeição" },
  recipesOnMenu:  { en: "recipes on the menu",pl: "przepisów w menu",   es: "recetas en el menú",   el: "συνταγές στο μενού",   pt: "receitas no menu" },
  recipeOnMenu:   { en: "recipe on the menu", pl: "przepis w menu",     es: "receta en el menú",    el: "συνταγή στο μενού",    pt: "receita no menu" },
  untilYourNextStep: { en: "until your next step.", pl: "do następnego kroku.", es: "hasta el próximo paso.", el: "μέχρι το επόμενο βήμα.", pt: "até ao próximo passo." },
  takeABreak:     { en: "Take a break.",      pl: "Zrób przerwę.",      es: "Tómate un descanso.",  el: "Κάνε ένα διάλειμμα.",  pt: "Faz uma pausa." },

  // ─── Cook mode ───
  exit:           { en: "Exit",               pl: "Wyjdź",              es: "Salir",                el: "Έξοδος",               pt: "Sair" },
  timeline:       { en: "Timeline",           pl: "Harmonogram",        es: "Cronograma",           el: "Χρονοδιάγραμμα",       pt: "Cronograma" },
  ingredientsOnHand: { en: "Ingredients on hand", pl: "Składniki pod ręką", es: "Ingredientes a la mano", el: "Υλικά διαθέσιμα", pt: "Ingredientes à mão" },
  step:           { en: "Step",               pl: "Krok",               es: "Paso",                 el: "Βήμα",                 pt: "Passo" },
  of:             { en: "of",                 pl: "z",                  es: "de",                   el: "από",                  pt: "de" },
  reset:          { en: "Reset",              pl: "Resetuj",            es: "Restablecer",          el: "Επαναφορά",            pt: "Repor" },
  resetAllAdjustments: { en: "Reset all timing adjustments?", pl: "Zresetować wszystkie korekty czasu?", es: "¿Restablecer todos los ajustes de tiempo?", el: "Επαναφορά όλων των ρυθμίσεων χρόνου;", pt: "Repor todos os ajustes de tempo?" },
  complete:       { en: "complete",           pl: "ukończonych",        es: "completados",          el: "ολοκληρωμένα",         pt: "concluídos" },
  toMarkAsDone:   { en: "to mark as done",    pl: "aby oznaczyć jako gotowe", es: "para marcar como hecho", el: "για σήμανση ως ολοκληρωμένο", pt: "para marcar como concluído" },

  // ─── Shopping list ───
  shoppingFor:    { en: "Shopping for",       pl: "Lista zakupów na",   es: "Lista para",           el: "Αγορές για",           pt: "Compras para" },
  markBought:     { en: "Tap to mark in your pantry", pl: "Dotknij, aby zaznaczyć w spiżarni", es: "Toca para marcar en tu despensa", el: "Πατήστε για σημείωση στο ντουλάπι", pt: "Toque para marcar na despensa" },
  haveOnHand:     { en: "Already have",       pl: "Już mam",            es: "Ya tengo",             el: "Ήδη έχω",              pt: "Já tenho" },
  toBuy:          { en: "Need to buy",        pl: "Do kupienia",        es: "Por comprar",          el: "Να αγοραστεί",         pt: "Por comprar" },

  // ─── Counts / units ───
  servingsLong:   { en: "servings",           pl: "porcji",             es: "porciones",            el: "μερίδες",              pt: "doses" },
  itemsLong:      { en: "items",              pl: "elementów",          es: "artículos",            el: "στοιχεία",             pt: "itens" },

  // ─── Polite UI bits ───
  loading:        { en: "Loading…",           pl: "Ładowanie…",         es: "Cargando…",            el: "Φόρτωση…",             pt: "A carregar…" },
  saving:         { en: "Saving…",            pl: "Zapisywanie…",       es: "Guardando…",           el: "Αποθήκευση…",          pt: "A guardar…" },

  // ─── "by X" on recipe cards / header ───
  by:             { en: "by",                 pl: "od",                 es: "por",                  el: "από",                  pt: "por" },
  aRecipeFrom:    { en: "A recipe from",      pl: "Przepis od",         es: "Una receta de",        el: "Συνταγή από",          pt: "Uma receita de" },

  // ─── Add / edit recipe form ───
  editing:        { en: "Editing",            pl: "Edytuję",            es: "Editando",             el: "Επεξεργασία",          pt: "A editar" },
  newEntry:       { en: "New entry",          pl: "Nowy wpis",          es: "Nueva entrada",        el: "Νέα καταχώρηση",       pt: "Nova entrada" },
  addRecipeToCookbook: { en: "Add a recipe to the cookbook", pl: "Dodaj przepis do książki kucharskiej", es: "Agregar una receta al recetario", el: "Προσθήκη συνταγής στο βιβλίο", pt: "Adicionar uma receita ao livro" },
  editRecipeTitle:{ en: "Edit recipe",        pl: "Edytuj przepis",     es: "Editar receta",        el: "Επεξεργασία συνταγής", pt: "Editar receita" },
  titleRequired:  { en: "Title *",            pl: "Tytuł *",            es: "Título *",             el: "Τίτλος *",             pt: "Título *" },
  oneLineSubLbl:  { en: "One-line subtitle",  pl: "Jednoliniowy podtytuł", es: "Subtítulo de una línea", el: "Υπότιτλος μιας γραμμής", pt: "Subtítulo de uma linha" },
  addedByLbl:     { en: "Added by",           pl: "Dodał(a)",           es: "Agregado por",         el: "Προστέθηκε από",       pt: "Adicionado por" },
  sourceLinkLbl:  { en: "Source link",        pl: "Link źródłowy",      es: "Enlace fuente",        el: "Σύνδεσμος πηγής",      pt: "Ligação de origem" },
  sourceLinkPh:   { en: "https://example.com/recipe (optional)", pl: "https://przyklad.pl/przepis (opcjonalne)", es: "https://ejemplo.com/receta (opcional)", el: "https://example.com/recipe (προαιρετικό)", pt: "https://exemplo.com/receita (opcional)" },
  linkLabelPh:    { en: "Link label",         pl: "Nazwa linku",        es: "Etiqueta del enlace",  el: "Ετικέτα συνδέσμου",    pt: "Etiqueta da ligação" },
  courseSlashCuisine: { en: "Course / Cuisine", pl: "Danie / Kuchnia",  es: "Tiempo / Cocina",      el: "Πιάτο / Κουζίνα",      pt: "Prato / Cozinha" },
  dietPrefsLbl:   { en: "Diet / preferences", pl: "Dieta / preferencje", es: "Dieta / preferencias", el: "Διατροφή / προτιμήσεις", pt: "Dieta / preferências" },
  prepCookMin:    { en: "Prep / Cook time (min)", pl: "Czas przygotowania / gotowania (min)", es: "Tiempo de prep / cocción (min)", el: "Χρόνος προετοιμασίας / μαγειρέματος (λεπτά)", pt: "Tempo de preparação / cozedura (min)" },
  prepPh:         { en: "Prep",               pl: "Przygotowanie",      es: "Preparación",          el: "Προετοιμασία",         pt: "Preparação" },
  cookPh:         { en: "Cook",               pl: "Gotowanie",          es: "Cocción",              el: "Μαγείρεμα",            pt: "Cozedura" },
  servingsDefaultLbl: { en: "Servings (default)", pl: "Porcje (domyślne)", es: "Porciones (por defecto)", el: "Μερίδες (προεπιλογή)", pt: "Doses (predefinição)" },
  difficultyLbl:  { en: "Difficulty",         pl: "Trudność",           es: "Dificultad",           el: "Δυσκολία",             pt: "Dificuldade" },
  nutritionPerServing: { en: "Nutrition (per serving)", pl: "Wartości odżywcze (na porcję)", es: "Nutrición (por porción)", el: "Διατροφικά (ανά μερίδα)", pt: "Nutrição (por dose)" },
  calories:       { en: "Calories",           pl: "Kalorie",            es: "Calorías",             el: "Θερμίδες",             pt: "Calorias" },
  proteinG:       { en: "Protein (g)",        pl: "Białko (g)",         es: "Proteína (g)",         el: "Πρωτεΐνη (γρ)",        pt: "Proteína (g)" },
  carbsG:         { en: "Carbs (g)",          pl: "Węglowodany (g)",    es: "Carbohidratos (g)",    el: "Υδατάνθρακες (γρ)",    pt: "Hidratos (g)" },
  fatG:           { en: "Fat (g)",            pl: "Tłuszcz (g)",        es: "Grasa (g)",            el: "Λίπος (γρ)",           pt: "Gordura (g)" },
  fiberG:         { en: "Fiber (g)",          pl: "Błonnik (g)",        es: "Fibra (g)",            el: "Φυτικές ίνες (γρ)",    pt: "Fibra (g)" },
  sodiumMg:       { en: "Sodium (mg)",        pl: "Sód (mg)",           es: "Sodio (mg)",           el: "Νάτριο (μγ)",          pt: "Sódio (mg)" },
  cooksNotesTipsLbl: { en: "Cook's notes / tips", pl: "Notatki kucharza / wskazówki", es: "Notas del cocinero / consejos", el: "Σημειώσεις / συμβουλές μάγειρα", pt: "Notas / dicas do cozinheiro" },
  addTip:         { en: "Add tip",            pl: "Dodaj wskazówkę",    es: "Agregar consejo",      el: "Προσθήκη συμβουλής",   pt: "Adicionar dica" },
  exampleTip:     {
    en: "e.g. Pull from the fridge 2 hours before cooking.",
    pl: "np. Wyjmij z lodówki 2 godziny przed gotowaniem.",
    es: "p. ej. Sácalo del refri 2 horas antes de cocinar.",
    el: "π.χ. Βγάλτο από το ψυγείο 2 ώρες πριν το μαγείρεμα.",
    pt: "p. ex. Tira do frigorífico 2 horas antes de cozinhar.",
  },
  heroPhotoLbl:   { en: "Hero photo",         pl: "Główne zdjęcie",     es: "Foto principal",       el: "Κύρια φωτογραφία",     pt: "Foto principal" },
  uploadPhoto:    { en: "Upload photo",       pl: "Wgraj zdjęcie",      es: "Subir foto",           el: "Μεταφόρτωση φωτογραφίας", pt: "Carregar foto" },
  aiGenerateFromTitle: { en: "AI generate", pl: "Generuj (AI)", es: "Generar con IA", el: "Δημιουργία με AI", pt: "Gerar com IA" },
  aiGenerateHint:      { en: "Generate a hero photo from the title in the family-cookbook style", pl: "Wygeneruj zdjęcie z tytułu w stylu rodzinnej książki kucharskiej", es: "Genera una foto principal a partir del título en el estilo del recetario familiar", el: "Δημιουργία κύριας φωτογραφίας από τον τίτλο στο στυλ του οικογενειακού βιβλίου", pt: "Gera uma foto principal a partir do título no estilo do livro de família" },
  aiGenerateNeedsTitle:{ en: "Add a title first so the AI knows what to draw.", pl: "Najpierw dodaj tytuł, żeby AI wiedziało, co narysować.", es: "Agrega un título primero para que la IA sepa qué dibujar.", el: "Πρόσθεσε πρώτα τίτλο για να ξέρει η AI τι να σχεδιάσει.", pt: "Adiciona primeiro um título para a IA saber o que desenhar." },
  generating:          { en: "Generating…",            pl: "Generuję…",          es: "Generando…",           el: "Δημιουργία…",          pt: "A gerar…" },
  estimateWithAI:      { en: "Estimate with AI",       pl: "Oszacuj z AI",       es: "Estimar con IA",       el: "Εκτίμηση με AI",       pt: "Estimar com IA" },
  estimating:          { en: "Estimating…",            pl: "Szacuję…",           es: "Estimando…",           el: "Εκτίμηση…",            pt: "A estimar…" },
  estimateNutritionHint:{ en: "Rough per-serving estimate based on the ingredient list", pl: "Przybliżone oszacowanie na porcję na podstawie listy składników", es: "Estimación aproximada por porción según la lista de ingredientes", el: "Κατά προσέγγιση ανά μερίδα βάσει της λίστας υλικών", pt: "Estimativa aproximada por dose com base na lista de ingredientes" },
  nutritionNeedsIngredients: { en: "Add some ingredients first.", pl: "Najpierw dodaj składniki.", es: "Agrega algunos ingredientes primero.", el: "Πρόσθεσε πρώτα μερικά υλικά.", pt: "Adiciona primeiro alguns ingredientes." },

  // Mode tabs
  pasteAndAi:     { en: "Type it in",         pl: "Wpisz przepis",      es: "Escríbela",            el: "Πληκτρολόγησέ τη",     pt: "Escreve-a" },
  manualEntry:    { en: "Manual entry",       pl: "Wpis ręczny",        es: "Entrada manual",       el: "Χειροκίνητη εισαγωγή", pt: "Entrada manual" },
  photoOfCookbook:{ en: "Upload photo",       pl: "Wgraj zdjęcie",      es: "Subir foto",           el: "Μεταφόρτωση φωτογραφίας", pt: "Carregar foto" },
  linkToUrl:      { en: "Link to a URL",      pl: "Link do strony",     es: "Enlace a URL",         el: "Σύνδεσμος σε URL",     pt: "Ligação a um URL" },

  // Mode panels
  aiExtraction:   { en: "AI extraction",      pl: "Ekstrakcja AI",      es: "Extracción con IA",    el: "Εξαγωγή με AI",        pt: "Extração com IA" },
  extractRecipe:  { en: "Extract recipe",     pl: "Wyciągnij przepis",  es: "Extraer receta",       el: "Εξαγωγή συνταγής",     pt: "Extrair receita" },
  extracting:     { en: "Extracting…",        pl: "Przetwarzanie…",     es: "Extrayendo…",          el: "Εξαγωγή…",             pt: "A extrair…" },
  aiPasteHelper:  {
    en: "You'll review every field before saving. AI fills in missing details — never replaces yours.",
    pl: "Przed zapisem sprawdzisz każde pole. AI uzupełnia brakujące — nigdy nie nadpisuje Twojego.",
    es: "Revisarás cada campo antes de guardar. La IA completa lo que falta — nunca reemplaza lo tuyo.",
    el: "Θα ελέγξεις κάθε πεδίο πριν την αποθήκευση. Η AI συμπληρώνει ό,τι λείπει — ποτέ δεν αντικαθιστά τα δικά σου.",
    pt: "Vais rever cada campo antes de guardar. A IA preenche o que falta — nunca substitui o teu.",
  },
  aiPastePlaceholder: {
    en: "Paste anything — type a recipe from memory, a recipe emailed from your mom, copy/paste from a blog, or paste a link to a recipe. We'll pull out the title, ingredients, steps, and timing, then let you review and tidy up before saving.",
    pl: "Wklej cokolwiek — wpisz przepis z pamięci, przepis przesłany e-mailem od mamy, skopiuj z bloga lub wklej link do przepisu. Wyciągniemy tytuł, składniki, kroki i czasy, a Ty sprawdzisz i poprawisz przed zapisem.",
    es: "Pega lo que sea — escribe una receta de memoria, una receta que te envió tu mamá, copia y pega de un blog, o pega un enlace a una receta. Sacaremos el título, ingredientes, pasos y tiempos, y luego podrás revisar y arreglar antes de guardar.",
    el: "Επικόλλησε ό,τι θες — γράψε συνταγή από μνήμη, συνταγή που σου έστειλε η μαμά σου, αντίγραψε από blog ή επικόλλησε σύνδεσμο. Θα εξάγουμε τον τίτλο, τα υλικά, τα βήματα και τους χρόνους και μετά τα ελέγχεις και τα τακτοποιείς πριν την αποθήκευση.",
    pt: "Cola o que quiseres — escreve uma receita de memória, uma receita enviada pela tua mãe, copia de um blogue ou cola uma ligação. Extraímos o título, ingredientes, passos e tempos e depois revês e arrumas antes de guardar.",
  },
  snapPhotoOfCookbook: { en: "Snap or upload a photo", pl: "Zrób lub wgraj zdjęcie", es: "Toma o sube una foto", el: "Τράβα ή ανέβασε φωτογραφία", pt: "Tira ou carrega uma foto" },
  takePhotoHelper:{
    en: "Take a photo (or pick from camera roll). AI will read the page and pull out the recipe.",
    pl: "Zrób zdjęcie (lub wybierz z galerii). AI odczyta stronę i wyciągnie przepis.",
    es: "Toma una foto (o elige de la galería). La IA leerá la página y sacará la receta.",
    el: "Τράβα φωτογραφία (ή διάλεξε από τη συλλογή). Η AI θα διαβάσει τη σελίδα και θα εξάγει τη συνταγή.",
    pt: "Tira uma foto (ou escolhe da galeria). A IA lê a página e extrai a receita.",
  },
  uploadImage:    { en: "Upload an image",    pl: "Wgraj zdjęcie",      es: "Subir una imagen",     el: "Μεταφόρτωση εικόνας",  pt: "Carregar uma imagem" },
  takePhoto:      { en: "Take photo",         pl: "Zrób zdjęcie",       es: "Tomar foto",           el: "Λήψη φωτογραφίας",     pt: "Tirar foto" },
  pageN:          { en: "Page {n}",           pl: "Strona {n}",         es: "Página {n}",           el: "Σελίδα {n}",           pt: "Página {n}" },
  removePage:     { en: "Remove page",        pl: "Usuń stronę",        es: "Quitar página",        el: "Αφαίρεση σελίδας",     pt: "Remover página" },
  extractRecipeN: { en: "Extract recipe ({n})", pl: "Wyciągnij przepis ({n})", es: "Extraer receta ({n})", el: "Εξαγωγή συνταγής ({n})", pt: "Extrair receita ({n})" },
  originalRecipeImages: { en: "Original recipe card images", pl: "Oryginalne zdjęcia przepisu", es: "Imágenes originales de la receta", el: "Πρωτότυπες φωτογραφίες συνταγής", pt: "Imagens originais da receita" },
  showOnRecipePage:    { en: "Show on the recipe page",      pl: "Pokaż na stronie przepisu", es: "Mostrar en la página de la receta", el: "Εμφάνιση στη σελίδα της συνταγής", pt: "Mostrar na página da receita" },
  originalImagesHint:  {
    en: "Adds a small button to the hero photo. Tap to see the originals — handy for handwritten cards from family.",
    pl: "Dodaje mały przycisk na zdjęciu głównym. Kliknij, aby zobaczyć oryginały — przydatne dla odręcznych kart od rodziny.",
    es: "Agrega un botoncito a la foto principal. Tócalo para ver los originales — útil para tarjetas escritas a mano de la familia.",
    el: "Προσθέτει μικρό κουμπί στην κύρια φωτογραφία. Πάτησε για να δεις τα πρωτότυπα — χρήσιμο για χειρόγραφες κάρτες από την οικογένεια.",
    pt: "Adiciona um botão pequeno à foto principal. Toca para ver os originais — útil para cartões manuscritos da família.",
  },
  viewOriginal:        { en: "View original",  pl: "Oryginał",          es: "Ver original",          el: "Πρωτότυπο",            pt: "Ver original" },
  viewOriginalRecipe:  { en: "View the original recipe images", pl: "Zobacz oryginalne zdjęcia przepisu", es: "Ver las imágenes originales de la receta", el: "Δες τις πρωτότυπες εικόνες της συνταγής", pt: "Ver as imagens originais da receita" },
  tapToClose:          { en: "Tap anywhere to close", pl: "Kliknij gdziekolwiek, aby zamknąć", es: "Toca en cualquier lado para cerrar", el: "Πάτησε οπουδήποτε για κλείσιμο", pt: "Toca em qualquer sítio para fechar" },
  multiPagePhotoHelper: {
    en: "Add up to 6 photos — front + back of a recipe card, or both pages of a cookbook spread. Drag-and-drop works on desktop. You'll review every field before saving.",
    pl: "Dodaj do 6 zdjęć — przód i tył karty z przepisem albo obie strony rozkładówki książki. Na komputerze możesz upuszczać pliki na pole. Sprawdzisz każde pole przed zapisem.",
    es: "Agrega hasta 6 fotos — frente y reverso de una tarjeta de receta, o ambas páginas de un libro abierto. En la compu puedes arrastrar y soltar. Revisarás cada campo antes de guardar.",
    el: "Πρόσθεσε έως 6 φωτογραφίες — μπρος και πίσω μιας κάρτας ή και τις δύο σελίδες ενός βιβλίου. Στον υπολογιστή λειτουργεί drag-and-drop. Θα ελέγξεις κάθε πεδίο πριν την αποθήκευση.",
    pt: "Adiciona até 6 fotos — frente e verso de um cartão de receita, ou as duas páginas de um livro aberto. No computador podes arrastar e largar. Vais rever cada campo antes de guardar.",
  },
  pasteUrlHere:   { en: "Paste a recipe URL", pl: "Wklej link do przepisu", es: "Pega una URL de receta", el: "Επικόλλησε URL συνταγής", pt: "Cola um URL de receita" },
  fetchAndParse:  { en: "Fetch & parse",      pl: "Pobierz i przetwórz",es: "Obtener y procesar",   el: "Λήψη & επεξεργασία",   pt: "Obter e processar" },
  fetchUrlHelper: {
    en: "Works for most blogs and recipe sites. We'll grab the recipe and let you review.",
    pl: "Działa dla większości blogów. Pobierzemy przepis i pozwolimy Ci go sprawdzić.",
    es: "Funciona con la mayoría de blogs y sitios de recetas. Sacaremos la receta y la podrás revisar.",
    el: "Λειτουργεί για τα περισσότερα blogs και sites συνταγών. Θα πιάσουμε τη συνταγή και θα μπορείς να την ελέγξεις.",
    pt: "Funciona para a maioria dos blogues e sites de receitas. Vamos buscar a receita e tu revês.",
  },
  aiFillMissing:  { en: "AI fill missing details", pl: "AI uzupełni brakujące", es: "IA completa detalles faltantes", el: "AI συμπληρώνει ό,τι λείπει", pt: "IA preenche o que falta" },

  // Save / cancel / delete in form
  saveToCookbook: { en: "Save to cookbook",   pl: "Zapisz w książce",   es: "Guardar en recetario", el: "Αποθήκευση στο βιβλίο", pt: "Guardar no livro" },
  deleteThisRecipe: { en: "Delete this recipe", pl: "Usuń ten przepis", es: "Eliminar esta receta", el: "Διαγραφή αυτής της συνταγής", pt: "Eliminar esta receita" },
  signInToSaveRecipes: { en: "Sign in to save recipes to the cookbook.", pl: "Zaloguj się, aby zapisywać przepisy.", es: "Inicia sesión para guardar recetas en el recetario.", el: "Συνδέσου για να αποθηκεύεις συνταγές.", pt: "Entra para guardar receitas no livro." },
  signInArrow:    { en: "Sign in →",          pl: "Zaloguj się →",      es: "Iniciar sesión →",     el: "Σύνδεση →",            pt: "Entrar →" },
  fillFormFirst:  {
    en: "You can fill in the form first; sign-in returns you here.",
    pl: "Możesz najpierw wypełnić formularz; zalogowanie wróci Cię tutaj.",
    es: "Puedes llenar el formulario primero; al iniciar sesión vuelves aquí.",
    el: "Μπορείς πρώτα να συμπληρώσεις τη φόρμα· η σύνδεση σε επιστρέφει εδώ.",
    pt: "Podes preencher o formulário primeiro; o início de sessão devolve-te aqui.",
  },

  // Section / step editor
  overnightStep:  { en: "Overnight step?",    pl: "Krok nocny?",        es: "¿Paso nocturno?",      el: "Ολονύχτιο βήμα;",      pt: "Passo de uma noite?" },
  recipeHasOvernight: {
    en: "Recipe has an overnight rest (fridge, proof, freeze, marinate)",
    pl: "Przepis ma odpoczynek nocny (lodówka, wyrastanie, mrożenie, marynowanie)",
    es: "La receta tiene un reposo nocturno (refri, levado, congelar, marinar)",
    el: "Η συνταγή έχει ολονύχτια ανάπαυση (ψυγείο, φούσκωμα, κατάψυξη, μαρινάρισμα)",
    pt: "A receita tem um repouso de uma noite (frigorífico, levedar, congelar, marinar)",
  },
  overnightHint:  {
    en: "Adds a \"The day before\" step at the top and groups the rest under \"Cooking day\". The scheduler will then plan the overnight step for the night before instead of pre-dawn the day of.",
    pl: "Dodaje krok „Dzień wcześniej” na górze i grupuje resztę w „Dniu gotowania”. Harmonogram zaplanuje wtedy krok nocny na poprzedni wieczór zamiast wczesnego rana.",
    es: "Agrega un paso \"El día anterior\" arriba y agrupa el resto bajo \"Día de cocción\". El programador planeará el paso nocturno para la noche anterior en vez de madrugar el día mismo.",
    el: "Προσθέτει βήμα «Την προηγούμενη μέρα» στην κορυφή και ομαδοποιεί τα υπόλοιπα στο «Ημέρα μαγειρέματος». Έτσι το ολονύχτιο βήμα προγραμματίζεται για το προηγούμενο βράδυ αντί για την αυγή της ίδιας μέρας.",
    pt: "Adiciona um passo «No dia anterior» no topo e agrupa o resto em «Dia de cozinhar». O planeador agenda o passo de uma noite para a véspera em vez de madrugar no próprio dia.",
  },
  addSection:     { en: "Add section",        pl: "Dodaj sekcję",       es: "Agregar sección",      el: "Προσθήκη ενότητας",    pt: "Adicionar secção" },
  addStep:        { en: "Add step",           pl: "Dodaj krok",         es: "Agregar paso",         el: "Προσθήκη βήματος",     pt: "Adicionar passo" },
  addIngredient:  { en: "Add ingredient",     pl: "Dodaj składnik",     es: "Agregar ingrediente",  el: "Προσθήκη υλικού",      pt: "Adicionar ingrediente" },
  moveUp:         { en: "Move up",            pl: "Przesuń w górę",     es: "Subir",                el: "Πάνω",                 pt: "Subir" },
  moveDown:       { en: "Move down",          pl: "Przesuń w dół",      es: "Bajar",                el: "Κάτω",                 pt: "Descer" },
  deleteSection:  { en: "Delete section",     pl: "Usuń sekcję",        es: "Eliminar sección",     el: "Διαγραφή ενότητας",    pt: "Eliminar secção" },
  sectionName:    { en: "Section name",       pl: "Nazwa sekcji",       es: "Nombre de sección",    el: "Όνομα ενότητας",       pt: "Nome da secção" },
  stepPlaceholder:{ en: "What happens in this step", pl: "Co się dzieje w tym kroku", es: "Qué pasa en este paso", el: "Τι γίνεται σε αυτό το βήμα", pt: "O que acontece neste passo" },
  qtyPh:          { en: "Qty",                pl: "Ilość",              es: "Cant.",                el: "Ποσ.",                 pt: "Qtd" },
  unitPh:         { en: "Unit",               pl: "Jedn.",              es: "Unidad",               el: "Μονάδα",               pt: "Unidade" },
  ingredientPh:   { en: "e.g. ground beef",   pl: "np. mielona wołowina", es: "p. ej. carne molida", el: "π.χ. κιμάς",          pt: "p. ex. carne picada" },
  qtyNotePh:      { en: "or 'by eye', 'to taste'…", pl: "albo 'na oko', 'do smaku'…", es: "o 'a ojo', 'al gusto'…", el: "ή «με το μάτι», «κατά γεύση»…", pt: "ou «a olho», «a gosto»…" },
  cuisinePh:      { en: "Cuisine (e.g. Italian)", pl: "Kuchnia (np. włoska)", es: "Cocina (p. ej. italiana)", el: "Κουζίνα (π.χ. ιταλική)", pt: "Cozinha (p. ex. italiana)" },
  titleEx:        { en: "e.g. Grandma's Sunday Lasagna", pl: "np. Niedzielna lasagna babci", es: "p. ej. La lasaña dominical de la abuela", el: "π.χ. Η κυριακάτικη λαζάνια της γιαγιάς", pt: "p. ex. A lasanha de domingo da avó" },
  subtitleEx:     { en: "A tagline, the family lore", pl: "Hasło, rodzinna legenda", es: "Una frase, la leyenda familiar", el: "Σύντομη φράση, η οικογενειακή ιστορία", pt: "Uma frase, a lenda da família" },
  hrs:            { en: "hrs",                pl: "godz",               es: "h",                    el: "ώρες",                 pt: "h" },
  mins:           { en: "mins",               pl: "min",                es: "min",                  el: "λεπτά",                pt: "min" },

  // ─── Meal plan modal & page ───
  staggerSubtitle:{
    en: "we'll back-time the schedule so everything lands at once.",
    pl: "rozplanujemy harmonogram, żeby wszystko było gotowe naraz.",
    es: "calcularemos el horario para que todo quede listo al mismo tiempo.",
    el: "θα προγραμματίσουμε ώστε όλα να είναι έτοιμα μαζί.",
    pt: "vamos planear o horário para que tudo fique pronto ao mesmo tempo.",
  },
  needsHeadStartTitle: { en: "Needs a head start the night before", pl: "Wymaga rozpoczęcia poprzedniego wieczoru", es: "Necesita empezar la noche anterior", el: "Χρειάζεται ξεκίνημα το προηγούμενο βράδυ", pt: "Precisa de começar na noite anterior" },
  overnightSentenceMid: { en: "an overnight step (chilling, proofing, freezing). Instead of waking up at", pl: "krok nocny (chłodzenie, wyrastanie, mrożenie). Zamiast wstawać o", es: "un paso nocturno (enfriar, levar, congelar). En vez de despertarte a las", el: "ένα ολονύχτιο βήμα (ψύξη, φούσκωμα, κατάψυξη). Αντί να ξυπνήσεις στις", pt: "um passo de uma noite (refrigerar, levedar, congelar). Em vez de acordar às" },
  overnightSentenceEnd: { en: "the day of, we'll start the night-before prep at:", pl: "w dniu gotowania, zaczniemy przygotowanie wieczorem o:", es: "el día, empezaremos la preparación la noche anterior a las:", el: "την ίδια μέρα, θα ξεκινήσουμε την προετοιμασία το προηγούμενο βράδυ στις:", pt: "no próprio dia, vamos começar a preparação na noite anterior às:" },
  has:            { en: "has",                pl: "ma",                 es: "tiene",                el: "έχει",                 pt: "tem" },
  have:           { en: "have",               pl: "mają",               es: "tienen",               el: "έχουν",                pt: "têm" },
  startingThe:    { en: "the day before",     pl: "poprzedniego dnia",  es: "el día anterior",      el: "την προηγούμενη μέρα", pt: "no dia anterior" },

  // Tweaks panel
  tweaks:         { en: "Tweaks",             pl: "Ustawienia",         es: "Ajustes",              el: "Ρυθμίσεις",            pt: "Ajustes" },

  // Shopping list
  toBuyShort:     { en: "to buy",             pl: "do kupienia",        es: "por comprar",          el: "για αγορά",            pt: "por comprar" },
  onHand:         { en: "on hand",            pl: "na półce",           es: "ya tengo",             el: "στο ντουλάπι",         pt: "já tenho" },
  copyNeeded:     { en: "Copy needed",        pl: "Skopiuj do kupienia",es: "Copiar lo que falta",  el: "Αντιγραφή λίστας",     pt: "Copiar o que falta" },
  download:       { en: "Download",           pl: "Pobierz",            es: "Descargar",            el: "Λήψη",                 pt: "Transferir" },
  done:           { en: "Done",               pl: "Gotowe",             es: "Listo",                el: "Έτοιμο",               pt: "Pronto" },
  copiedToClipboard: { en: "Copied the still-needed items to your clipboard.", pl: "Skopiowano potrzebne pozycje do schowka.", es: "Se copió lo que falta al portapapeles.", el: "Αντιγράφηκαν στο πρόχειρο όσα χρειάζονται ακόμα.", pt: "Itens em falta copiados para a área de transferência." },
  nothingToShopFor: { en: "Nothing to shop for yet. Open a recipe and tap \"Shopping list.\"", pl: "Jeszcze nic do kupienia. Otwórz przepis i dotknij „Lista zakupów”.", es: "Aún no hay nada por comprar. Abre una receta y toca \"Lista de compras\".", el: "Δεν υπάρχει τίποτα για αγορά ακόμα. Άνοιξε μια συνταγή και πάτησε «Λίστα αγορών».", pt: "Ainda não há nada para comprar. Abre uma receita e toca «Lista de compras»." },
};

// Lookup tables for data-driven values that come from canonical
// English in src/data.js — diet preferences, occasions, course names,
// step precision. `t()` only handles UI keys above; these helpers
// translate values that flow through the React tree.
const DIET = {
  "Gluten-free":   { pl: "Bezglutenowe",        es: "Sin gluten",       el: "Χωρίς γλουτένη",        pt: "Sem glúten" },
  "Dairy-free":    { pl: "Bez nabiału",         es: "Sin lácteos",      el: "Χωρίς γαλακτοκομικά",   pt: "Sem lactose" },
  "Nut-free":      { pl: "Bez orzechów",        es: "Sin nueces",       el: "Χωρίς ξηρούς καρπούς",  pt: "Sem frutos secos" },
  "Soy-free":      { pl: "Bez soi",             es: "Sin soya",         el: "Χωρίς σόγια",           pt: "Sem soja" },
  Vegan:           { pl: "Wegańskie",           es: "Vegano",           el: "Vegan",                 pt: "Vegan" },
  Vegetarian:      { pl: "Wegetariańskie",      es: "Vegetariano",      el: "Χορτοφαγικό",           pt: "Vegetariano" },
  Pescatarian:     { pl: "Pescatariańskie",     es: "Pescetariano",     el: "Πεσκαταριανό",          pt: "Pescetariano" },
  Carnivore:       { pl: "Mięsożerne",          es: "Carnívoro",        el: "Κρεοφάγο",              pt: "Carnívoro" },
  "High protein":  { pl: "Wysokobiałkowe",      es: "Alto en proteína", el: "Υψηλή πρωτεΐνη",        pt: "Rico em proteína" },
  "High fibre":    { pl: "Bogate w błonnik",    es: "Alto en fibra",    el: "Υψηλή ίνα",             pt: "Rico em fibra" },
  "Low carb":      { pl: "Niskowęglowodanowe",  es: "Bajo en carbos",   el: "Χαμηλοί υδατάνθρακες",  pt: "Baixo em hidratos" },
  "Low calorie":   { pl: "Niskokaloryczne",     es: "Bajo en calorías", el: "Χαμηλές θερμίδες",      pt: "Baixo em calorias" },
};

const OCCASION = {
  Solo:            { pl: "W pojedynkę", es: "Solo",            el: "Μόνος",          pt: "Sozinho" },
  "Family style":  { pl: "Rodzinnie",   es: "Estilo familiar", el: "Οικογενειακό",   pt: "Em família" },
  "Date night":    { pl: "Randka",      es: "Cita romántica",  el: "Ραντεβού",       pt: "Encontro romântico" },
};

const COURSE = {
  Breakfast:       { pl: "Śniadanie",   es: "Desayuno",       el: "Πρωινό",          pt: "Pequeno-almoço" },
  Lunch:           { pl: "Lunch",       es: "Almuerzo",       el: "Μεσημεριανό",     pt: "Almoço" },
  Dinner:          { pl: "Obiad",       es: "Cena",           el: "Δείπνο",          pt: "Jantar" },
  Sides:           { pl: "Dodatki",     es: "Guarniciones",   el: "Συνοδευτικά",     pt: "Acompanhamentos" },
  Appetizer:       { pl: "Przystawka",  es: "Entrada",        el: "Ορεκτικό",        pt: "Entrada" },
  Dessert:         { pl: "Deser",       es: "Postre",         el: "Επιδόρπιο",       pt: "Sobremesa" },
  Snack:           { pl: "Przekąska",   es: "Botana",         el: "Σνακ",            pt: "Lanche" },
};

// Origin: how a recipe came to live in the family book. The plain
// label is the EN string; the lookup helper swaps in the localised
// version when the lang matches.
const ORIGIN_LABEL = {
  heirloom:    "Heirloom",
  newToFamily: "New to the family",
  lab:         "Lab experiment",
};
const ORIGIN_TR = {
  Heirloom:              { pl: "Rodzinny",                es: "De herencia familiar",   el: "Οικογενειακή κληρονομιά",  pt: "De herança familiar" },
  "New to the family":   { pl: "Nowy w rodzinie",         es: "Nueva en la familia",    el: "Καινούργια στην οικογένεια", pt: "Nova na família" },
  "Lab experiment":      { pl: "Eksperyment z Laboratorium", es: "Experimento del Lab", el: "Πείραμα του Εργαστηρίου",  pt: "Experiência do Laboratório" },
};

const DIFFICULTY = {
  Easy:    { pl: "Łatwy",     es: "Fácil",        el: "Εύκολο",      pt: "Fácil" },
  Medium:  { pl: "Średni",    es: "Medio",        el: "Μέτριο",      pt: "Médio" },
  Hard:    { pl: "Trudny",    es: "Difícil",      el: "Δύσκολο",     pt: "Difícil" },
  Patient: { pl: "Cierpliwy", es: "Paciente",     el: "Υπομονετικό", pt: "Paciente" },
  Tricky:  { pl: "Trudny",    es: "Delicado",     el: "Δύσκολο",     pt: "Delicado" },
};

const PRECISION = {
  easy:    { pl: "łatwy",       es: "fácil",       el: "εύκολο",       pt: "fácil" },
  medium:  { pl: "średni",      es: "medio",       el: "μέτριο",       pt: "médio" },
  careful: { pl: "ostrożnie",   es: "con cuidado", el: "προσεκτικά",   pt: "com cuidado" },
  watch:   { pl: "uważnie",     es: "atento",      el: "με προσοχή",   pt: "atento" },
  patient: { pl: "cierpliwie",  es: "con paciencia", el: "με υπομονή", pt: "com paciência" },
};

// Generic lookup against the new { en-key: { lang: translation } } shape.
// English passes through unchanged; unknown values fall back to themselves.
function lookup(table, value, lang) {
  if (lang === "en") return value;
  const row = table[value];
  if (!row) return value;
  return row[lang] || value;
}

// Lang code → human label + locale string. Used by the language
// FAB to render names and by toLocaleDateString for proper
// weekday/date formatting.
export const LANG_META = {
  en:   { label: "English (Canadian)", locale: "en-CA" },
  enUS: { label: "English (American)", locale: "en-US" },
  pl:   { label: "Polski",             locale: "pl-PL" },
  es:   { label: "Español (México)",   locale: "es-MX" },
  el:   { label: "Ελληνικά",           locale: "el-GR" },
  pt:   { label: "Português",          locale: "pt-PT" },
  fil:  { label: "Filipino",           locale: "fil-PH" },
};
export const SUPPORTED_LANGS = Object.keys(LANG_META);

export function useLang() {
  const [lang, setLang] = useStorage("lang", "en");
  const t = (key) => S[key]?.[lang] || S[key]?.en || key;
  const tDiet      = (v) => lookup(DIET,       v, lang);
  const tOccasion  = (v) => lookup(OCCASION,   v, lang);
  const tCourse    = (v) => lookup(COURSE,     v, lang);
  const tDifficulty= (v) => lookup(DIFFICULTY, v, lang);
  const tPrecision = (v) => lookup(PRECISION,  v, lang);
  // Origin uses two tables: ORIGIN_LABEL maps the data key
  // ("heirloom") to the English label, then ORIGIN_TR translates
  // the English label to the active lang when needed.
  const tOrigin    = (v) => {
    const en = ORIGIN_LABEL[v] || v;
    return lookup(ORIGIN_TR, en, lang);
  };
  const locale = LANG_META[lang]?.locale || "en-US";
  return { lang, setLang, t, tDiet, tOccasion, tCourse, tDifficulty, tPrecision, tOrigin, locale };
}
