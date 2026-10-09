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

function showGallery(data, elements) {
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
    button.addEventListener("click", () => openDetail(dialog, kin, hidden, elements));
    const cell = element("li", {}, [button]);
    cell.dataset.elements = kin.elements.join(" ");
    return cell;
  });
  gallery.replaceChildren(...cells);

  const options = [{ id: "all", name: "All", color: "var(--cyan)" }, ...data.elements];
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

function openDetail(dialog, kin, hidden, elements) {
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
  dialog.querySelector("#detail-evolution").textContent = !hidden && kin.evolvesInto
    ? `Evolves into ${kin.evolvesInto} at level ${kin.evolvesAt}.` : "";
  dialog.showModal();
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
    showEvents(data, elements, habitats);
    showGallery(data, elements);
    showHabitats(data, elements);
  } catch (error) {
    document.getElementById("gallery").replaceChildren(element("li", { class: "section-lede", text: "The Codekin couldn't load. Try reloading the page." }));
  }
}

start();
