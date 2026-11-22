interface ImportMetaEnv {
  readonly [name: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
