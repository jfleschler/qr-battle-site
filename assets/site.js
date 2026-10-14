// Builds the Codekin gallery, the habitat list and "happening now" from codekin.json, which is exported from the
// game itself (Tests/QRBattleAppTests/SiteExport.swift in the app repo), so the site can't drift from the game.

const base = document.currentScript?.src.replace(/assets\/site\.js.*$/, "") ?? "./";

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "text") node.textContent = value;
    else if (key === "style") for (const [name, style] of Object.entries(value)) node.style.setProperty(name, style);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function chip(elementInfo) {
  return element("span", { class: "chip", text: elementInfo.name, style: { "--tint": elementInfo.color } });
}

// The game's own event rules (Sources/QRBattleCore/Events.swift): weeks run Monday to Sunday in local time, and
// 1 January 1970 was a Thursday.
function currentEvents(data) {
  const now = new Date();
  const localSeconds = now.getTime() / 1000 - now.getTimezoneOffset() * 60;
  const day = Math.floor(localSeconds / 86400);
  const week = Math.floor((day + 3) / 7);
  const rotation = data.events.featuredRotation;
  const featured = rotation[((week % rotation.length) + rotation.length) % rotation.length];
  const surging = data.events.monthlyElements[now.getMonth()];
  return { featured, surging, month: now.toLocaleString("en", { month: "long" }) };
}

function showEvents(data, elements, habitats) {
  const events = currentEvents(data);
  const habitat = habitats.get(events.featured);
  const surge = elements.get(events.surging);
  if (!habitat || !surge) return;
  document.getElementById("event-week").textContent = habitat.name;
  document.getElementById("event-week-detail").textContent =
    "New codes of this kind pay double coins, and their Codekin are rarer and twice as often shiny.";
  document.getElementById("event-month-label").textContent = `All of ${events.month}`;
  const month = document.getElementById("event-month");
  month.textContent = `${surge.name} Codekin`;
  month.style.color = surge.color;
  document.querySelector(".events").hidden = false;
}

// Live events from the Codekin server, laid over the built-in calendar like the game does: one that changes the featured
// habitat or the month's element takes that slot, and the rest show on their own with the time they have left.
async function showLiveEvents(elements, habitats) {
  let events = [];
  try {
    const response = await fetch("https://api.playcodekin.com/public/events", { cache: "no-store" });
    if (!response.ok) return;
    const now = Date.now();
    events = (await response.json()).events.filter((event) =>
      new Date(event.startsAt).getTime() <= now && now < new Date(event.endsAt).getTime());
  } catch { return; }
  const left = (end) => {
    const hours = Math.max(1, Math.round((new Date(end).getTime() - Date.now()) / 3_600_000));
    return hours >= 48 ? `${Math.round(hours / 24)} days left` : `${hours} hours left`;
  };
  const row = document.querySelector(".event-row");
  for (const event of events) {
    if (event.featuredHabitat && habitats.get(event.featuredHabitat)) {
      document.getElementById("event-week").textContent = habitats.get(event.featuredHabitat).name;
    }
    if (event.surgingElement && elements.get(event.surgingElement)) {
      const surge = elements.get(event.surgingElement);
      const month = document.getElementById("event-month");
      month.textContent = `${surge.name} Codekin`;
      month.style.color = surge.color;
    }
    row.append(element("div", { class: "event live" }, [
      element("span", { class: "event-label", text: `Live · ${left(event.endsAt)}` }),
      element("strong", { text: event.title }),
      element("span", { text: event.detail }),
    ]));
  }
  if (events.length) document.querySelector(".events").hidden = false;
}

function showGallery(data, context) {
  const elements = context.elements;
  const gallery = document.getElementById("gallery");
  const filters = document.getElementById("filters");
  const dialog = document.getElementById("codekin-detail");
  document.getElementById("codekin-count").textContent = data.codekin.length;

  const cells = data.codekin.map((kin) => {
    const hidden = kin.rarity === "legendary" || kin.rarity === "mythic";
    const label = hidden ? (kin.rarity === "mythic" ? "Mythic" : "Legendary") : kin.name;
    const image = element("img", {
      src: `${base}assets/codekin/${kin.id}.webp`, alt: hidden ? `An unknown ${kin.rarity} Codekin` : kin.name,
      width: 160, height: 160, loading: "lazy", decoding: "async",
    });
    const button = element("button", { type: "button", class: hidden ? "kin secret" : "kin" }, [
      image,
      element("span", { class: "number", text: `#${String(kin.number).padStart(3, "0")}` }),
      element("span", { class: "name", text: hidden ? "???" : kin.name }),
      element("span", { class: "chips" }, hidden ? [element("span", { class: "chip rarity", text: label })]
        : kin.elements.map((id) => chip(elements.get(id)))),
    ]);
    button.addEventListener("click", () => openDetail(dialog, kin, context));
    const cell = element("li", {}, [button]);
    cell.dataset.elements = kin.elements.join(" ");
    return cell;
  });
  gallery.replaceChildren(...cells);

  // Neutral is only a move element: no Codekin is neutral.
  const options = [{ id: "all", name: "All", color: "var(--cyan)" }, ...data.elements.filter((info) => info.id !== "neutral")];
  const buttons = options.map((option) => {
    const button = element("button", { type: "button", class: "filter", "aria-pressed": option.id === "all" ? "true" : "false",
      style: { "--tint": option.color } }, [option.name]);
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-pressed", other === button ? "true" : "false");
      for (const cell of cells) {
        cell.hidden = option.id !== "all" && !cell.dataset.elements.split(" ").includes(option.id);
      }
    });
    return button;
  });
  filters.replaceChildren(...buttons);
}

function isSecret(kin) { return kin.rarity === "legendary" || kin.rarity === "mythic"; }

function section(title, children) {
  return element("section", { class: "detail-section" }, [element("h3", { text: title }), ...children]);
}

// The family, first form to last, each a button to its own page, with the level each evolves at between them.
function chainView(dialog, kin, context) {
  const family = (kin.chain ?? []).map((id) => context.kinById.get(id)).filter(Boolean);
  if (family.length < 2) return null;
  const steps = [];
  family.forEach((member, index) => {
    if (index > 0) {
      steps.push(element("span", { class: "chain-arrow", "aria-hidden": "true", text: `Lv ${family[index - 1].evolvesAt} →` }));
    }
    const button = element("button", { type: "button", class: member.id === kin.id ? "chain-kin current" : "chain-kin",
      "aria-label": member.id === kin.id ? `${member.name}, shown` : `Show ${member.name}` }, [
      element("img", { src: `${base}assets/codekin/${member.id}.webp`, alt: "", width: 72, height: 72, loading: "lazy" }),
      element("span", { text: member.name }),
    ]);
    if (member.id !== kin.id) button.addEventListener("click", () => openDetail(dialog, member, context));
    steps.push(button);
  });
  return section("Evolution", [element("div", { class: "chain" }, steps)]);
}

// The moves it learns as it levels, with each move's element, power and what it does.
function learnsetView(kin, context) {
  if (!kin.learnset?.length) return null;
  const rows = kin.learnset.map((entry) => {
    const move = context.moves.get(entry.move);
    if (!move) return null;
    return element("li", {}, [
      element("span", { class: "lv", text: entry.level <= 1 ? "Start" : `Lv ${entry.level}` }),
      element("span", { class: "move" }, [
        element("strong", { text: move.name }),
        element("small", { text: move.summary }),
      ]),
      chip(context.elements.get(move.element) ?? { name: move.element, color: "#9aaac4" }),
      element("span", { class: "power", text: move.power > 0 ? String(move.power) : "—", title: move.power > 0 ? "Power" : "Status move" }),
    ]);
  }).filter(Boolean);
  return section("Moves it learns", [element("ol", { class: "learnset" }, rows)]);
}

function openDetail(dialog, kin, context) {
  const hidden = isSecret(kin);
  const elements = context.elements;
  const image = dialog.querySelector("#detail-image");
  image.src = `${base}assets/codekin/${kin.id}.webp`;
  image.alt = hidden ? "" : kin.name;
  image.classList.toggle("secret", hidden);
  dialog.querySelector("#detail-number").textContent = `#${String(kin.number).padStart(3, "0")} · ${kin.rarity}`;
  dialog.querySelector("#detail-name").textContent = hidden ? "???" : kin.name;
  dialog.querySelector("#detail-elements").replaceChildren(...kin.elements.map((id) => chip(elements.get(id))));
  dialog.querySelector("#detail-flavor").textContent = hidden
    ? (kin.rumor ?? "Nobody has seen it yet.")
    : kin.flavor;
  dialog.querySelector("#detail-evolution").textContent = "";
  const more = [];
  if (!hidden) {
    const chain = chainView(dialog, kin, context);
    if (chain) more.push(chain);
    if (kin.habitats?.length) {
      more.push(section("Turns up at", [element("span", { class: "chips" },
        kin.habitats.map((id) => element("span", { class: "chip", text: context.habitats.get(id)?.name ?? id, style: { "--tint": "#9aaac4" } })))]));
    }
    const moves = learnsetView(kin, context);
    if (moves) more.push(moves);
  }
  dialog.querySelector("#detail-more").replaceChildren(...more);
  dialog.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
}

function showHabitats(data, elements) {
  const list = document.getElementById("habitat-list");
  list.replaceChildren(...data.habitats.map((habitat) => element("li", { class: "panel habitat" }, [
    element("h3", { text: habitat.name }),
    element("p", { text: habitat.lore }),
    element("span", { class: "chips" }, habitat.elements.length
      ? habitat.elements.map((id) => chip(elements.get(id)))
      : [element("span", { class: "chip", text: "Any element", style: { "--tint": "#9aaac4" } })]),
  ])));
}

async function start() {
  try {
    const response = await fetch(`${base}assets/codekin.json`);
    const data = await response.json();
    const elements = new Map(data.elements.map((info) => [info.id, info]));
    const habitats = new Map(data.habitats.map((info) => [info.id, info]));
    const context = {
      elements, habitats,
      moves: new Map((data.moves ?? []).map((move) => [move.id, move])),
      kinById: new Map(data.codekin.map((kin) => [kin.id, kin])),
    };
    showEvents(data, elements, habitats);
    showLiveEvents(elements, habitats);
    showGallery(data, context);
    showHabitats(data, elements);
  } catch (error) {
    document.getElementById("gallery").replaceChildren(element("li", { class: "section-lede", text: "The Codekin couldn't load. Try reloading the page." }));
  }
}

start();
