import { createComponent, renderToString } from "@solidjs/web";
import { everyBrowserResource } from "#/tests/support/browser-resources.ts";
import { serialized } from "#/fixtures/server-cases.ts";

function valuesBelow(value: unknown, path: string): string[] {
  if (typeof value === "function") return [];
  if (Array.isArray(value)) {
    return value.flatMap((member, index) => valuesBelow(member, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, member]) => valuesBelow(member, `${path}.${key}`));
  }
  return [`${path} is ${serialized(value)}`];
}

export function plainValuesIn(returned: unknown, name: string): string[] {
  return returned === undefined ? [] : valuesBelow(returned, name);
}

export function browserResourcesReadDuring(run: () => void): string[] {
  const touched: string[] = [];
  const saved = everyBrowserResource.map((name) => ({
    name,
    descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
  }));
  for (const name of everyBrowserResource) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        throw new ReferenceError(`${name} is not available on the server`);
      },
    });
  }
  try {
    run();
    return touched;
  } finally {
    for (const { name, descriptor } of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

export function renderedOnTheServer(render: () => string): string {
  return renderToString(() => createComponent(render, {}));
}
