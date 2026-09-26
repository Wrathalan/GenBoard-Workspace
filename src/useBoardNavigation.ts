import { useEffect, useRef, useState } from 'react';
import { BOARD_SWITCH_BLOCKED, boardName } from '../shared/board-navigation';
import { flush, useWorkspace } from './store';

export function useBoardNavigation(openingProject: boolean) {
  const project = useWorkspace((s) => s.project);
  const pending = useWorkspace((s) => s.navigationPending);
  const codexBusy = useWorkspace((s) => s.codexBusy);
  const transition = useRef(false);
  const [previous, setPrevious] = useState<{ folder: string; id: string } | null>(null);
  const [error, setError] = useState('');
  const [busyKnown, setBusyKnown] = useState(false);
  useEffect(() => {
    let active = true,
      received = false;
    const off = window.imagine.onCodexEvent((event) => {
      if (event.type !== 'busy') return;
      received = true;
      useWorkspace.setState({ codexBusy: event.busy });
      setBusyKnown(true);
    });
    void window.imagine
      .codexBusy()
      .then((busy) => {
        if (active && !received) {
          useWorkspace.setState({ codexBusy: busy });
          setBusyKnown(true);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      off();
    };
  }, []);
  useEffect(() => {
    setPrevious(null);
    setError('');
  }, [project?.folder]);
  const blocked = codexBusy ? BOARD_SWITCH_BLOCKED : !busyKnown ? 'Checking board navigation…' : '';

  async function run(action: { id: string } | { name: string } | { rename: string }) {
    const state = useWorkspace.getState();
    if (!state.project || !state.board || transition.current || openingProject) return false;
    if (!('rename' in action) && (state.codexBusy || !busyKnown)) {
      setError(blocked);
      return false;
    }
    if ('id' in action && action.id === state.board.id) return true;
    transition.current = true;
    useWorkspace.setState({ navigationPending: true });
    setError('');
    try {
      if ('rename' in action) {
        state.renameBoard(boardName(action.rename));
        await flush();
      } else {
        await flush();
        const p =
          'name' in action
            ? await window.imagine.createAndActivateBoard(boardName(action.name))
            : await window.imagine
                .activateBoard(action.id)
                .then(() => window.imagine.currentProject());
        if (!p) throw new Error('The project is no longer open.');
        useWorkspace.getState().load(p);
        setPrevious({ folder: p.folder, id: state.board.id });
      }
      return true;
    } catch (e) {
      setError(
        ((e as Error).message || String(e)).replace(
          /^Error invoking remote method '[^']+': Error: /,
          '',
        ),
      );
      return false;
    } finally {
      transition.current = false;
      useWorkspace.setState({ navigationPending: false });
    }
  }
  return {
    transition,
    pending: pending || openingProject,
    blocked,
    error,
    clearError: () => setError(''),
    previous:
      previous?.folder === project?.folder
        ? project?.boards.find((b) => b.id === previous?.id)
        : undefined,
    choose: (id: string) => run({ id }),
    create: (name: string) => run({ name }),
    rename: (name: string) => run({ rename: name }),
  };
}
