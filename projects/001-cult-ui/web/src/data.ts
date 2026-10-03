import catalog from "./catalog.json";

export type Category = string;
export type Capability = {
  id: string;
  name: string;
  english: string;
  category: Category;
  description: string;
  mechanism: string;
  scenario: string;
  source: string;
  docs?: string;
  registryName?: string;
  tags?: string[];
  dependencies?: string[];
  demo?: "shift" | "text" | "dock" | "tabs" | "beam" | "kanban";
};

// Complete fixed-version catalog. Generated from verified navigation and research copy.
export const sourceInfo = catalog.sourceInfo;
export const categories: Category[] = catalog.categories;
export const capabilities = catalog.capabilities as Capability[];
export const catalogCounts = catalog.counts;
export const deprecatedAliases = catalog.aliases;
export const unregisteredSourceFiles = catalog.unregisteredSourceFiles;
