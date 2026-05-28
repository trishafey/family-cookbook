// Minimal UI translations. Recipe content (titles, ingredients,
// instructions) stays in whatever language it was entered — we only
// translate the chrome around it. Most pages render in English; the
// Polish strings cover the most-visible buttons and headings so the
// flag toggle is meaningful.

import { useStorage } from "./helpers.jsx";

const STRINGS = {
  // top nav / global
  addRecipe:    { en: "Add recipe",      pl: "Dodaj przepis" },
  buildMeal:    { en: "Build a meal",    pl: "Złóż posiłek" },
  signIn:       { en: "Sign in",         pl: "Zaloguj się" },
  signOut:      { en: "Sign out",        pl: "Wyloguj się" },
  searchPlaceholder: { en: "Search by recipe, cook, cuisine, or ingredient…", pl: "Szukaj przepisu, kucharza, kuchni lub składnika…" },
  switchTo:     { en: "Switch to Polish", pl: "Przełącz na angielski" },

  // recipe page
  ingredients:  { en: "Ingredients",     pl: "Składniki" },
  steps:        { en: "Steps",           pl: "Kroki" },
  startCooking: { en: "Start cooking",   pl: "Zacznij gotować" },
  shoppingList: { en: "Shopping list",   pl: "Lista zakupów" },
  print:        { en: "Print",           pl: "Drukuj" },
  edit:         { en: "Edit",            pl: "Edytuj" },
  delete:       { en: "Delete",          pl: "Usuń" },
  prep:         { en: "Prep",            pl: "Przygotowanie" },
  cook:         { en: "Cook",            pl: "Gotowanie" },
  total:        { en: "Total",           pl: "Razem" },
  servings:     { en: "Servings",        pl: "Porcje" },
  notesInMargin:{ en: "Notes in the margin", pl: "Notatki na marginesie" },
  leaveNote:    { en: "Leave a note",    pl: "Zostaw notatkę" },
  imperial:     { en: "US",              pl: "US" },
  metric:       { en: "Metric",          pl: "Metryczne" },
};

export function useLang() {
  const [lang, setLang] = useStorage("lang", "en");
  const t = (key) => STRINGS[key]?.[lang] || STRINGS[key]?.en || key;
  return [lang, setLang, t];
}
