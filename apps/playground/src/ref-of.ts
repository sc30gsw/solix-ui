export function refOf(component: string): (node: Element) => void {
  return (node) => node.setAttribute("data-ref", component);
}
