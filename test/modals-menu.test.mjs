import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.dataset = {};
    this.parentNode = null;
    this.style = { setProperty() {} };
    this.textContent = "";
    this.type = "";
    this.className = "";
    this.classList = {
      add: (...classes) => {
        const current = new Set(this.className.split(" ").filter(Boolean));
        classes.forEach((className) => current.add(className));
        this.className = [...current].join(" ");
      },
      remove: (...classes) => {
        const removeSet = new Set(classes);
        this.className = this.className
          .split(" ")
          .filter((className) => className && !removeSet.has(className))
          .join(" ");
      },
      contains: (className) => this.className.split(" ").includes(className),
    };
  }

  get childNodes() {
    return this.children;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  contains(target) {
    return (
      target === this || this.children.some((child) => child.contains(target))
    );
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(
      (child) => child !== this,
    );
    this.parentNode = null;
  }

  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelector() {
    return null;
  }

  addEventListener() {}
}

globalThis.document = {
  addEventListener() {},
  createElement: (tagName) => new FakeElement(tagName),
  getElementById: () => null,
  querySelector: () => null,
  removeEventListener() {},
};

const { isInteractionOverlayOpen, renderCardActionMenu } =
  await import("../newtab/modals.js");
const { createCardElement } = await import("../newtab/render.js");

const findByDataset = (element, key, value) => {
  if (element.dataset?.[key] === value) return element;
  for (const child of element.children ?? []) {
    const match = findByDataset(child, key, value);
    if (match) return match;
  }
  return null;
};

test("read-only note cards do not render an empty action menu", () => {
  const cardEl = new FakeElement("article");
  const menu = renderCardActionMenu(
    cardEl,
    { id: "card-a", type: "note" },
    { hideEdit: true, hideDelete: true },
  );

  assert.equal(menu, null);
  assert.equal(cardEl.children.length, 0);
});

test("interaction overlay detection covers visible modals and card menus", () => {
  assert.equal(
    isInteractionOverlayOpen({ querySelector: () => new FakeElement("div") }),
    true,
  );
  assert.equal(isInteractionOverlayOpen({ querySelector: () => null }), false);
});

test("read-only note cards omit the no-op menu button", () => {
  const cardEl = createCardElement(
    { id: "card-a", type: "note", title: "Read-only note" },
    "board-a",
    "",
    { readOnly: true },
  );

  assert.equal(findByDataset(cardEl, "cardAction", "menu"), null);
});

test("read-only link cards keep the menu button for the open action", () => {
  const cardEl = createCardElement(
    {
      id: "card-a",
      type: "link",
      title: "Read-only link",
      url: "https://example.com",
    },
    "board-a",
    "",
    { readOnly: true },
  );

  assert.ok(findByDataset(cardEl, "cardAction", "menu"));
});
