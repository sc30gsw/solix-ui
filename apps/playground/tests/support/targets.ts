export type TargetRole =
  | "button"
  | "checkbox"
  | "dialog"
  | "heading"
  | "link"
  | "region"
  | "tab"
  | "tabpanel"
  | "textbox";

export type Target = { role: TargetRole; name: string } | { text: string };

export type TargetRead = { target: Target; style: string } | { target: Target; mark: string };

export const targetMark = "data-target-mark";

export function readTarget(request: TargetRead): string {
  const { target } = request;
  const normalized = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
  const roleOf = (element: Element): string | undefined => {
    const explicit = element.getAttribute("role");
    if (explicit) return explicit.trim().split(/\s+/)[0];
    const tag = element.localName;
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (tag === "button") return "button";
    if (tag === "input") {
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      const typed = ["text", "email", "tel", "url"].includes(type);
      return typed && !element.hasAttribute("list") ? "textbox" : undefined;
    }
    if (tag === "textarea") return "textbox";
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "dialog") return "dialog";
    const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
    return tag === "section" && named ? "region" : undefined;
  };
  const namedByContent = ["button", "checkbox", "heading", "link", "tab"];
  const labelsOf = (element: Element): Element[] => {
    const labels: unknown = Reflect.get(element, "labels");
    return labels instanceof NodeList ? [...labels].filter((node) => node instanceof Element) : [];
  };
  const nameOf = (element: Element): string => {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const root = element.getRootNode();
      const byId = (id: string) =>
        root instanceof Document || root instanceof ShadowRoot ? root.getElementById(id) : null;
      return normalized(
        labelledBy
          .trim()
          .split(/\s+/)
          .map((id) => byId(id)?.textContent ?? "")
          .join(" "),
      );
    }
    const label = normalized(element.getAttribute("aria-label"));
    if (label) return label;
    const labels = labelsOf(element);
    if (labels.length > 0) return normalized(labels.map((each) => each.textContent).join(" "));
    return namedByContent.includes(roleOf(element) ?? "") ? normalized(element.textContent) : "";
  };
  const shown = (element: Element) =>
    typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
  const everyElement = (root: Document | ShadowRoot): Element[] =>
    [...root.querySelectorAll("*")].flatMap((element) =>
      element.shadowRoot ? [element, ...everyElement(element.shadowRoot)] : [element],
    );
  const holdsTheText = (element: Element, text: string) =>
    normalized(element.textContent) === text &&
    ![...element.children].some((child) => normalized(child.textContent) === text);
  const found = everyElement(document).filter(
    (element) =>
      shown(element) &&
      ("text" in target
        ? holdsTheText(element, target.text)
        : roleOf(element) === target.role && nameOf(element) === target.name),
  );
  if (found.length !== 1) {
    const described =
      "text" in target ? `the text "${target.text}"` : `the ${target.role} named "${target.name}"`;
    throw new Error(`${described} is ${found.length} elements on the page, not one.`);
  }
  const [element] = found;
  if ("style" in request) return getComputedStyle(element).getPropertyValue(request.style);
  element.setAttribute("data-target-mark", request.mark);
  return request.mark;
}
