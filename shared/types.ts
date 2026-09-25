export type Point = { x: number; y: number };
export type Viewport = Point & { zoom: number };
export type ItemData = {
  assetId?: string;
  text?: string;
  label?: string;
  locked?: boolean;
  edgeLinks?: string[];
  sensitive?: boolean;
  colors?: import('./appearance').ItemColors;
  jobId?: string;
};
export type CanvasItem = {
  id: string;
  type: 'image' | 'text' | 'group' | 'job';
  position: Point;
  width: number;
  height: number;
  data: ItemData;
  parentId?: string;
};
export type Board = { id: string; name: string; items: CanvasItem[]; viewport: Viewport };
export type Asset = {
  id: string;
  name: string;
  path: string;
  thumbnail: string;
  width: number;
  height: number;
  hash: string;
};
export type Workflow = Record<
  string,
  { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
>;
export type MappingKey =
  'prompt' | 'negative' | 'seed' | 'width' | 'height' | 'image' | 'checkpoint';
export type Binding = { node: string; input: string };
export type Template = {
  id: string;
  name: string;
  workflow: Workflow;
  mappings: Partial<Record<MappingKey, Binding>>;
  outputs: string[];
  builtin: boolean;
  offlineVerified: boolean;
  offlineEvidence?: { jobId: string; verifiedAt: number; method: 'user-confirmed-network-block' };
};
export type JobState =
  'queued' | 'submitting' | 'running' | 'completed' | 'failed' | 'cancelled' | 'connection-unknown';
export type Job = {
  id: string;
  boardId: string;
  templateId: string;
  workflow: Workflow;
  outputs: string[];
  prompt: string;
  seed: number;
  sourceIds: string[];
  state: JobState;
  promptId?: string;
  endpoint: string;
  error?: string;
  progress?: string;
  assetIds: string[];
  parentJobId?: string;
  createdAt: number;
  position: Point;
  width: number;
  height: number;
  referenceAssetId?: string;
  imageBinding?: Binding;
  templateSnapshot?: Template;
};
export type Project = {
  library?: Library;
  name: string;
  folder: string;
  boards: Board[];
  activeBoardId: string;
  assets: Asset[];
  templates: Template[];
  jobs: Job[];
  style: string;
};
export type Library = {
  folders: { id: string; name: string; parentId?: string }[];
  assetFolders: Record<string, string>;
  characters: { id: string; name: string; description: string; assetIds: string[] }[];
};
export type NodeInfo = {
  input: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> };
  output_node?: boolean;
  python_module?: string;
  api_node?: boolean;
  category?: string;
};
export type Capabilities = {
  endpoint: string;
  nodes: Record<string, NodeInfo>;
  checkpoints: string[];
  device: string;
};
export type GenerateRequest = {
  templateId: string;
  boardId: string;
  prompt: string;
  negative: string;
  checkpoint: string;
  seed: number | null;
  width: number;
  height: number;
  count: number;
  referenceAssetId?: string;
  sourceIds: string[];
  position: Point;
  offlineTestConfirmed?: boolean;
};
export type RecentProject = {
  id: string;
  name: string;
  folder: string;
  openedAt: number;
  missing: boolean;
};
export interface WorkspaceAPI {
  saveLibrary(library: Library): Promise<void>;
  recentProjects(): Promise<RecentProject[]>;
  openRecentProject(id: string): Promise<Project>;
  forgetRecentProject(id: string): Promise<void>;
  codexStatus(): Promise<{ signedIn: boolean; label: string; imageGeneration?: boolean | null }>;
  codexLogin(): Promise<void>;
  codexLogout(): Promise<void>;
  codexChoose(): Promise<void>;
  codexRun(
    boardId: string,
    prompt: string,
    options?: import('./codex').CodexRunOptions,
  ): Promise<void>;
  codexNewChat(): Promise<void>;
  codexStop(): Promise<void>;
  codexToolResult(id: string, result: unknown, error?: string): Promise<void>;
  onCodexEvent(callback: (event: import('./codex').CodexEvent) => void): () => void;
  onCodexTool(callback: (call: import('./codex').WorkspaceToolCall) => void): () => void;
  chooseProject(create: boolean): Promise<Project | null>;
  currentProject(): Promise<Project | null>;
  saveBoard(board: Board, knownManagedIds?: string[]): Promise<void>;
  createBoard(name: string): Promise<Board>;
  activateBoard(id: string): Promise<void>;
  importImages(files?: { name: string; bytes: Uint8Array }[]): Promise<Asset[]>;
  startAssetDrag?(ids: string[]): void;
  onAssetDragError?(callback: (message: string) => void): () => void;
  browserState(): Promise<import('./embedded-browser').EmbeddedBrowserState>;
  browserNavigate(url: string): Promise<void>;
  browserCommand(command: 'back' | 'forward' | 'reload' | 'stop'): Promise<void>;
  browserBounds(bounds: import('./embedded-browser').BrowserBounds | null): Promise<void>;
  onBrowserState(callback: (state: import('./embedded-browser').EmbeddedBrowserState) => void): () => void;
  clipboardImage(): Promise<Asset | null>;
  copyAssetImage(assetId: string): Promise<void>;
  captureCanvas(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
  exportAsset(assetId: string): Promise<boolean>;
  revealAsset(assetId: string): Promise<void>;
  saveStyle(style: string): Promise<void>;
  importWorkflow(): Promise<Template | null>;
  saveTemplate(template: Template): Promise<Template>;
  verifyOffline(templateId: string, jobId: string): Promise<Template>;
  connect(port: number): Promise<Capabilities>;
  validateTemplate(template: Template): Promise<string[]>;
  generate(request: GenerateRequest): Promise<Job[]>;
  cancelJob(id: string): Promise<void>;
  retryJob(id: string): Promise<Job>;
  reconcile(): Promise<void>;
  onUpdate(callback: (project: Project) => void): () => void;
  onClosing(callback: () => void): () => void;
  finishClose(): void;
}
