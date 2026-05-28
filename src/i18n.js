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
  Appetizer:       "Przystawka",
  Dessert:         "Deser",
  Snack:           "Przekąska",
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
  // Pass through to toLocaleDateString so weekday names ("Friday") and
  // date formats ("May 28, 2026") follow the chosen language.
  const locale = lang === "pl" ? "pl-PL" : "en-US";
  return { lang, setLang, t, tDiet, tOccasion, tCourse, tDifficulty, tPrecision, locale };
}
