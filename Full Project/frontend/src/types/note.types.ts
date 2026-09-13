export type CellType = 'code' | 'markdown';
export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'c' | 'cpp' | 'java';

export interface CellOutput {
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTimeMs?: number;
}

export interface Cell {
  id: string;
  type: CellType;
  content: string;
  language?: SupportedLanguage;
  title?: string;
  output?: CellOutput | null;
  isStarred?: boolean;
}

export interface Collaborator {
  user: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
  joinedAt?: string;
}

export interface Note {
  id: string;
  title: string;
  folder: string;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: number | null;
  cells: Cell[];
  tags: string[];
  _version: number;
  updatedAt: number;
  owner: string;
  ownerName?: string;
  isShared?: boolean;
  collaborators?: Collaborator[];
}

export interface NoteManifest {
  id: string;
  title: string;
  folder: string;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: number | null;
  updatedAt: number;
  _version: number;
  owner: string;
}
