import { parseArgs } from "node:util";
import { type DocsLibrary, parseDocsLibrary } from "./docs.js";

export const DEFAULT_LIBRARIES = [
  "atomic=https://hebus.github.io/atomic-docs/docs/",
  "atomic-angular=https://hebus.github.io/atomic-angular-docs/docs/atomic-angular/",
  "galactik=https://hebus.github.io/atomic-angular-docs/docs/galactik/",
].join(",");

export interface Config {
  transport: "stdio" | "http";
  port: number;
  host: string;
  libraries: DocsLibrary[];
}

/** CLI flags win over environment variables, which win over defaults. */
export function loadConfig(argv = process.argv.slice(2), env = process.env): Config {
  const { values } = parseArgs({
    args: argv,
    options: {
      http: { type: "boolean" },
      port: { type: "string" },
      host: { type: "string" },
      libraries: { type: "string" },
    },
    strict: true,
  });
  const libraries = (values.libraries ?? env.DOCS_LIBRARIES ?? DEFAULT_LIBRARIES)
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map(parseDocsLibrary);
  if (!libraries.length) throw new Error("no documentation library: DOCS_LIBRARIES / --libraries is empty");
  return {
    transport: values.http ? "http" : "stdio",
    port: Number(values.port ?? env.PORT ?? 5181),
    // Local by default: nothing here needs to be reachable from another machine.
    host: values.host ?? env.HOST ?? "127.0.0.1",
    libraries,
  };
}
