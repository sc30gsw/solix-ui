import type postcss from "postcss";

export function nestedLayerOrder(layer: postcss.Container): string[] {
  const order: string[] = [];
  layer.each((node) => {
    if (node.type !== "atrule" || node.name !== "layer") return;
    for (const name of node.params.split(",").map((part) => part.trim())) {
      if (!order.includes(name)) order.push(name);
    }
  });
  return order;
}
