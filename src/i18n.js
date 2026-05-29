// UI translations. Recipe content (user-entered titles, ingredient
// names, step descriptions) stays in whatever language it was authored
// — we only translate the chrome around it. The user-facing toggle is
// the language FAB in the bottom-right.

import { useStorage } from "./helpers.jsx";

const S = {
  // ─── Top nav ───
  addRecipe:    { en: "Add recipe",       pl: "Dodaj przepis" },
  buildMeal:    { en: "Build a meal",     pl: "Złóż posiłek" },
  signIn:       { en: "Sign in",          pl: "Zaloguj się" },
  signOut:      { en: "Sign out",         pl: "Wyloguj się" },
  filters:      { en: "Filters",          pl: "Filtry" },
  accountMenu:  { en: "Account menu",     pl: "Menu konta" },
  switchToPL:   { en: "Switch to Polish", pl: "Przełącz na polski" },
  switchToEN:   { en: "Switch to English",pl: "Przełącz na angielski" },
  theLab:       { en: "The Lab",          pl: "Laboratorium" },
  kitchenExp:   { en: "Kitchen experimentation", pl: "Eksperymenty kuchenne" },
  searchPlaceholder: {
    en: "Search by recipe, cook, cuisine, or ingredient…",
    pl: "Szukaj przepisu, kucharza, kuchni lub składnika…",
  },

  // ─── Home / browse ───
  filteringBy:    { en: "Filtering by",       pl: "Filtrowanie według" },
  clearAll:       { en: "Clear all",          pl: "Wyczyść wszystko" },
  browseByCourse: { en: "Browse by course",   pl: "Przeglądaj według dania" },
  occasion:       { en: "Occasion",           pl: "Okazja" },
  originLbl:      { en: "Origin",             pl: "Pochodzenie" },
  noneLabel:      { en: "None",               pl: "Brak" },
  resetSeed:      { en: "Reset to original",  pl: "Przywróć oryginał" },
  resetSeedHint:  { en: "Restore this recipe to the original copy shipped with the app", pl: "Przywróć ten przepis do oryginalnej wersji" },
  resetSeedConfirm:{ en: "Reset this recipe to the original? Your edits will be lost; comments and favourites stay.", pl: "Przywrócić ten przepis do oryginału? Twoje edycje zostaną utracone; komentarze i ulubione pozostają." },
  familyFavorites:{ en: "Family favorites",   pl: "Ulubione rodziny" },
  familyFavoritesSub: { en: "The ones we keep coming back for", pl: "Te, do których ciągle wracamy" },
  deeperShelves:  { en: "The deeper shelves", pl: "Z głębi szafki" },
  everythingElse: { en: "Everything else",    pl: "Wszystko inne" },
  searchResults:  { en: "Search results",     pl: "Wyniki wyszukiwania" },
  noResultsTryAgain: { en: "Try fewer filters, or", pl: "Spróbuj z mniejszą liczbą filtrów lub" },
  addThisRecipeYourself: { en: "add this recipe yourself", pl: "dodaj ten przepis samodzielnie" },
  noResults:      { en: "No recipes match.",  pl: "Brak przepisów pasujących." },

  // ─── Filters drawer ───
  filterTheCookbook: { en: "Filter the cookbook", pl: "Filtruj książkę kucharską" },
  showResults:    { en: "Show results",       pl: "Pokaż wyniki" },
  course:         { en: "Course",             pl: "Danie" },
  timeFromStartToFinish: { en: "Time from start to finish", pl: "Czas od początku do końca" },
  difficulty:     { en: "Difficulty",         pl: "Trudność" },
  allergiesAndPreferences: { en: "Allergies & preferences", pl: "Alergie i preferencje" },
  cuisine:        { en: "Cuisine",            pl: "Kuchnia" },
  createdBy:      { en: "Created by",         pl: "Autor" },
  anyTime:        { en: "Any time",           pl: "Dowolny czas" },
  under30:        { en: "Under 30 min",       pl: "Poniżej 30 min" },
  under60:        { en: "Under 1 hour",       pl: "Poniżej godziny" },
  under2h:        { en: "Under 2 hours",      pl: "Poniżej 2 godzin" },

  // ─── Recipe page chrome ───
  back:           { en: "Back",               pl: "Wstecz" },
  backToCookbook: { en: "Back to cookbook",   pl: "Powrót do książki kucharskiej" },
  startCooking:   { en: "Start cooking",      pl: "Zacznij gotować" },
  shoppingList:   { en: "Shopping list",      pl: "Lista zakupów" },
  addToShoppingList: { en: "Add to shopping list", pl: "Dodaj do listy zakupów" },
  print:          { en: "Print",              pl: "Drukuj" },
  pdf:            { en: "PDF",                pl: "PDF" },
  edit:           { en: "Edit",               pl: "Edytuj" },
  delete:         { en: "Delete",             pl: "Usuń" },
  cancel:         { en: "Cancel",             pl: "Anuluj" },
  save:           { en: "Save",               pl: "Zapisz" },
  saveChanges:    { en: "Save changes",       pl: "Zapisz zmiany" },
  saveRecipe:     { en: "Save recipe",        pl: "Zapisz przepis" },
  prep:           { en: "Prep",               pl: "Przygotowanie" },
  cook:           { en: "Cook",               pl: "Gotowanie" },
  total:          { en: "Total",              pl: "Razem" },
  servings:       { en: "Servings",           pl: "Porcje" },
  fewerServings:  { en: "Fewer servings",     pl: "Mniej porcji" },
  moreServings:   { en: "More porcji",        pl: "Więcej porcji" },
  units:          { en: "Units",              pl: "Jednostki" },
  ingredients:    { en: "Ingredients",        pl: "Składniki" },
  steps:          { en: "Steps",              pl: "Kroki" },
  cooksNotes:     { en: "Cook's notes",       pl: "Notatki kucharza" },
  notesInMargin:  { en: "Notes in the margin",pl: "Notatki na marginesie" },
  goesGreatWith:  { en: "Goes great with",    pl: "Świetnie pasuje z" },
  showNutrition:  { en: "Show nutrition per serving", pl: "Pokaż wartości odżywcze na porcję" },
  hideNutrition:  { en: "Hide nutrition",     pl: "Ukryj wartości odżywcze" },
  nutritionRough: { en: "Rough estimates — for precise tracking, edit the values yourself.", pl: "Wartości przybliżone — dla dokładnych pomiarów edytuj je samodzielnie." },
  iWantThisDoneBy:{ en: "I want this done by",pl: "Chcę żeby było gotowe na" },
  startAt:        { en: "Start at",           pl: "Zacznij o" },
  doneAt:         { en: "Done at",            pl: "Gotowe o" },
  doneBy:         { en: "Done by",            pl: "Gotowe na" },
  takes:          { en: "Takes",              pl: "Trwa" },
  handsOn:        { en: "Hands-on",           pl: "Czas pracy" },
  parkOvernight:  { en: "park overnight",     pl: "zostaw na noc" },
  itemsGrouped:   { en: "items, grouped by section", pl: "elementów, w sekcjach" },
  startMinEarlier:{ en: "Start 5 min earlier",pl: "Zacznij 5 min wcześniej" },
  startMinLater:  { en: "Start 5 min later",  pl: "Zacznij 5 min później" },
  decreaseUnit:   { en: "Decrease",           pl: "Zmniejsz" },
  increaseUnit:   { en: "Increase",           pl: "Zwiększ" },
  dismiss:        { en: "Dismiss",            pl: "Zamknij" },
  close:          { en: "Close",              pl: "Zamknij" },
  removeFromFavorites: { en: "Remove from favorites", pl: "Usuń z ulubionych" },
  addToFavorites: { en: "Add to favorites",   pl: "Dodaj do ulubionych" },
  signInToFavorites: { en: "Sign in to save favorites.", pl: "Zaloguj się, aby zapisać ulubione." },

  // ─── Comments ───
  oneNote:        { en: "note",               pl: "notatka" },
  manyNotes:      { en: "notes",              pl: "notatki" },
  leaveANote:     { en: "Leave a note",       pl: "Zostaw notatkę" },
  postNote:       { en: "Post note",          pl: "Opublikuj notatkę" },
  posting:        { en: "Posting…",           pl: "Publikowanie…" },
  yourName:       { en: "Your name",          pl: "Twoje imię" },
  commentPlaceholder: {
    en: "What did you change? What did the kids say? What would your grandma do?",
    pl: "Co zmieniłeś? Co powiedziały dzieci? Co zrobiłaby Twoja babcia?",
  },
  ratingOptional: { en: "Rating (optional):", pl: "Ocena (opcjonalnie):" },
  addPhoto:       { en: "Add photo",          pl: "Dodaj zdjęcie" },
  photoAttached:  { en: "Photo attached",     pl: "Zdjęcie dołączone" },
  uploading:      { en: "Uploading…",         pl: "Wysyłanie…" },
  removePhoto:    { en: "Remove photo",       pl: "Usuń zdjęcie" },
  deleteYourNote: { en: "Delete your note",   pl: "Usuń notatkę" },
  signInToLeaveNote: { en: "Sign in to leave a note.", pl: "Zaloguj się, aby zostawić notatkę." },

  // ─── Meal plan ───
  planYourMeal:   { en: "Plan your meal",     pl: "Zaplanuj posiłek" },
  planSubtitle:   {
    en: "we'll back-time the schedule so everything lands at once.",
    pl: "rozplanujemy harmonogram, żeby wszystko było gotowe naraz.",
  },
  recipe:         { en: "recipe",             pl: "przepis" },
  recipes:        { en: "recipes",            pl: "przepisy" },
  date:           { en: "Date",               pl: "Data" },
  time:           { en: "Time",               pl: "Czas" },
  orPickAPreset:  { en: "Or pick a preset",   pl: "Lub wybierz gotowy" },
  lunchToday:     { en: "Lunch today",        pl: "Lunch dziś" },
  dinnerToday:    { en: "Dinner today",       pl: "Obiad dziś" },
  lateDinner:     { en: "Late dinner",        pl: "Późny obiad" },
  tomorrow:       { en: "Tomorrow",           pl: "Jutro" },
  saturday:       { en: "Saturday",           pl: "Sobota" },
  onTheMenu:      { en: "On the menu",        pl: "W menu" },
  youllStartAt:   { en: "You'll start at",    pl: "Zaczynasz o" },
  andEatAt:       { en: "And eat at",         pl: "I jesz o" },
  buildSchedule:  { en: "Build the schedule", pl: "Zbuduj harmonogram" },
  aiStaggers:     {
    en: "AI staggers prep so nothing gets cold.",
    pl: "AI rozplanuje przygotowania, żeby nic nie wystygło.",
  },
  needsHeadStart: { en: "Needs a head start the night before", pl: "Wymaga przygotowania poprzedniego wieczoru" },
  overnightExplain: {
    en: "has an overnight step (chilling, proofing, freezing). Instead of waking up at",
    pl: "ma krok nocny (chłodzenie, rośnięcie, mrożenie). Zamiast wstawać o",
  },
  theDayOf:       { en: "the day of, we'll start the night-before prep at:", pl: "w dniu gotowania, zaczniemy przygotowanie wieczorem o:" },
  theDayBefore:   { en: "the day before",     pl: "dzień wcześniej" },
  dayBefore:      { en: "the day before",     pl: "dzień wcześniej" },
  dayOf:          { en: "day of",             pl: "dzień gotowania" },
  tonightsPlan:   { en: "Tonight's plan",     pl: "Plan na dziś" },
  allReadyBy:     { en: "All ready by",       pl: "Wszystko gotowe na" },
  dish:           { en: "dish",               pl: "danie" },
  dishes:         { en: "dishes",             pl: "dania" },
  aboutXOfCooking:{ en: "of cooking",         pl: "gotowania" },
  staggeredSo:    { en: "staggered so everything lands at", pl: "rozłożone tak, żeby wszystko było gotowe na" },
  starts:         { en: "starts",             pl: "zaczyna o" },
  combinedTimeline:{ en: "Combined timeline", pl: "Wspólny harmonogram" },
  reviewMeal:     { en: "Review meal",        pl: "Sprawdź posiłek" },
  recipesOnMenu:  { en: "recipes on the menu",pl: "przepisów w menu" },
  recipeOnMenu:   { en: "recipe on the menu", pl: "przepis w menu" },
  untilYourNextStep: { en: "until your next step.", pl: "do następnego kroku." },
  takeABreak:     { en: "Take a break.",      pl: "Zrób przerwę." },

  // ─── Cook mode ───
  exit:           { en: "Exit",               pl: "Wyjdź" },
  timeline:       { en: "Timeline",           pl: "Harmonogram" },
  ingredientsOnHand: { en: "Ingredients on hand", pl: "Składniki pod ręką" },
  step:           { en: "Step",               pl: "Krok" },
  of:             { en: "of",                 pl: "z" },
  editToShift:    { en: "Edit to shift the rest of the timeline", pl: "Edytuj, aby przesunąć resztę harmonogramu" },
  reset:          { en: "Reset",              pl: "Resetuj" },
  resetAllAdjustments: { en: "Reset all timing adjustments?", pl: "Zresetować wszystkie korekty czasu?" },
  complete:       { en: "complete · press",   pl: "ukończonych · naciśnij" },
  toMarkAsDone:   { en: "to mark as done",    pl: "aby oznaczyć jako gotowe" },

  // ─── Shopping list ───
  shoppingFor:    { en: "Shopping for",       pl: "Lista zakupów na" },
  markBought:     { en: "Tap to mark in your pantry", pl: "Dotknij, aby zaznaczyć w spiżarni" },
  haveOnHand:     { en: "Already have",       pl: "Już mam" },
  toBuy:          { en: "Need to buy",        pl: "Do kupienia" },

  // ─── Counts / units ───
  servingsLong:   { en: "servings",           pl: "porcji" },
  itemsLong:      { en: "items",              pl: "elementów" },

  // ─── Polite UI bits ───
  loading:        { en: "Loading…",           pl: "Ładowanie…" },
  saving:         { en: "Saving…",            pl: "Zapisywanie…" },
  notSignedIn:    { en: "not signed in",      pl: "niezalogowany" },

  // ─── "by X" on recipe cards / header ───
  by:             { en: "by",                 pl: "od" },
  aRecipeFrom:    { en: "A recipe from",      pl: "Przepis od" },

  // ─── Add / edit recipe form ───
  editing:        { en: "Editing",            pl: "Edytuję" },
  newEntry:       { en: "New entry",          pl: "Nowy wpis" },
  addRecipeToCookbook: { en: "Add a recipe to the cookbook", pl: "Dodaj przepis do książki kucharskiej" },
  editRecipeTitle:{ en: "Edit recipe",        pl: "Edytuj przepis" },
  titleRequired:  { en: "Title *",            pl: "Tytuł *" },
  oneLineSubLbl:  { en: "One-line subtitle",  pl: "Jednoliniowy podtytuł" },
  addedByLbl:     { en: "Added by",           pl: "Dodał(a)" },
  sourceLinkLbl:  { en: "Source link",        pl: "Link źródłowy" },
  sourceLinkPh:   { en: "https://example.com/recipe (optional)", pl: "https://przyklad.pl/przepis (opcjonalne)" },
  linkLabelPh:    { en: "Link label",         pl: "Nazwa linku" },
  courseSlashCuisine: { en: "Course / Cuisine", pl: "Danie / Kuchnia" },
  dietPrefsLbl:   { en: "Diet / preferences", pl: "Dieta / preferencje" },
  prepCookMin:    { en: "Prep / Cook time (min)", pl: "Czas przygotowania / gotowania (min)" },
  prepPh:         { en: "Prep",               pl: "Przygotowanie" },
  cookPh:         { en: "Cook",               pl: "Gotowanie" },
  servingsDefaultLbl: { en: "Servings (default)", pl: "Porcje (domyślne)" },
  difficultyLbl:  { en: "Difficulty",         pl: "Trudność" },
  nutritionPerServing: { en: "Nutrition (per serving)", pl: "Wartości odżywcze (na porcję)" },
  calories:       { en: "Calories",           pl: "Kalorie" },
  proteinG:       { en: "Protein (g)",        pl: "Białko (g)" },
  carbsG:         { en: "Carbs (g)",          pl: "Węglowodany (g)" },
  fatG:           { en: "Fat (g)",            pl: "Tłuszcz (g)" },
  fiberG:         { en: "Fiber (g)",          pl: "Błonnik (g)" },
  sodiumMg:       { en: "Sodium (mg)",        pl: "Sód (mg)" },
  cooksNotesTipsLbl: { en: "Cook's notes / tips", pl: "Notatki kucharza / wskazówki" },
  addTip:         { en: "Add tip",            pl: "Dodaj wskazówkę" },
  exampleTip:     {
    en: "e.g. Pull from the fridge 2 hours before cooking.",
    pl: "np. Wyjmij z lodówki 2 godziny przed gotowaniem.",
  },
  heroPhotoLbl:   { en: "Hero photo",         pl: "Główne zdjęcie" },
  uploadPhoto:    { en: "Upload photo",       pl: "Wgraj zdjęcie" },
  aiGenerateFromTitle: { en: "AI-generate from title", pl: "Wygeneruj z tytułu (AI)" },
  aiGenerateHint:      { en: "Generate a hero photo from the title in the family-cookbook style", pl: "Wygeneruj zdjęcie z tytułu w stylu rodzinnej książki kucharskiej" },
  aiGenerateNeedsTitle:{ en: "Add a title first so the AI knows what to draw.", pl: "Najpierw dodaj tytuł, żeby AI wiedziało, co narysować." },
  generating:          { en: "Generating…",            pl: "Generuję…" },
  estimateWithAI:      { en: "Estimate with AI",       pl: "Oszacuj z AI" },
  estimating:          { en: "Estimating…",            pl: "Szacuję…" },
  estimateNutritionHint:{ en: "Rough per-serving estimate based on the ingredient list", pl: "Przybliżone oszacowanie na porcję na podstawie listy składników" },
  nutritionNeedsIngredients: { en: "Add some ingredients first.", pl: "Najpierw dodaj składniki." },

  // Mode tabs
  pasteAndAi:     { en: "Type it in",         pl: "Wpisz przepis" },
  manualEntry:    { en: "Manual entry",       pl: "Wpis ręczny" },
  photoOfCookbook:{ en: "Upload photo",       pl: "Wgraj zdjęcie" },
  linkToUrl:      { en: "Link to a URL",      pl: "Link do strony" },

  // Mode panels
  aiExtraction:   { en: "AI extraction",      pl: "Ekstrakcja AI" },
  extractRecipe:  { en: "Extract recipe",     pl: "Wyciągnij przepis" },
  extracting:     { en: "Extracting…",        pl: "Przetwarzanie…" },
  aiPasteHelper:  {
    en: "You'll review every field before saving. AI fills in missing details — never replaces yours.",
    pl: "Przed zapisem sprawdzisz każde pole. AI uzupełnia brakujące — nigdy nie nadpisuje Twojego.",
  },
  aiPastePlaceholder: {
    en: "Paste anything — a recipe email from your mom, a copy/paste from a blog, a screenshot of a cookbook page. We'll pull out the title, ingredients, steps, and timing, then let you review and tidy up before saving.",
    pl: "Wklej cokolwiek — e-mail z przepisem od mamy, kopię z bloga, zrzut z książki kucharskiej. Wyciągniemy tytuł, składniki, kroki i czasy, a Ty sprawdzisz i poprawisz przed zapisem.",
  },
  snapPhotoOfCookbook: { en: "Snap a photo of a cookbook page", pl: "Zrób zdjęcie strony książki kucharskiej" },
  takePhotoHelper:{
    en: "Take a photo (or pick from camera roll). AI will read the page and pull out the recipe.",
    pl: "Zrób zdjęcie (lub wybierz z galerii). AI odczyta stronę i wyciągnie przepis.",
  },
  uploadImage:    { en: "Upload an image",    pl: "Wgraj zdjęcie" },
  takePhoto:      { en: "Take photo",         pl: "Zrób zdjęcie" },
  pageN:          { en: "Page {n}",           pl: "Strona {n}" },
  removePage:     { en: "Remove page",        pl: "Usuń stronę" },
  extractRecipeN: { en: "Extract recipe ({n})", pl: "Wyciągnij przepis ({n})" },
  originalRecipeImages: { en: "Original recipe card images", pl: "Oryginalne zdjęcia przepisu" },
  showOnRecipePage:    { en: "Show on the recipe page",      pl: "Pokaż na stronie przepisu" },
  originalImagesHint:  {
    en: "Adds a small button to the hero photo. Tap to see the originals — handy for handwritten cards from family.",
    pl: "Dodaje mały przycisk na zdjęciu głównym. Kliknij, aby zobaczyć oryginały — przydatne dla odręcznych kart od rodziny.",
  },
  viewOriginal:        { en: "View original",  pl: "Oryginał" },
  viewOriginalRecipe:  { en: "View the original recipe images", pl: "Zobacz oryginalne zdjęcia przepisu" },
  tapToClose:          { en: "Tap anywhere to close", pl: "Kliknij gdziekolwiek, aby zamknąć" },
  multiPagePhotoHelper: {
    en: "Add up to 6 photos — front + back of a recipe card, or both pages of a cookbook spread. Drag-and-drop works on desktop. You'll review every field before saving.",
    pl: "Dodaj do 6 zdjęć — przód i tył karty z przepisem albo obie strony rozkładówki książki. Na komputerze możesz upuszczać pliki na pole. Sprawdzisz każde pole przed zapisem.",
  },
  pasteUrlHere:   { en: "Paste a recipe URL", pl: "Wklej link do przepisu" },
  fetchAndParse:  { en: "Fetch & parse",      pl: "Pobierz i przetwórz" },
  fetchUrlHelper: {
    en: "Works for most blogs and recipe sites. We'll grab the recipe and let you review.",
    pl: "Działa dla większości blogów. Pobierzemy przepis i pozwolimy Ci go sprawdzić.",
  },
  aiFillMissing:  { en: "AI fill missing details", pl: "AI uzupełni brakujące" },

  // Save / cancel / delete in form
  saveToCookbook: { en: "Save to cookbook",   pl: "Zapisz w książce" },
  deleteThisRecipe: { en: "Delete this recipe", pl: "Usuń ten przepis" },
  signInToSaveRecipes: { en: "Sign in to save recipes to the cookbook.", pl: "Zaloguj się, aby zapisywać przepisy." },
  signInArrow:    { en: "Sign in →",          pl: "Zaloguj się →" },
  fillFormFirst:  {
    en: "You can fill in the form first; sign-in returns you here.",
    pl: "Możesz najpierw wypełnić formularz; zalogowanie wróci Cię tutaj.",
  },

  // Section / step editor
  overnightStep:  { en: "Overnight step?",    pl: "Krok nocny?" },
  recipeHasOvernight: {
    en: "Recipe has an overnight rest (fridge, proof, freeze, marinate)",
    pl: "Przepis ma odpoczynek nocny (lodówka, wyrastanie, mrożenie, marynowanie)",
  },
  overnightHint:  {
    en: "Adds a \"The day before\" step at the top and groups the rest under \"Cooking day\". The scheduler will then plan the overnight step for the night before instead of pre-dawn the day of.",
    pl: "Dodaje krok „Dzień wcześniej” na górze i grupuje resztę w „Dniu gotowania”. Harmonogram zaplanuje wtedy krok nocny na poprzedni wieczór zamiast wczesnego rana.",
  },
  addSection:     { en: "Add section",        pl: "Dodaj sekcję" },
  addStep:        { en: "Add step",           pl: "Dodaj krok" },
  addIngredient:  { en: "Add ingredient",     pl: "Dodaj składnik" },
  moveUp:         { en: "Move up",            pl: "Przesuń w górę" },
  moveDown:       { en: "Move down",          pl: "Przesuń w dół" },
  deleteSection:  { en: "Delete section",     pl: "Usuń sekcję" },
  sectionName:    { en: "Section name",       pl: "Nazwa sekcji" },
  stepPlaceholder:{ en: "What happens in this step", pl: "Co się dzieje w tym kroku" },
  qtyPh:          { en: "Qty",                pl: "Ilość" },
  unitPh:         { en: "Unit",               pl: "Jedn." },
  ingredientPh:   { en: "e.g. ground beef",   pl: "np. mielona wołowina" },
  cuisinePh:      { en: "Cuisine (e.g. Italian)", pl: "Kuchnia (np. włoska)" },
  titleEx:        { en: "e.g. Grandma's Sunday Lasagna", pl: "np. Niedzielna lasagna babci" },
  subtitleEx:     { en: "A tagline, the family lore", pl: "Hasło, rodzinna legenda" },
  hrs:            { en: "hrs",                pl: "godz" },
  mins:           { en: "mins",               pl: "min" },

  // ─── Meal plan modal & page ───
  staggerSubtitle:{
    en: "we'll back-time the schedule so everything lands at once.",
    pl: "rozplanujemy harmonogram, żeby wszystko było gotowe naraz.",
  },
  needsHeadStartTitle: { en: "Needs a head start the night before", pl: "Wymaga rozpoczęcia poprzedniego wieczoru" },
  overnightSentenceMid: { en: "an overnight step (chilling, proofing, freezing). Instead of waking up at", pl: "krok nocny (chłodzenie, wyrastanie, mrożenie). Zamiast wstawać o" },
  overnightSentenceEnd: { en: "the day of, we'll start the night-before prep at:", pl: "w dniu gotowania, zaczniemy przygotowanie wieczorem o:" },
  has:            { en: "has",                pl: "ma" },
  have:           { en: "have",               pl: "mają" },
  startingThe:    { en: "the day before",     pl: "poprzedniego dnia" },
  // Already exists: youllStartAt, andEatAt, buildSchedule, planYourMeal, etc.

  // Tweaks panel
  tweaks:         { en: "Tweaks",             pl: "Ustawienia" },

  // Shopping list
  toBuyShort:     { en: "to buy",             pl: "do kupienia" },
  onHand:         { en: "on hand",            pl: "na półce" },
  tapToMark:      { en: "Tap to mark what's already in your pantry.", pl: "Dotknij, aby oznaczyć, co już masz w spiżarni." },
  copyNeeded:     { en: "Copy needed",        pl: "Skopiuj do kupienia" },
  download:       { en: "Download",           pl: "Pobierz" },
  done:           { en: "Done",               pl: "Gotowe" },
  copiedToClipboard: { en: "Copied the still-needed items to your clipboard.", pl: "Skopiowano potrzebne pozycje do schowka." },
  nothingToShopFor: { en: "Nothing to shop for yet. Open a recipe and tap \"Shopping list.\"", pl: "Jeszcze nic do kupienia. Otwórz przepis i dotknij „Lista zakupów”." },
};

// Lookup tables for data-driven values that come from canonical
// English in src/data.js — diet preferences, occasions, course names,
// step precision. `t()` only handles UI keys above; these helpers
// translate values that flow through the React tree.
const DIET = {
  "Gluten-free":   "Bezglutenowe",
  "Dairy-free":    "Bez nabiału",
  "Nut-free":      "Bez orzechów",
  "Soy-free":      "Bez soi",
  Vegan:           "Wegańskie",
  Vegetarian:      "Wegetariańskie",
  Pescatarian:     "Pescatariańskie",
  Carnivore:       "Mięsożerne",
  "High protein":  "Wysokobiałkowe",
  "High fibre":    "Bogate w błonnik",
  "Low carb":      "Niskowęglowodanowe",
  "Low calorie":   "Niskokaloryczne",
};

const OCCASION = {
  Solo:            "W pojedynkę",
  "Family style":  "Rodzinnie",
  "Date night":    "Randka",
};

const COURSE = {
  Breakfast:       "Śniadanie",
  Lunch:           "Lunch",
  Dinner:          "Obiad",
  Sides:           "Dodatki",
  Appetizer:       "Przystawka",
  Dessert:         "Deser",
  Snack:           "Przekąska",
};

// Origin: how a recipe came to live in the family book. The plain
// label is the EN string; the lookup helper swaps in Polish only
// when lang === "pl".
const ORIGIN_LABEL = {
  heirloom:    "Heirloom",
  newToFamily: "New to the family",
  lab:         "Lab experiment",
};
const ORIGIN_PL = {
  Heirloom:              "Rodzinny",
  "New to the family":   "Nowy w rodzinie",
  "Lab experiment":      "Eksperyment z Laboratorium",
};

const DIFFICULTY = {
  Easy:    "Łatwy",
  Medium:  "Średni",
  Hard:    "Trudny",
  Patient: "Cierpliwy",
  Tricky:  "Trudny",
};

const PRECISION = {
  easy:    "łatwy",
  medium:  "średni",
  careful: "ostrożnie",
  watch:   "uważnie",
  patient: "cierpliwie",
};

function lookup(table, value, lang) {
  if (lang !== "pl") return value;
  return table[value] || value;
}

export function useLang() {
  const [lang, setLang] = useStorage("lang", "en");
  const t = (key) => S[key]?.[lang] || S[key]?.en || key;
  const tDiet      = (v) => lookup(DIET,       v, lang);
  const tOccasion  = (v) => lookup(OCCASION,   v, lang);
  const tCourse    = (v) => lookup(COURSE,     v, lang);
  const tDifficulty= (v) => lookup(DIFFICULTY, v, lang);
  const tPrecision = (v) => lookup(PRECISION,  v, lang);
  // Origin uses two tables: ORIGIN_LABEL maps the data key
  // ("heirloom") to the English label, then ORIGIN_PL translates
  // the English label to Polish when needed.
  const tOrigin    = (v) => {
    const en = ORIGIN_LABEL[v] || v;
    return lang === "pl" ? (ORIGIN_PL[en] || en) : en;
  };
  // Pass through to toLocaleDateString so weekday names ("Friday") and
  // date formats ("May 28, 2026") follow the chosen language.
  const locale = lang === "pl" ? "pl-PL" : "en-US";
  return { lang, setLang, t, tDiet, tOccasion, tCourse, tDifficulty, tPrecision, tOrigin, locale };
}
