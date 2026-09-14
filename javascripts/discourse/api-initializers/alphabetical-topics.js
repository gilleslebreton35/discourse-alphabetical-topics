import { withPluginApi } from "discourse/lib/plugin-api";

const MAX_DOC_PAGES = 12;
let docLoadRun = 0;
let docSortObservers = new Map();

async function loadAllDocTopics(api) {
  const run = ++docLoadRun;
  const list = api.container.lookup("controller:discovery/latest")?.model;
  if (!list?.loadMore) {
    return;
  }

  for (let page = 0; page < MAX_DOC_PAGES; page++) {
    if (!list.more_topics_url) {
      return;
    }

    const before = list.topics?.length ?? 0;
    await list.loadMore();

    if (run !== docLoadRun || (list.topics?.length ?? 0) === before) {
      return;
    }
  }
}

function docSortLocale() {
  const lang = document.documentElement.lang;
  if (!lang) {
    return undefined;
  }

  try {
    Intl.getCanonicalLocales(lang);
    return lang;
  } catch {
    return undefined;
  }
}

function sortDocTopicList(body, locale) {
  const rows = [...body.querySelectorAll(":scope > .topic-list-item")];
  if (rows.length < 2) {
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    const titleA = a.querySelector(".title")?.textContent.trim() ?? "";
    const titleB = b.querySelector(".title")?.textContent.trim() ?? "";
    return titleA.localeCompare(titleB, locale);
  });

  if (sorted.every((row, i) => rows[i] === row)) {
    return;
  }

  const anchor = rows[rows.length - 1].nextSibling;
  const pinned = rows.find((row) => row.getBoundingClientRect().bottom > 0);
  const pinnedTop = pinned?.getBoundingClientRect().top;

  const observer = docSortObservers.get(body);
  observer?.disconnect();
  sorted.forEach((row) => body.insertBefore(row, anchor));
  observer?.observe(body, { childList: true });

  if (pinned) {
    window.scrollBy(0, pinned.getBoundingClientRect().top - pinnedTop);
  }
}

function sortDocCategoryTopicLists() {
  docSortObservers.forEach((observer) => observer.disconnect());
  docSortObservers = new Map();

  const locale = docSortLocale();

  document.querySelectorAll(".topic-list .topic-list-body").forEach((body) => {
    try {
      sortDocTopicList(body, locale);
    } finally {
      body.classList.add("docs-sorted");
    }

    let settleTimer = null;
    const observer = new MutationObserver(() => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        sortDocTopicList(body, locale);
      }, 400);
    });
    observer.observe(body, { childList: true });
    docSortObservers.set(body, observer);
  });
}

export default {
  name: "alphabetical-topics",
  initialize(container) {
    withPluginApi("1.8.0", (api) => {
      api.onPageChange(() => {
        const router = container.lookup("service:router");
        const route = router.currentRoute;

        // Vérification du contexte de la route (catégorie)
        if (route?.name?.startsWith("discovery.category")) {
          const category = route.attributes?.category;
          
          // Récupère la liste des catégories depuis les paramètres
          const targetCategories = (settings.alphabetical_categories || "")
            .split("|")
            .map((val) => val.trim().toLowerCase())
            .filter(Boolean);

          // Vérifie si la catégorie actuelle correspond à un ID ou un slug (nom) de la liste
          if (
            category && 
            (targetCategories.includes(String(category.id)) || 
             targetCategories.includes(category.slug.toLowerCase()))
          ) {
            loadAllDocTopics(api).then(() => {
              sortDocCategoryTopicLists();
            });
          }
        }
      });
    });
  },
};
