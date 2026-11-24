export type EngineStatus =
  | 'booting'
  | 'ready'
  | 'shell'
  | 'exited'
  | 'unsupported'
  | 'error';

export type WorkspaceTab = 'eggbox' | 'examples' | 'editor' | 'files';

export type MobilePane = 'terminal' | WorkspaceTab;

export interface VirtualFileEntry {
  path: string;
  size: number;
  data: Uint8Array;
  status: 'ready' | 'transferring' | 'previous' | 'failed';
  updatedAt: number;
}

export interface EggBoxCell {
  size: number;
  isGroup: boolean;
  rep: string;
}

export interface GreensDClassInfo {
  index: number;
  size: number;
  regular: boolean;
  rCount: number;
  lCount: number;
  representative: string;
  eggBox: EggBoxCell[][];
}

export interface SemigroupProperties {
  regular: boolean;
  inverse: boolean;
  band: boolean;
  semilattice: boolean;
  commutative: boolean;
  simple: boolean;
  zeroSimple: boolean;
  clifford: boolean;
  orthodox: boolean;
  completelyRegular: boolean;
  monoid: boolean;
  group: boolean;
}

export interface SemigroupConjugacyInfo {
  primaryClasses: number;
  primaryTransitive: boolean;
  ottoClasses: number;
  unitClasses: number | null;
}

export interface InnerTranslationInfo {
  leftDistinctCount: number;
  rightDistinctCount: number;
  leftCycleLengths: number[];
  rightCycleLengths: number[];
}

export interface CompleteMappingInfo {
  exists: boolean | null;
  reason: string;
}

export interface SemigroupInspection {
  label: string;
  order: number;
  generatorCount: number;
  idempotentCount: number;
  rClassCount: number;
  lClassCount: number;
  hClassCount: number;
  properties: SemigroupProperties;
  dClasses: GreensDClassInfo[];
  conjugacy?: SemigroupConjugacyInfo;
  innerTranslations?: InnerTranslationInfo;
  completeMapping?: CompleteMappingInfo;
  elements?: string[];
  cayleyTable?: number[][];
}

export type ExampleCategory = 'all' | 'bentz' | 'eggbox' | 'semigroups' | 'packages' | 'groups';

export interface GapExample {
  id: string;
  title: string;
  category: Exclude<ExampleCategory, 'all'>;
  summary: string;
  packages?: string[];
  code: string;
}

export interface ServerHealthInfo {
  ok: boolean;
  gapBuildId: string;
  startupManifestCount: number;
  totalFsEntries: number;
  headers: Record<string, string>;
}
