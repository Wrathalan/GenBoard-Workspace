import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plug,
  Upload,
  Play,
  X,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { fail, flush, useWorkspace } from './store';
import type { Capabilities, MappingKey, Template } from '../shared/types';
import { absolutePosition } from '../shared/board';
import { assetUrl } from './Canvas';

export function Generation({
  close,
  referenceRequest,
  jobRequest,
}: {
  close: () => void;
  referenceRequest?: { id: string; at: number };
  jobRequest?: { id: string; at: number };
}) {
  const project = useWorkspace((s) => s.project)!;
  const selected = useWorkspace((s) => s.selected);
  const board = useWorkspace((s) => s.board)!;
  const flow = useReactFlow();
  const [port, setPort] = useState(8188);
  const [caps, setCaps] = useState<Capabilities>();
  const [connecting, setConnecting] = useState(false);
  const [templateId, setTemplateId] = useState(project.templates[0]?.id || '');
  const template = project.templates.find((t) => t.id === templateId);
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [checkpoint, setCheckpoint] = useState('');
  const [seed, setSeed] = useState('');
  const [count, setCount] = useState(4);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [reference, setReference] = useState<string>();
  const [styleEnabled, setStyleEnabled] = useState(true);
  const [showStyle, setShowStyle] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [sending, setSending] = useState(false);
  const [validation, setValidation] = useState<string[]>([]);
  const [checkpointConfirmed, setCheckpointConfirmed] = useState(false);
  const [offlineTest, setOfflineTest] = useState(false);
  const selectedImage = board.items.find((i) => selected.includes(i.id) && i.type === 'image');
  useEffect(() => {
    if (referenceRequest) {
      setReference(referenceRequest.id);
      if (!template?.mappings.image) setTemplateId('sdxl-image');
    }
  }, [referenceRequest]);
  useEffect(() => {
    if (!jobRequest) return;
    const row = document.querySelector<HTMLElement>(`[data-job-id="${CSS.escape(jobRequest.id)}"]`);
    const details = row?.querySelector('details');
    if (details) details.open = true;
    row?.scrollIntoView({ block: 'nearest' });
    row?.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  }, [jobRequest]);
  // Only the operational master direction becomes the style prefix; omit the source document's provenance and templates.
  const style = project.style;
  const referenceDirection =
    reference && template?.mappings.image
      ? '\nREFERENCE ROLE: The supplied image is the edit target and identity/design reference. Preserve its strongest likeness, anatomy, silhouette, clothing coverage, and owned equipment unless explicitly changed by the current request.\n'
      : '';
  const combined =
    styleEnabled && style.trim()
      ? `STYLE DIRECTION (apply unless the current request explicitly overrides it):\n${style}\n${referenceDirection}\nCURRENT REQUEST (takes precedence):\n${prompt}`
      : `${referenceDirection}${prompt}`;
  const updateTemplate = async (t: Template) => {
    try {
      const saved = await window.imagine.saveTemplate(t);
      useWorkspace.setState({
        project: {
          ...useWorkspace.getState().project!,
          templates: useWorkspace
            .getState()
            .project!.templates.map((x) => (x.id === t.id ? saved : x)),
        },
      });
      setValidation([]);
    } catch (e) {
      fail(e);
    }
  };
  const connect = async () => {
    setConnecting(true);
    try {
      setCaps(await window.imagine.connect(port));
    } catch (e) {
      setCaps(undefined);
      fail(
        new Error(
          `Could not connect to 127.0.0.1:${port}. Start ComfyUI separately and check its port. ${(e as Error).message}`,
        ),
      );
    } finally {
      setConnecting(false);
    }
  };
  const generate = async () => {
    if (!template) return;
    setSending(true);
    try {
      if (template.builtin && !checkpointConfirmed)
        throw new Error(
          'Confirm that the selected checkpoint is SDXL-compatible. The server only reports model filenames.',
        );
      await flush();
      const anchor = selectedImage
        ? absolutePosition(selectedImage, board.items)
        : flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      await window.imagine.generate({
        templateId,
        boardId: board.id,
        prompt: combined,
        negative,
        checkpoint,
        seed: seed.trim() ? Number(seed) : null,
        count,
        width,
        height,
        referenceAssetId: reference,
        sourceIds: reference ? [reference] : [],
        position: { x: anchor.x + (selectedImage ? selectedImage.width + 48 : 0), y: anchor.y },
        offlineTestConfirmed: offlineTest,
      });
    } catch (e) {
      fail(e);
    } finally {
      setSending(false);
    }
  };
  return (
    <aside className="panel right-panel generation" aria-label="Generation panel">
      <div className="panel-title">
        <span>Generate locally</span>
        <button title="Close generation" onClick={close}>
          <X size={16} />
        </button>
      </div>
      <div className="panel-scroll">
        <div className="connection">
          <span className={`status-dot ${caps ? 'online' : ''}`} />
          <span>{caps ? 'ComfyUI connected' : 'ComfyUI disconnected'}</span>
        </div>
        <div className="row">
          <span className="muted">127.0.0.1 :</span>
          <input
            aria-label="ComfyUI port"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => {
              setPort(+e.target.value);
              setCaps(undefined);
            }}
          />
          <button className="secondary" onClick={connect} disabled={connecting}>
            <Plug size={14} />
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {caps && <p className="micro">{caps.device}</p>}
        <label>
          Workflow
          <select
            aria-label="Workflow"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setValidation([]);
            }}
          >
            {project.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button
            className="text-button"
            onClick={async () => {
              try {
                const t = await window.imagine.importWorkflow();
                if (t) {
                  useWorkspace.setState({
                    project: { ...project, templates: [...project.templates, t] },
                  });
                  setTemplateId(t.id);
                  setMapping(true);
                }
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Upload size={14} /> Import API JSON
          </button>
          <button className="text-button" onClick={() => setMapping(!mapping)}>
            {mapping ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Mapping
          </button>
        </div>
        {template && mapping && (
          <div className="mapping">
            <p className="micro">
              Map controls to literal workflow inputs. Node connections are excluded.
            </p>
            {(
              [
                'prompt',
                'negative',
                'seed',
                'width',
                'height',
                'image',
                'checkpoint',
              ] as MappingKey[]
            ).map((key) => (
              <label key={key}>
                {key}
                <select
                  aria-label={`Map ${key}`}
                  value={
                    template.mappings[key]
                      ? `${template.mappings[key]!.node}:${template.mappings[key]!.input}`
                      : ''
                  }
                  onChange={(e) => {
                    const mappings = { ...template.mappings };
                    if (!e.target.value) delete mappings[key];
                    else {
                      const [node, input] = e.target.value.split(':');
                      mappings[key] = { node, input };
                    }
                    void updateTemplate({ ...template, mappings });
                  }}
                >
                  <option value="">Not mapped</option>
                  {Object.entries(template.workflow).flatMap(([id, n]) =>
                    Object.entries(n.inputs)
                      .filter(([, v]) => !Array.isArray(v))
                      .map(([input]) => (
                        <option key={`${id}:${input}`} value={`${id}:${input}`}>
                          {id} · {n.class_type} · {input}
                        </option>
                      )),
                  )}
                </select>
              </label>
            ))}
            <label>
              Image output nodes
              <select
                multiple
                aria-label="Output nodes"
                value={template.outputs}
                onChange={(e) =>
                  void updateTemplate({
                    ...template,
                    outputs: [...e.target.selectedOptions].map((o) => o.value),
                  })
                }
              >
                {Object.entries(template.workflow).map(([id, n]) => (
                  <option key={id} value={id}>
                    {id} · {n.class_type}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  setValidation(await window.imagine.validateTemplate(template));
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Validate against server
            </button>
            {validation.map((v, i) => (
              <p className="warning micro" key={i}>
                {v}
              </p>
            ))}
          </div>
        )}
        {template && !template.builtin && (
          <div>
            {template.offlineVerified ? (
              <p className="micro">
                Offline run confirmed by you ·{' '}
                {new Date(template.offlineEvidence!.verifiedAt).toLocaleDateString()}. Re-test after
                changing custom nodes.
              </p>
            ) : (
              <>
                <p className="warning micro">
                  Imported workflow · offline execution not verified. Custom nodes can make network
                  requests.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={offlineTest}
                    onChange={(e) => setOfflineTest(e.target.checked)}
                  />{' '}
                  External networking is blocked for this offline test
                </label>
                <button
                  className="text-button"
                  disabled={
                    !offlineTest ||
                    !project.jobs.some(
                      (j) => j.templateId === template.id && j.state === 'completed',
                    )
                  }
                  onClick={async () => {
                    try {
                      const j = [...project.jobs]
                        .reverse()
                        .find((j) => j.templateId === template.id && j.state === 'completed')!;
                      const saved = await window.imagine.verifyOffline(template.id, j.id);
                      useWorkspace.setState({
                        project: {
                          ...project,
                          templates: project.templates.map((t) => (t.id === saved.id ? saved : t)),
                        },
                      });
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  Record successful offline test
                </button>
              </>
            )}
          </div>
        )}
        {template?.mappings.checkpoint && (
          <>
            <label>
              Checkpoint
              <select
                aria-label="Checkpoint"
                value={checkpoint}
                onChange={(e) => {
                  setCheckpoint(e.target.value);
                  setCheckpointConfirmed(false);
                }}
              >
                <option value="">Select an installed model</option>
                {caps?.checkpoints.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {template.builtin && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={checkpointConfirmed}
                  onChange={(e) => setCheckpointConfirmed(e.target.checked)}
                />{' '}
                This checkpoint is SDXL-compatible
              </label>
            )}
          </>
        )}
        <label>
          Prompt
          <textarea
            aria-label="Generation prompt"
            placeholder="Describe what you want to create…"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        {template?.mappings.negative && (
          <label>
            Negative prompt
            <textarea
              rows={2}
              aria-label="Negative prompt"
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              placeholder="Optional exclusions"
            />
          </label>
        )}
        {template?.mappings.image && (
          <div className="reference">
            <label>Reference image</label>
            {reference && <img src={assetUrl(reference)} alt="Generation reference" />}
            <button
              className="secondary"
              disabled={!selectedImage}
              onClick={() => setReference(selectedImage?.data.assetId)}
            >
              Use selected image as reference
            </button>
            {!reference && (
              <p className="micro">Select an image on the board, then assign it here.</p>
            )}
          </div>
        )}
        <div className="row fields">
          {template?.mappings.width && (
            <label>
              Width
              <input
                type="number"
                aria-label="Width"
                step={64}
                min={64}
                max={4096}
                value={width}
                onChange={(e) => setWidth(+e.target.value)}
              />
            </label>
          )}
          {template?.mappings.height && (
            <label>
              Height
              <input
                type="number"
                aria-label="Height"
                step={64}
                min={64}
                max={4096}
                value={height}
                onChange={(e) => setHeight(+e.target.value)}
              />
            </label>
          )}
          <label>
            Outputs
            <input
              type="number"
              aria-label="Output count"
              min={1}
              max={8}
              value={count}
              onChange={(e) => setCount(+e.target.value)}
            />
          </label>
        </div>
        <label>
          Starting seed
          <input
            aria-label="Seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Random · saved before running"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={styleEnabled}
            onChange={(e) => setStyleEnabled(e.target.checked)}
          />{' '}
          Graphic anime style preset
        </label>
        <button className="text-button" onClick={() => setShowStyle(!showStyle)}>
          {showStyle ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Style and final
          prompt
        </button>
        {showStyle && (
          <div>
            <label>
              Editable style preset
              <textarea
                rows={8}
                aria-label="Style preset"
                value={style}
                onChange={(e) =>
                  useWorkspace.setState({ project: { ...project, style: e.target.value } })
                }
                onBlur={() =>
                  window.imagine.saveStyle(useWorkspace.getState().project!.style).catch(fail)
                }
              />
            </label>
            <label>
              Final prompt
              <textarea readOnly rows={6} value={combined} />
            </label>
          </div>
        )}
        <button
          className="primary generate-button"
          onClick={generate}
          disabled={!caps || sending || !prompt.trim()}
        >
          <Play size={15} />
          {sending ? 'Queueing…' : `Generate ${count > 1 ? count + ' images' : 'image'}`}
        </button>
        <div className="section-title">
          <span>Queue & history</span>
          <button title="Reconcile jobs" onClick={() => window.imagine.reconcile().catch(fail)}>
            <RefreshCw size={14} />
          </button>
        </div>
        {!project.jobs.length && <p className="micro">Your generation history will appear here.</p>}
        {[...project.jobs].reverse().map((j) => (
          <div className="job-row" key={j.id} data-job-id={j.id}>
            <div className="row">
              <span className={`status-label ${j.state}`}>
                {j.state === 'completed' && <CheckCircle2 size={12} />} {j.state.replace('-', ' ')}
              </span>
              <span className="micro">
                {new Date(j.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="micro">
              Seed {j.seed} · {j.progress || 'Waiting'}
            </p>
            {j.error && <p className="warning micro">{j.error}</p>}
            <div className="row">
              {['queued', 'running'].includes(j.state) && (
                <button
                  className="text-button"
                  onClick={() => window.imagine.cancelJob(j.id).catch(fail)}
                >
                  Cancel
                </button>
              )}
              {['failed', 'cancelled'].includes(j.state) && (
                <button
                  className="text-button"
                  onClick={() => window.imagine.retryJob(j.id).catch(fail)}
                >
                  Retry as new attempt
                </button>
              )}
              <details>
                <summary>Details</summary>
                <pre>{JSON.stringify(j, null, 2)}</pre>
              </details>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
