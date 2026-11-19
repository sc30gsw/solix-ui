export const colorLayer = "colors";
export const libraryCascadeLayer = "solix";
export const componentLayer = "components";
export const stylePropLayer = "style-props";
export const colorSchemeLayer = "color-scheme";
export const containerQueryLayer = "container-queries";
export const childRuleLayer = "child-rules";
export const hiddenLayer = "hidden";
export const behaviourSdkLayer = "ui-sdk";

const outerLayers = [behaviourSdkLayer, libraryCascadeLayer] as const;
export const libraryLayers = [
  colorLayer,
  componentLayer,
  stylePropLayer,
  colorSchemeLayer,
  containerQueryLayer,
  hiddenLayer,
] as const;
export const outerLayerOrder = `@layer ${outerLayers.join(", ")};`;
export const libraryLayerOrder = `@layer ${libraryLayers.join(", ")};`;
export const layerOrder = `${outerLayerOrder}@layer ${libraryCascadeLayer}{${libraryLayerOrder}}`;
