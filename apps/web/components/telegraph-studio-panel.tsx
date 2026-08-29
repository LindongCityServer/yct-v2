'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { appPath } from '../lib/app-paths';
import {
  buildTelegraphReceiveDocument,
  createTelegraphSerial,
  evaluateTelegraphDraft,
  formatTelegraphDate,
  formatTelegraphRelayNumber,
  inferTelegraphCharacter,
  splitTelegraphCells,
  TELEGRAPH_MAX_BODY_GRIDS,
  TELEGRAPH_MAX_RECIPIENT_GRIDS,
  type TelegraphCell,
  type TelegraphDraftInput,
  type TelegraphReceiveCodeToken,
} from '../lib/telegraph-domain';
import {
  deleteTelegraphHistory,
  listTelegraphHistory,
  saveTelegraphHistory,
  type TelegraphHistoryRecord,
} from '../lib/client-telegraph-history';
import {
  publishTelegraphArtifactDownloaded,
  publishTelegraphDraftUpdated,
  publishTelegraphPrintProgress,
  publishTelegraphPrintStarted,
  type TelegraphPrintStage,
} from '../lib/client-telegraph-events';
import { publishToastRequested } from '../lib/client-toast-events';

const emptyDraft: TelegraphDraftInput = {
  province: '',
  city: '',
  county: '',
  district: '',
  recipientInfo: '',
  body: '',
  senderName: '',
  senderAddress: '',
};
const printStages: Array<{ id: TelegraphPrintStage; label: string }> = [
  { id: 'header', label: '填写报头' },
  { id: 'recipient', label: '填写收报信息' },
  { id: 'code', label: '打印电码' },
  { id: 'message', label: '打印电文' },
  { id: 'footer', label: '打印报尾' },
  { id: 'stamp', label: '盖电报戳' },
  { id: 'envelope', label: '装入信封' },
];
const TELEGRAPH_SEND_FLIGHT_MS = 850;
const TELEGRAPH_ENVELOPE_TRANSITION_MS = 1300;
const TELEGRAPH_ENVELOPE_SIDE_SWAP_MS = 600;
const TELEGRAPH_FOLDING_MS = 1200;
const TELEGRAPH_MANUAL_FLIP_MS = 800;
const TELEGRAPH_MANUAL_FLIP_SWAP_MS = 360;
const TELEGRAPH_AUTO_FILL_CHARACTER_MS = 84;
const TELEGRAPH_WRITING_OVERLAP_MS = 150;
const TELEGRAPH_WRITING_MAX_VOICES = 5;
const TELEGRAPH_HISTORY_ENVELOPE_EXIT_MS = 620;
const TELEGRAPH_HISTORY_ENVELOPE_ENTER_MS = 720;
const telegraphPaperSoundPaths = {
  page: '/audio/telegraph/paper-page-turn.mp3',
  friction: '/audio/telegraph/paper-friction.mp3',
  writing: '/audio/telegraph/paper-writing.mp3',
} as const;
type TelegraphPaperSound = keyof typeof telegraphPaperSoundPaths;
type TelegraphAnimationState =
  | 'welcome'
  | 'editing'
  | 'filling'
  | 'sending'
  | 'receiving'
  | 'folding'
  | 'sealed'
  | 'opening'
  | 'opened'
  | 'packing';
type AccountStatus = 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';
interface AccountStatusResponse {
  accountStatus?: AccountStatus;
}
interface TelegraphContextResponse {
  clientIp?: string;
  clientIpLocation?: string;
}
const historyToggleEvent = 'yct:telegraph-history-toggle';
const newLetterEvent = 'yct:telegraph-new-letter';

function emptyGridValues(size: number): string[] {
  return Array.from({ length: size }, () => '');
}

function draftGridValues(value: string, size: number): string[] {
  const cells = splitTelegraphCells(value);
  return Array.from({ length: size }, (_, index) => cells[index]?.value ?? '');
}

function normalizeGridCellValue(value: string): string {
  const characters = Array.from(value);
  const nonAlphaNumeric = characters.find((character) => !/^[A-Za-z0-9]$/.test(character));
  if (nonAlphaNumeric) return nonAlphaNumeric;
  return characters.slice(0, 5).join('');
}

function splitGridInputChunks(value: string): string[] {
  const chunks: string[] = [];
  const characters = Array.from(value);
  let index = 0;
  while (index < characters.length) {
    if (/^[A-Za-z0-9]$/.test(characters[index])) {
      let end = index;
      while (end < characters.length && /^[A-Za-z0-9]$/.test(characters[end])) end += 1;
      for (let offset = index; offset < end; offset += 5) {
        chunks.push(characters.slice(offset, Math.min(offset + 5, end)).join(''));
      }
      index = end;
      continue;
    }
    chunks.push(characters[index]);
    index += 1;
  }
  return chunks;
}

function joinGridValues(values: string[]): string {
  return values.join('');
}

export function TelegraphToolbarActions() {
  return (
    <div className="topbar-actions material-studio-topbar-actions telegraph-topbar-actions">
      <button
        className="icon-button"
        type="button"
        aria-label="再写一封"
        title="再写一封"
        onClick={() => window.dispatchEvent(new Event(newLetterEvent))}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          note_add
        </span>
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="打开历史记录"
        title="历史记录"
        onClick={() => window.dispatchEvent(new Event(historyToggleEvent))}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          history
        </span>
      </button>
    </div>
  );
}

export function TelegraphStudioPanel() {
  const [draft, setDraft] = useState<TelegraphDraftInput>(emptyDraft);
  const [serialNumber, setSerialNumber] = useState(() => createTelegraphSerial());
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());
  const [history, setHistory] = useState<TelegraphHistoryRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printStage, setPrintStage] = useState<TelegraphPrintStage | null>(null);
  const [animationState, setAnimationState] = useState<TelegraphAnimationState>('welcome');
  const [receiveCodeProgress, setReceiveCodeProgress] = useState(0);
  const [receiveTextProgress, setReceiveTextProgress] = useState(0);
  const [envelopeSide, setEnvelopeSide] = useState<'front' | 'back'>('front');
  const [paperView, setPaperView] = useState<'receive' | 'send'>('receive');
  const [paperSwitching, setPaperSwitching] = useState(false);
  const [envelopeFlipping, setEnvelopeFlipping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [historyEnvelopeTransition, setHistoryEnvelopeTransition] = useState<'out' | 'in' | null>(
    null,
  );
  const [welcomeCodeComplete, setWelcomeCodeComplete] = useState(false);
  const [welcomeCodeHasPlayed, setWelcomeCodeHasPlayed] = useState(false);
  const [paperEntering, setPaperEntering] = useState(false);
  const [autoFillCharacterCount, setAutoFillCharacterCount] = useState(0);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveHistoryOnPrint, setSaveHistoryOnPrint] = useState(true);
  const [scrollHints, setScrollHints] = useState({
    welcomeAtBottom: false,
    sendPaperAtEnd: false,
  });
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [clientIp, setClientIp] = useState('');
  const [clientIpLocation, setClientIpLocation] = useState('');
  const [recipientGridValues, setRecipientGridValues] = useState(() =>
    emptyGridValues(TELEGRAPH_MAX_RECIPIENT_GRIDS),
  );
  const [bodyGridValues, setBodyGridValues] = useState(() =>
    emptyGridValues(TELEGRAPH_MAX_BODY_GRIDS),
  );
  const [activeCell, setActiveCell] = useState<{
    field: 'recipientInfo' | 'body';
    index: number;
  } | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const audioStopRef = useRef<(() => void) | null>(null);
  const soundStopsRef = useRef<Array<() => void>>([]);
  const paperSwitchTimerRef = useRef<number | null>(null);
  const paperEnterTimerRef = useRef<number | null>(null);
  const historyTransitionTimerRef = useRef<number | null>(null);
  const paperSoundTimerRef = useRef<Set<number>>(new Set());
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const welcomeReplayRef = useRef<(() => void) | null>(null);
  const outputRef = useRef<HTMLElement | null>(null);
  const result = useMemo(() => evaluateTelegraphDraft(draft), [draft]);
  const date = useMemo(() => formatTelegraphDate(new Date(generatedAt)), [generatedAt]);
  const automaticFillValues = useMemo(
    () => [
      String(result.billableGrids || ''),
      result.amount ? result.amount.toFixed(2) : '',
      formatTelegraphRelayNumber(serialNumber),
      date.date,
      date.time.replace(':', ''),
      '电报大楼',
    ],
    [date.date, date.time, result.amount, result.billableGrids, serialNumber],
  );
  const automaticFillCharacterTotal = useMemo(
    () => automaticFillValues.reduce((total, value) => total + Array.from(value).length, 0),
    [automaticFillValues],
  );
  const receiveDocument = useMemo(
    () => buildTelegraphReceiveDocument(draft, result, serialNumber, generatedAt),
    [draft, generatedAt, result, serialNumber],
  );
  const receiveCells = useMemo(() => receiveDocument.contentCells, [receiveDocument]);
  const receiveRecipientRowCount = useMemo(() => {
    const firstBodyRowIndex = receiveDocument.rows.findIndex((row) => row.cells.length === 0);
    return firstBodyRowIndex >= 0 ? firstBodyRowIndex : receiveDocument.rows.length;
  }, [receiveDocument.rows]);
  const receiveCodeText = receiveDocument.codeText;
  const welcomeCodeGroups = useMemo(
    () =>
      Array.from('电报大楼').map((character) => ({
        character,
        code: splitTelegraphCells(character)[0]?.code ?? '????',
      })),
    [],
  );
  const handleWelcomeCodeStart = useCallback(() => {
    setWelcomeCodeComplete(false);
  }, []);
  const handleWelcomeCodeComplete = useCallback((replay: () => void) => {
    welcomeReplayRef.current = replay;
    setWelcomeCodeComplete(true);
    setWelcomeCodeHasPlayed(true);
  }, []);
  const receiveTimelineCount = useMemo(
    () =>
      receiveDocument.codeTokens.reduce(
        (total, token) => Math.max(total, (token.progressIndex ?? -1) + 1),
        0,
      ),
    [receiveDocument],
  );
  const senderLocked = accountStatus !== 'active';
  const senderDisplayName = senderLocked ? clientIp : draft.senderName;
  const senderDisplayAddress = senderLocked ? clientIpLocation || clientIp : draft.senderAddress;
  const effectiveDraft = senderLocked
    ? {
        ...draft,
        senderName: clientIp || draft.senderName,
        senderAddress: senderDisplayAddress,
      }
    : draft;
  const outputVisible = [
    'sending',
    'receiving',
    'folding',
    'sealed',
    'opening',
    'opened',
    'packing',
  ].includes(animationState);
  const outputSkipVisible = busy && ['sending', 'receiving', 'folding'].includes(animationState);

  const getAutomaticFillValue = (index: number): string => {
    const value = automaticFillValues[index] ?? '';
    if (animationState === 'editing') return '';
    if (animationState !== 'filling') return value;
    const completedBefore = automaticFillValues
      .slice(0, index)
      .reduce((total, current) => total + Array.from(current).length, 0);
    const visibleCount = Math.max(
      0,
      Math.min(Array.from(value).length, autoFillCharacterCount - completedBefore),
    );
    return Array.from(value).slice(0, visibleCount).join('');
  };

  const beginDraft = (force = false) => {
    if ((busy || paperEntering) && !force) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (paperEnterTimerRef.current !== null) {
      window.clearTimeout(paperEnterTimerRef.current);
    }
    playPaperSound('page', 760);
    setAnimationState('editing');
    setPaperEntering(true);
    setAutoFillCharacterCount(0);
    setActiveCell(null);
    setError('');
    window.setTimeout(() => firstInputRef.current?.focus(), 680);
    paperEnterTimerRef.current = window.setTimeout(() => {
      paperEnterTimerRef.current = null;
      setPaperEntering(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }, 980);
  };

  useEffect(() => {
    return () => {
      stopAllSounds();
      if (historyTransitionTimerRef.current !== null) {
        window.clearTimeout(historyTransitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (animationState !== 'sending' && animationState !== 'receiving') return;
    const frameId = window.requestAnimationFrame(() => {
      const output = outputRef.current;
      if (!output) return;
      const topbarHeight = document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 64;
      const targetTop = Math.max(
        0,
        window.scrollY + output.getBoundingClientRect().top - topbarHeight - 12,
      );
      window.scrollTo({
        top: targetTop,
        behavior: 'auto',
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [animationState]);

  useEffect(() => {
    const updateScrollHints = () => {
      const root = document.documentElement;
      const body = document.body;
      const scrollHeight = Math.max(root.scrollHeight, body.scrollHeight);
      const welcomeAtBottom = window.scrollY + window.innerHeight >= scrollHeight - 18;
      const paper = document.querySelector<HTMLElement>(
        '.telegraph-send-stage .telegraph-send-paper',
      );
      const sendPaperAtEnd =
        animationState === 'editing' &&
        Boolean(paper && paper.getBoundingClientRect().bottom <= window.innerHeight + 16);
      setScrollHints((current) =>
        current.welcomeAtBottom === welcomeAtBottom && current.sendPaperAtEnd === sendPaperAtEnd
          ? current
          : { welcomeAtBottom, sendPaperAtEnd },
      );
    };
    updateScrollHints();
    window.addEventListener('scroll', updateScrollHints, { passive: true });
    window.addEventListener('resize', updateScrollHints);
    return () => {
      window.removeEventListener('scroll', updateScrollHints);
      window.removeEventListener('resize', updateScrollHints);
    };
  }, [animationState, paperEntering]);

  useEffect(() => {
    void listTelegraphHistory().then(setHistory);
  }, []);
  useEffect(() => {
    const handleHistoryToggle = () => setHistoryOpen((value) => !value);
    const handleNewLetter = () => {
      stopAllSounds();
      runIdRef.current += 1;
      if (paperEnterTimerRef.current !== null) {
        window.clearTimeout(paperEnterTimerRef.current);
        paperEnterTimerRef.current = null;
      }
      const nextDraft =
        senderLocked && (clientIp || clientIpLocation)
          ? {
              ...emptyDraft,
              senderName: clientIp,
              senderAddress: clientIpLocation || clientIp,
            }
          : emptyDraft;
      setDraft(nextDraft);
      setRecipientGridValues(emptyGridValues(TELEGRAPH_MAX_RECIPIENT_GRIDS));
      setBodyGridValues(emptyGridValues(TELEGRAPH_MAX_BODY_GRIDS));
      setActiveCell(null);
      setSerialNumber(createTelegraphSerial());
      setGeneratedAt(new Date().toISOString());
      setHistoryOpen(false);
      setConfirmOpen(false);
      setSaveHistoryOnPrint(true);
      setPrintStage(null);
      setReceiveCodeProgress(0);
      setReceiveTextProgress(0);
      setEnvelopeSide('front');
      setPaperView('receive');
      setPaperSwitching(false);
      setEnvelopeFlipping(false);
      setBusy(false);
      setShowActions(false);
      beginDraft(true);
    };
    window.addEventListener(historyToggleEvent, handleHistoryToggle);
    window.addEventListener(newLetterEvent, handleNewLetter);
    return () => {
      window.removeEventListener(historyToggleEvent, handleHistoryToggle);
      window.removeEventListener(newLetterEvent, handleNewLetter);
    };
  }, [clientIp, clientIpLocation, senderLocked]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(appPath('/api/account/status'), { cache: 'no-store' }).then(async (response) =>
        response.ok ? ((await response.json()) as AccountStatusResponse) : {},
      ),
      fetch(appPath('/api/telegraph/context'), { cache: 'no-store' }).then(async (response) =>
        response.ok ? ((await response.json()) as TelegraphContextResponse) : {},
      ),
    ])
      .then(([account, context]) => {
        if (cancelled) return;
        const status = account.accountStatus ?? 'unavailable';
        setAccountStatus(status);
        setClientIp(context.clientIp ?? '');
        setClientIpLocation(context.clientIpLocation ?? '');
        if (status !== 'active' && (context.clientIp || context.clientIpLocation))
          setDraft((current) =>
            current.senderName || current.senderAddress
              ? current
              : {
                  ...current,
                  senderName: context.clientIp ?? '',
                  senderAddress: context.clientIpLocation ?? context.clientIp ?? '',
                },
          );
      })
      .catch(() => {
        if (!cancelled) setAccountStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateDraft = (key: keyof TelegraphDraftInput, value: string) => {
    if (senderLocked && (key === 'senderName' || key === 'senderAddress')) return;
    setDraft((current) => {
      const next = { ...current, [key]: value };
      const nextResult = evaluateTelegraphDraft(next);
      publishTelegraphDraftUpdated({
        draftId: serialNumber,
        billableGrids: nextResult.billableGrids,
        amount: nextResult.amount,
        destination: nextResult.destination,
        recipient: nextResult.recipient,
        bodyLength: next.body.length,
      });
      return next;
    });
    setError('');
  };

  const updateGridValue = (
    field: 'recipientInfo' | 'body',
    index: number,
    value: string,
    isComposing = false,
  ) => {
    const normalized = isComposing ? value.slice(0, 20) : normalizeGridCellValue(value);
    const setter = field === 'recipientInfo' ? setRecipientGridValues : setBodyGridValues;
    setter((current) => {
      const next = [...current];
      next[index] = normalized;
      updateDraft(field, joinGridValues(next));
      return next;
    });
    setActiveCell({ field, index });
  };

  const commitGridComposition = (field: 'recipientInfo' | 'body', index: number, value: string) => {
    const chunks = splitGridInputChunks(value);
    const setter = field === 'recipientInfo' ? setRecipientGridValues : setBodyGridValues;
    setter((current) => {
      const next = [...current];
      let target = index;
      for (const chunk of chunks) {
        if (target >= next.length) break;
        if (target !== index) {
          while (target < next.length && next[target]) target += 1;
          if (target >= next.length) break;
        }
        next[target] = normalizeGridCellValue(chunk);
        target += 1;
      }
      updateDraft(field, joinGridValues(next));
      return next;
    });
    setActiveCell({ field, index });
  };

  const loadHistory = (record: TelegraphHistoryRecord) => {
    const canAnimateEnvelope = animationState === 'sealed' || animationState === 'opened';
    const nextDraft =
      senderLocked && (clientIp || clientIpLocation)
        ? {
            ...record.draft,
            senderName: clientIp,
            senderAddress: clientIpLocation || clientIp,
          }
        : record.draft;
    const applyHistoryRecord = (transitioning: boolean) => {
      setDraft(nextDraft);
      setRecipientGridValues(
        draftGridValues(nextDraft.recipientInfo, TELEGRAPH_MAX_RECIPIENT_GRIDS),
      );
      setBodyGridValues(draftGridValues(nextDraft.body, TELEGRAPH_MAX_BODY_GRIDS));
      setActiveCell(null);
      setSerialNumber(record.serialNumber);
      setGeneratedAt(record.generatedAt);
      setAnimationState('sealed');
      setReceiveCodeProgress(Number.MAX_SAFE_INTEGER);
      setReceiveTextProgress(Number.MAX_SAFE_INTEGER);
      setEnvelopeSide('back');
      setPaperView('receive');
      setPaperSwitching(false);
      setEnvelopeFlipping(false);
      setPrintStage('envelope');
      setShowActions(!transitioning);
      setBusy(transitioning);
      setHistoryOpen(false);
    };
    if (!canAnimateEnvelope || record.serialNumber === serialNumber) {
      stopAllSounds();
      runIdRef.current += 1;
      setHistoryEnvelopeTransition(null);
      applyHistoryRecord(false);
      return;
    }
    stopAllSounds();
    runIdRef.current += 1;
    const transitionId = runIdRef.current;
    if (historyTransitionTimerRef.current !== null) {
      window.clearTimeout(historyTransitionTimerRef.current);
    }
    setHistoryOpen(false);
    setBusy(true);
    setShowActions(false);
    setAnimationState('sealed');
    setEnvelopeSide('back');
    setPaperView('receive');
    setHistoryEnvelopeTransition('out');
    playPaperSound(
      'friction',
      TELEGRAPH_HISTORY_ENVELOPE_EXIT_MS + TELEGRAPH_HISTORY_ENVELOPE_ENTER_MS,
    );
    historyTransitionTimerRef.current = window.setTimeout(() => {
      if (runIdRef.current !== transitionId) return;
      applyHistoryRecord(true);
      setHistoryEnvelopeTransition('in');
      historyTransitionTimerRef.current = window.setTimeout(() => {
        if (runIdRef.current !== transitionId) return;
        historyTransitionTimerRef.current = null;
        setHistoryEnvelopeTransition(null);
        setBusy(false);
        setShowActions(true);
      }, TELEGRAPH_HISTORY_ENVELOPE_ENTER_MS);
    }, TELEGRAPH_HISTORY_ENVELOPE_EXIT_MS);
  };
  const fail = (message: string): boolean => {
    setError(message);
    publishToastRequested({ message, tone: 'warning' });
    return false;
  };
  const validateBeforePrint = (): boolean => {
    if (!result.destination) return fail('请先填写收报地点。');
    if (!draft.recipientInfo.trim()) return fail('请先填写收报人信息。');
    if (!draft.body.trim()) return fail('请先填写电报内容。');
    if (result.recipientCells.length > TELEGRAPH_MAX_RECIPIENT_GRIDS)
      return fail(`收报信息超过模板可容纳的 ${TELEGRAPH_MAX_RECIPIENT_GRIDS} 格。`);
    if (result.bodyCells.length > TELEGRAPH_MAX_BODY_GRIDS)
      return fail(`电报内容超过模板可容纳的 ${TELEGRAPH_MAX_BODY_GRIDS} 格。`);
    if (result.unsupportedCharacters.length)
      return fail(`暂不支持这些字符：${result.unsupportedCharacters.join('、')}`);
    return true;
  };
  const requestPrint = (saveHistory = true): boolean => {
    if (!busy && validateBeforePrint()) {
      setSaveHistoryOnPrint(saveHistory);
      setConfirmOpen(true);
      return true;
    }
    return false;
  };
  const publishStage = (stage: TelegraphPrintStage, draftId = serialNumber) => {
    setPrintStage(stage);
    publishTelegraphPrintProgress({
      draftId,
      stage,
      progress: Math.round(
        ((printStages.findIndex((item) => item.id === stage) + 1) / printStages.length) * 100,
      ),
    });
  };

  const startPrint = async () => {
    setConfirmOpen(false);
    if (busy || !validateBeforePrint()) return;
    stopAllSounds();
    const nextSerial = saveHistoryOnPrint ? createTelegraphSerial() : serialNumber;
    const nextGeneratedAt = saveHistoryOnPrint ? new Date().toISOString() : generatedAt;
    const nextReceiveDocument = buildTelegraphReceiveDocument(
      effectiveDraft,
      result,
      nextSerial,
      nextGeneratedAt,
    );
    const nextReceiveTimelineCount = nextReceiveDocument.codeTokens.reduce(
      (total, token) => Math.max(total, (token.progressIndex ?? -1) + 1),
      0,
    );
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrent = () => runIdRef.current === runId;
    const pause = async (ms: number) => {
      await wait(ms);
      return isCurrent();
    };
    setSerialNumber(nextSerial);
    setGeneratedAt(nextGeneratedAt);
    setBusy(true);
    setShowActions(false);
    setPaperEntering(false);
    setReceiveCodeProgress(0);
    setReceiveTextProgress(0);
    setEnvelopeSide('front');
    setPaperView('receive');
    setPaperSwitching(false);
    setEnvelopeFlipping(false);
    setAnimationState('filling');
    publishStage('header', nextSerial);
    publishTelegraphPrintStarted({
      draftId: nextSerial,
      serialNumber: nextSerial,
      generatedAt: nextGeneratedAt,
    });
    setAutoFillCharacterCount(0);
    if (saveHistoryOnPrint) {
      await saveTelegraphHistory({
        id: nextSerial,
        draft: effectiveDraft,
        serialNumber: nextSerial,
        generatedAt: nextGeneratedAt,
        updatedAt: nextGeneratedAt,
      });
      if (!isCurrent()) return;
      setHistory(await listTelegraphHistory());
    }
    if (automaticFillCharacterTotal > 0) {
      playPaperSound(
        'writing',
        automaticFillCharacterTotal * TELEGRAPH_AUTO_FILL_CHARACTER_MS + 180,
      );
      for (let index = 1; index <= automaticFillCharacterTotal; index += 1) {
        if (!(await pause(TELEGRAPH_AUTO_FILL_CHARACTER_MS))) return;
        setAutoFillCharacterCount(index);
      }
    }
    for (const [stage, duration] of [
      ['recipient', 180],
      ['code', 180],
      ['message', 180],
      ['footer', 150],
      ['stamp', 220],
    ] as const) {
      publishStage(stage, nextSerial);
      if (!(await pause(duration))) return;
    }
    if (!(await pause(1000))) return;
    setAnimationState('sending');
    playPaperSound('page', TELEGRAPH_SEND_FLIGHT_MS);
    if (!(await pause(TELEGRAPH_SEND_FLIGHT_MS))) return;
    const receiveAudio = await createMorseWav(nextReceiveDocument.codeTokens);
    if (!isCurrent()) return;
    setAnimationState('receiving');
    playPaperSound('page', 680);
    publishStage('code', nextSerial);
    const playback = playGeneratedMorseAudio(
      receiveAudio,
      nextReceiveDocument.codeText,
      nextReceiveTimelineCount,
      (completedSteps) => {
        setReceiveCodeProgress(completedSteps);
        window.setTimeout(() => {
          if (isCurrent()) setReceiveTextProgress(completedSteps);
        }, 100);
      },
    );
    audioStopRef.current = playback.stop;
    await playback.promise;
    audioStopRef.current = null;
    if (!isCurrent()) return;
    setReceiveCodeProgress(nextReceiveTimelineCount);
    setReceiveTextProgress(nextReceiveTimelineCount);
    publishStage('message', nextSerial);
    if (!(await pause(1000))) return;
    publishStage('footer', nextSerial);
    if (!(await pause(300))) return;
    publishStage('stamp', nextSerial);
    if (!(await pause(300))) return;
    setAnimationState('folding');
    setEnvelopeSide('back');
    playPaperSound('page', TELEGRAPH_FOLDING_MS);
    if (!(await pause(TELEGRAPH_FOLDING_MS))) return;
    setAnimationState('sealed');
    publishStage('envelope', nextSerial);
    setShowActions(true);
    setBusy(false);
    publishToastRequested({ message: '电报已打印并装入信封。', tone: 'success' });
  };
  const skipAnimation = () => {
    if (!busy) return;
    runIdRef.current += 1;
    stopAllSounds();
    setReceiveCodeProgress(Number.MAX_SAFE_INTEGER);
    setReceiveTextProgress(Number.MAX_SAFE_INTEGER);
    setEnvelopeSide('back');
    setPaperView('receive');
    setPaperSwitching(false);
    setEnvelopeFlipping(false);
    setAnimationState('sealed');
    setPrintStage('envelope');
    setShowActions(true);
    setBusy(false);
    publishToastRequested({ message: '已跳过动画，电报已装入信封。', tone: 'success' });
  };
  const openReceive = () => {
    if (animationState !== 'sealed' || envelopeFlipping) return;
    const transitionId = runIdRef.current + 1;
    runIdRef.current = transitionId;
    setPaperView('receive');
    setPaperSwitching(false);
    setEnvelopeFlipping(false);
    setShowActions(false);
    setBusy(true);
    setAnimationState('opening');
    stopAllSounds();
    const soundPhaseMs = Math.floor(TELEGRAPH_ENVELOPE_TRANSITION_MS / 2);
    playPaperSound('friction', soundPhaseMs);
    schedulePaperSound('page', soundPhaseMs, soundPhaseMs + 80, transitionId);
    window.setTimeout(() => {
      if (runIdRef.current !== transitionId) return;
      setEnvelopeSide('front');
    }, TELEGRAPH_ENVELOPE_SIDE_SWAP_MS);
    window.setTimeout(() => {
      if (runIdRef.current !== transitionId) return;
      setAnimationState('opened');
      setShowActions(true);
      setBusy(false);
    }, TELEGRAPH_ENVELOPE_TRANSITION_MS);
  };
  const packReceive = () => {
    if (animationState !== 'opened') return;
    const transitionId = runIdRef.current + 1;
    runIdRef.current = transitionId;
    setShowActions(false);
    setBusy(true);
    setPaperView('receive');
    setPaperSwitching(false);
    setEnvelopeFlipping(false);
    setAnimationState('packing');
    stopAllSounds();
    const soundPhaseMs = Math.floor(TELEGRAPH_ENVELOPE_TRANSITION_MS / 2);
    playPaperSound('page', soundPhaseMs);
    schedulePaperSound('friction', soundPhaseMs, soundPhaseMs + 80, transitionId);
    window.setTimeout(() => {
      if (runIdRef.current !== transitionId) return;
      setEnvelopeSide('back');
    }, TELEGRAPH_ENVELOPE_SIDE_SWAP_MS);
    window.setTimeout(() => {
      if (runIdRef.current !== transitionId) return;
      setAnimationState('sealed');
      setShowActions(true);
      setBusy(false);
    }, TELEGRAPH_ENVELOPE_TRANSITION_MS);
  };

  const switchPaperView = (view: 'receive' | 'send') => {
    if (animationState !== 'opened' || paperView === view) return;
    if (paperSwitchTimerRef.current !== null) {
      window.clearTimeout(paperSwitchTimerRef.current);
    }
    setPaperView(view);
    setPaperSwitching(true);
    playPaperSound('page', 420);
    paperSwitchTimerRef.current = window.setTimeout(() => {
      paperSwitchTimerRef.current = null;
      setPaperSwitching(false);
    }, 420);
  };

  const flipEnvelope = () => {
    if (animationState !== 'sealed' || envelopeFlipping) return;
    const transitionId = runIdRef.current + 1;
    runIdRef.current = transitionId;
    const nextSide = envelopeSide === 'back' ? 'front' : 'back';
    setEnvelopeFlipping(true);
    setBusy(true);
    playPaperSound('page', TELEGRAPH_MANUAL_FLIP_MS);
    window.setTimeout(() => {
      if (runIdRef.current !== transitionId) return;
      setEnvelopeSide(nextSide);
    }, TELEGRAPH_MANUAL_FLIP_SWAP_MS);
    window.setTimeout(() => {
      if (runIdRef.current !== transitionId) return;
      setEnvelopeFlipping(false);
      setBusy(false);
    }, TELEGRAPH_MANUAL_FLIP_MS);
  };

  const downloadPaper = async (paper: 'send' | 'receive') => {
    if (!validateBeforePrint()) return;
    setBusy(true);
    try {
      const response = await fetch(appPath('/api/telegraph/render'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper, draft: effectiveDraft, serialNumber, generatedAt }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? '电报图片生成失败。');
      }
      triggerDownload(
        await response.blob(),
        `电报-${paper === 'send' ? '发报纸' : '收报纸'}-${serialNumber}.png`,
      );
      publishTelegraphArtifactDownloaded({
        draftId: serialNumber,
        artifact: paper === 'send' ? 'send-paper' : 'receive-paper',
        anonymous: accountStatus !== 'active',
      });
    } catch (downloadError) {
      publishToastRequested({
        message: downloadError instanceof Error ? downloadError.message : '电报图片下载失败。',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  const downloadCode = () => {
    if (!validateBeforePrint()) return;
    const content = `雨城通电报体验\n流水号：${serialNumber}\n生成时间：${generatedAt}\n计费格数：${result.billableGrids}\n报费详情：${result.amount.toFixed(2)}\n\n${receiveDocument.codeText}\n`;
    triggerDownload(
      new Blob([content], { type: 'text/plain;charset=utf-8' }),
      `电报电码-${serialNumber}.txt`,
    );
    publishTelegraphArtifactDownloaded({
      draftId: serialNumber,
      artifact: 'code-text',
      anonymous: accountStatus !== 'active',
    });
  };
  const downloadAudio = async () => {
    if (!validateBeforePrint()) return;
    triggerDownload(
      await createMorseWav(receiveDocument.codeTokens),
      `电报电码-${serialNumber}.wav`,
    );
    publishTelegraphArtifactDownloaded({
      draftId: serialNumber,
      artifact: 'audio',
      anonymous: accountStatus !== 'active',
    });
  };
  const isPageAtTop = () => window.scrollY <= 18;
  const isPageAtBottom = () => {
    const root = document.documentElement;
    const body = document.body;
    const scrollHeight = Math.max(root.scrollHeight, body.scrollHeight);
    return window.scrollY + window.innerHeight >= scrollHeight - 18;
  };
  const returnToWelcome = () => {
    if (busy || animationState !== 'editing') return;
    stopAllSounds();
    runIdRef.current += 1;
    if (paperEnterTimerRef.current !== null) {
      window.clearTimeout(paperEnterTimerRef.current);
      paperEnterTimerRef.current = null;
    }
    setConfirmOpen(false);
    setActiveCell(null);
    setPaperEntering(false);
    setAnimationState('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStartY.current = event.clientY;
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const startY = swipeStartY.current;
    swipeStartY.current = null;
    if (startY === null || busy || confirmOpen || paperEntering) return;
    const deltaY = startY - event.clientY;
    if (animationState === 'welcome' && deltaY > 70 && isPageAtBottom()) {
      event.preventDefault();
      beginDraft();
      return;
    }
    if (animationState === 'editing' && deltaY < -70 && isPageAtTop()) {
      event.preventDefault();
      returnToWelcome();
      return;
    }
    if (deltaY > 70 && animationState === 'editing' && isSendPaperAtEnd()) requestPrint();
  };
  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (busy || confirmOpen || paperEntering || Math.abs(event.deltaY) <= 30) return;
    if (animationState === 'welcome' && event.deltaY > 30 && isPageAtBottom()) {
      event.preventDefault();
      beginDraft();
      return;
    }
    if (animationState === 'editing' && event.deltaY < -30 && isPageAtTop()) {
      event.preventDefault();
      returnToWelcome();
      return;
    }
    // 鼠标滚轮向下会让页面继续向发报纸末尾移动；到达末尾后再滚一次才进入确认。
    if (event.deltaY > 30 && animationState === 'editing' && isSendPaperAtEnd()) {
      if (requestPrint()) event.preventDefault();
    }
  };
  const isSendPaperAtEnd = () => {
    const paper = document.querySelector<HTMLElement>(
      '.telegraph-send-stage .telegraph-send-paper',
    );
    if (!paper) return false;
    return paper.getBoundingClientRect().bottom <= window.innerHeight + 16;
  };
  const paperClassName = [
    'telegraph-send-stage',
    paperEntering ? 'is-entering' : '',
    animationState === 'filling' ? 'is-filling' : '',
    animationState === 'sending' ? 'is-flying-up' : '',
    ['receiving', 'folding', 'sealed', 'opening', 'opened', 'packing'].includes(animationState)
      ? 'is-sent'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`telegraph-studio ${animationState === 'welcome' ? 'is-welcome' : ''}`}
      onWheel={handleWheel}
    >
      {paperEntering ? (
        <div className="telegraph-building-backdrop is-exiting" aria-hidden="true" />
      ) : null}
      {animationState === 'welcome' ? (
        <>
          <section
            className="telegraph-welcome"
            aria-labelledby="telegraph-welcome-title"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            <div className="telegraph-welcome-copy">
              <TelegraphWelcomeCode
                groups={welcomeCodeGroups}
                autoPlay={!welcomeCodeHasPlayed}
                onStart={handleWelcomeCodeStart}
                onComplete={handleWelcomeCodeComplete}
              />
              <h1 id="telegraph-welcome-title">趁“慢电报”还未消失，将记忆拍给自己</h1>
              <p>
                一条视频，让人们发现了电报这个尘封已久的通讯业务。
                <br />
                如今，就算发报窗口全中国仅剩一个，人们仍愿为一封还需编发、盖章、封装的慢电报留出时间。
                <br />
                那么现在，就在这里亲手写下你的讯息，让它沿着尘封的路线，延续你的思绪和情感……
              </p>
              <div className="telegraph-welcome-actions">
                <button
                  className="secondary-action-button is-primary"
                  type="button"
                  onClick={() => beginDraft()}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    edit_note
                  </span>
                  开始填写
                </button>
                {welcomeCodeComplete ? (
                  <button
                    className="secondary-action-button telegraph-welcome-replay"
                    type="button"
                    onClick={() => welcomeReplayRef.current?.()}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      replay
                    </span>
                    重播动画
                  </button>
                ) : null}
              </div>
            </div>
            <div className="telegraph-building-backdrop" aria-hidden="true" />
          </section>
          <div className="telegraph-swipe-hint telegraph-welcome-swipe-hint" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">
              keyboard_double_arrow_down
            </span>
            <span>{scrollHints.welcomeAtBottom ? '继续滚动，开始填写' : '继续滚动'}</span>
          </div>
        </>
      ) : (
        <section
          className={paperClassName}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div className="telegraph-paper telegraph-send-paper">
            <img src={appPath('/telegraph/send-paper-template.png')} alt="电报发报纸模板" />
            <div className="telegraph-paper-value telegraph-stat-count">
              {getAutomaticFillValue(0)}
            </div>
            <div className="telegraph-paper-value telegraph-stat-fare">
              {getAutomaticFillValue(1)}
            </div>
            <div className="telegraph-paper-value telegraph-flow">{getAutomaticFillValue(2)}</div>
            <div className="telegraph-paper-value telegraph-out-date">
              {getAutomaticFillValue(3)}
            </div>
            <div className="telegraph-paper-value telegraph-out-time">
              {getAutomaticFillValue(4)}
            </div>
            <div className="telegraph-paper-value telegraph-office">{getAutomaticFillValue(5)}</div>
            <div className="telegraph-paper-value telegraph-destination-province">
              {draft.province}
            </div>
            <div className="telegraph-paper-value telegraph-destination-city">{draft.city}</div>
            <div className="telegraph-paper-value telegraph-destination-county">
              {draft.county || draft.district}
            </div>
            <PaperInput
              className="telegraph-input-province"
              aria-label="省"
              value={draft.province}
              onChange={(value) => updateDraft('province', value)}
              maxLength={20}
              inputRef={(element) => {
                firstInputRef.current = element;
              }}
            />
            <PaperInput
              className="telegraph-input-city"
              aria-label="市"
              value={draft.city}
              onChange={(value) => updateDraft('city', value)}
              maxLength={20}
            />
            <PaperInput
              className="telegraph-input-county"
              aria-label="县"
              value={draft.county}
              onChange={(value) => updateDraft('county', value)}
              maxLength={20}
            />
            <PaperInput
              className="telegraph-input-district"
              aria-label="其他收报地点"
              value={draft.district}
              onChange={(value) => updateDraft('district', value)}
              maxLength={20}
            />
            <GridPreview
              cells={result.recipientCells}
              className="telegraph-recipient-grid"
              rows={2}
            />
            <GridPreview cells={result.bodyCells} className="telegraph-body-grid" rows={5} />
            <PaperCellInputGrid
              className="telegraph-recipient-input-grid"
              label="收报信息"
              values={recipientGridValues}
              onChange={(index, value, isComposing) =>
                updateGridValue('recipientInfo', index, value, isComposing)
              }
              onCompositionCommit={(index, value) =>
                commitGridComposition('recipientInfo', index, value)
              }
              onFocus={(index) => setActiveCell({ field: 'recipientInfo', index })}
              activeIndex={activeCell?.field === 'recipientInfo' ? activeCell.index : null}
              rows={2}
            />
            <PaperCellInputGrid
              className="telegraph-body-input-grid"
              label="电报正文"
              values={bodyGridValues}
              onChange={(index, value, isComposing) =>
                updateGridValue('body', index, value, isComposing)
              }
              onCompositionCommit={(index, value) => commitGridComposition('body', index, value)}
              onFocus={(index) => setActiveCell({ field: 'body', index })}
              activeIndex={activeCell?.field === 'body' ? activeCell.index : null}
              rows={5}
            />
            <PaperInput
              className="telegraph-input-sender-name"
              aria-label="发报人姓名或游客 IP"
              value={senderDisplayName}
              onChange={(value) => updateDraft('senderName', value)}
              maxLength={40}
              disabled={senderLocked}
            />
            <PaperInput
              className="telegraph-input-sender-address"
              aria-label="发报人地址"
              value={senderDisplayAddress}
              onChange={(value) => updateDraft('senderAddress', value)}
              maxLength={60}
              disabled={senderLocked}
            />
            <div
              className={`telegraph-paper-value telegraph-sender-name ${senderLocked ? 'is-locked' : ''}`}
            >
              {senderDisplayName}
            </div>
            <div className="telegraph-paper-value telegraph-sender-address">
              {senderDisplayAddress}
            </div>
            {senderLocked ? (
              <span className="telegraph-sender-lock">登录后可修改发报人信息</span>
            ) : null}
          </div>
          <div className="telegraph-paper-tools">
            <div className="telegraph-paper-summary" aria-live="polite">
              <span>
                计费格数 <strong>{result.billableGrids}</strong>
              </span>
              <span>
                报费详情 <strong>{result.amount.toFixed(2)}</strong>
              </span>
              <span>连续字母/数字每 5 个一格</span>
              <span className="telegraph-grid-cursor" aria-live="polite">
                {activeCell
                  ? `${activeCell.field === 'recipientInfo' ? '收报信息' : '电报正文'} · 第 ${activeCell.index + 1} 格`
                  : '当前格：未选择'}
              </span>
            </div>
            <div className="telegraph-paper-actions">
              <button
                className="secondary-action-button is-primary"
                type="button"
                onClick={() => requestPrint()}
                disabled={busy}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  send
                </span>
                模拟拍发
              </button>
              {busy ? (
                <button className="secondary-action-button" type="button" onClick={skipAnimation}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    fast_forward
                  </span>
                  跳过动画
                </button>
              ) : null}
            </div>
            {animationState === 'editing' && scrollHints.sendPaperAtEnd && !busy ? (
              <div className="telegraph-swipe-hint telegraph-send-swipe-hint" role="status">
                <span className="material-symbols-outlined" aria-hidden="true">
                  keyboard_double_arrow_down
                </span>
                <span>继续滚动，进入确认拍发</span>
              </div>
            ) : null}
            {error ? (
              <p className="telegraph-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </section>
      )}

      {outputVisible ? (
        <section
          ref={outputRef}
          className={`telegraph-output-section is-${animationState}`}
          aria-live="polite"
        >
          <div
            className={`telegraph-output-grid telegraph-output-scene is-${animationState} is-view-${paperView} ${paperSwitching ? 'is-paper-switching' : ''} ${envelopeFlipping ? 'is-envelope-flipping' : ''} ${historyEnvelopeTransition ? `is-history-envelope-${historyEnvelopeTransition}` : ''}`}
          >
            <div
              className={`telegraph-receive-paper-shell ${animationState === 'folding' || animationState === 'sealed' ? 'is-folded' : ''}`}
              style={
                {
                  '--telegraph-sealed-paper-top': `calc(50% - ${112 + receiveRecipientRowCount * 21}px)`,
                } as CSSProperties
              }
            >
              <div
                className="telegraph-paper telegraph-receive-paper"
                role={animationState === 'opened' ? 'button' : undefined}
                tabIndex={animationState === 'opened' ? 0 : undefined}
                aria-label={animationState === 'opened' ? '切换到发报纸' : undefined}
                onClick={() => {
                  switchPaperView('send');
                }}
                onKeyDown={(event) => {
                  if (animationState === 'opened' && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    switchPaperView('send');
                  }
                }}
              >
                <div className="telegraph-receive-header">
                  <code>
                    {renderReceivePaperTextLine(
                      receiveDocument.header,
                      receiveDocument.codeTokens,
                      'header',
                      receiveCodeProgress,
                      animationState,
                    )}
                  </code>
                  <code>
                    {renderReceivePaperTextLine(
                      receiveDocument.protocolLine,
                      receiveDocument.codeTokens,
                      'protocol',
                      receiveCodeProgress,
                      animationState,
                    )}
                  </code>
                </div>
                <div className="telegraph-receive-rows">
                  {(() => {
                    let cellIndex = 0;
                    return receiveDocument.rows.map((row, rowIndex) => {
                      if (row.cells.length === 0) {
                        return (
                          <div
                            className="telegraph-receive-row is-spacer"
                            key={`spacer-${rowIndex}`}
                          />
                        );
                      }
                      return (
                        <div className="telegraph-receive-row" key={`${row.code}-${rowIndex}`}>
                          {row.cells.map((cell) => {
                            const currentIndex = cellIndex;
                            cellIndex += 1;
                            const codeValue = getReceiveCellCodeValue(
                              receiveDocument.codeTokens,
                              receiveCells,
                              currentIndex,
                              receiveCodeProgress,
                            );
                            const textValue = getReceiveCellTextValue(
                              receiveDocument.codeTokens,
                              receiveCells,
                              currentIndex,
                              receiveTextProgress,
                            );
                            return (
                              <span
                                className="telegraph-receive-cell"
                                key={`${currentIndex}-${cell.value}`}
                                style={{ gridColumn: `span ${cell.gridSpan ?? 1}` }}
                              >
                                <code
                                  className={`telegraph-receive-cell-code telegraph-print-segment ${codeValue ? 'is-visible' : ''}`}
                                >
                                  {codeValue || '\u00a0'}
                                </code>
                                <span
                                  className={`telegraph-receive-cell-text ${cell.alphanumericRun ? 'is-compressed' : ''} telegraph-print-segment ${textValue ? 'is-visible' : ''}`}
                                >
                                  {textValue || '\u00a0'}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
                <code className="telegraph-receive-terminator">
                  {renderReceiveCodeLine(
                    receiveDocument.codeTokens,
                    'terminator',
                    receiveCodeProgress,
                    animationState,
                  )}
                </code>
              </div>
            </div>
            {animationState === 'opening' || animationState === 'opened' ? (
              <TelegraphSendPaperPreview
                draft={effectiveDraft}
                result={result}
                date={date}
                serialNumber={serialNumber}
                onClick={() => switchPaperView('receive')}
              />
            ) : null}
            <div
              className={`telegraph-envelope-wrap ${envelopeSide === 'back' ? 'is-back' : 'is-front'} ${animationState === 'folding' ? 'is-folding' : ''} ${animationState === 'sealed' ? 'is-sealed' : ''} ${animationState === 'opening' ? 'is-opening' : ''} ${animationState === 'packing' ? 'is-packing' : ''}`}
            >
              <button
                className="telegraph-envelope-button"
                type="button"
                disabled={
                  envelopeFlipping || (animationState !== 'sealed' && animationState !== 'opened')
                }
                onClick={() => {
                  if (animationState === 'sealed') openReceive();
                  if (animationState === 'opened') packReceive();
                }}
                aria-label={
                  animationState === 'sealed'
                    ? '打开信封查看收报纸'
                    : animationState === 'opened'
                      ? '将收报纸装入信封'
                      : undefined
                }
              >
                <div className="telegraph-envelope">
                  <img
                    src={appPath(
                      envelopeSide === 'back'
                        ? '/telegraph/envelope-back-cutout.svg'
                        : '/telegraph/envelope-front.svg',
                    )}
                    alt={envelopeSide === 'front' ? '电报信封正面' : '电报信封背面'}
                  />
                </div>
              </button>
            </div>
          </div>
          <div className="telegraph-floating-toolbar" role="toolbar" aria-label="电报操作">
            <span className="telegraph-floating-status">
              {envelopeFlipping
                ? '翻转信封'
                : animationState === 'opening'
                  ? '打开信封'
                  : animationState === 'packing'
                    ? '装入信封'
                    : (printStages.find((stage) => stage.id === printStage)?.label ?? '收报纸')}
            </span>
            {outputSkipVisible ? (
              <button className="secondary-action-button" type="button" onClick={skipAnimation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  fast_forward
                </span>
                跳过动画
              </button>
            ) : null}
            {animationState === 'opened' ? (
              <div className="telegraph-paper-view-toggle" role="group" aria-label="切换纸张">
                <button
                  className={paperView === 'receive' ? 'is-active' : ''}
                  type="button"
                  aria-pressed={paperView === 'receive'}
                  onClick={() => switchPaperView('receive')}
                >
                  收报纸
                </button>
                <button
                  className={paperView === 'send' ? 'is-active' : ''}
                  type="button"
                  aria-pressed={paperView === 'send'}
                  onClick={() => switchPaperView('send')}
                >
                  发报纸
                </button>
              </div>
            ) : null}
            {animationState === 'sealed' ? (
              <button
                className="secondary-action-button telegraph-envelope-flip-button"
                type="button"
                onClick={flipEnvelope}
                disabled={envelopeFlipping}
                aria-label={envelopeSide === 'back' ? '翻到信封正面' : '翻到信封背面'}
                title={envelopeSide === 'back' ? '翻到信封正面' : '翻到信封背面'}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  flip
                </span>
                信封翻面
              </button>
            ) : null}
            {showActions ? (
              <div className="telegraph-floating-actions telegraph-export-actions">
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => void downloadPaper('send')}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    outbox
                  </span>
                  发报纸
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => void downloadPaper('receive')}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    inbox
                  </span>
                  收报纸
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={downloadCode}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    content_copy
                  </span>
                  电码
                </button>
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => void downloadAudio()}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    audio_file
                  </span>
                  音频
                </button>
                {animationState === 'opened' ? (
                  <button className="secondary-action-button" type="button" onClick={packReceive}>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      inventory_2
                    </span>
                    装入信封
                  </button>
                ) : null}
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => requestPrint(false)}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    replay
                  </span>
                  重播动画
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {confirmOpen ? (
        <div className="modal-backdrop telegraph-confirm-overlay" role="presentation">
          <section
            className="modal-panel telegraph-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="telegraph-confirm-title"
          >
            <div className="telegraph-output-heading">
              <div>
                <span className="eyebrow">READY TO SEND</span>
                <h2 id="telegraph-confirm-title">确认发报内容</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭确认窗口"
                onClick={() => setConfirmOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <div className="telegraph-confirm-summary">
              <div>
                <span>收报地点</span>
                <strong>{result.destination || '未填写'}</strong>
              </div>
              <div>
                <span>收报人</span>
                <strong>{draft.recipientInfo || '未填写'}</strong>
              </div>
              <div>
                <span>计费格数</span>
                <strong>{result.billableGrids}</strong>
              </div>
              <div>
                <span>报费详情</span>
                <strong>{result.amount.toFixed(2)}</strong>
              </div>
            </div>
            <div>
              <span className="telegraph-confirm-label">报文内容</span>
              <pre className="telegraph-confirm-message">{draft.body || '未填写'}</pre>
            </div>
            <p>确认后将开始填写、打印、折叠并装入信封的模拟动画。</p>
            <div className="telegraph-confirm-actions">
              <button
                className="secondary-action-button"
                type="button"
                onClick={() => setConfirmOpen(false)}
              >
                返回修改
              </button>
              <button
                className="secondary-action-button is-primary"
                type="button"
                onClick={() => void startPrint()}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  send
                </span>
                确认并拍发
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {historyOpen ? (
        <div
          className="telegraph-history-overlay"
          role="presentation"
          onClick={() => setHistoryOpen(false)}
        >
          <aside
            className="telegraph-history-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="telegraph-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="telegraph-output-heading">
              <div>
                <h2 id="telegraph-history-title">本机历史</h2>
              </div>
            </div>
            {history.length ? (
              history.map((record) => (
                <div className="telegraph-history-row" key={record.id}>
                  <button type="button" onClick={() => loadHistory(record)}>
                    <strong>{record.draft.recipientInfo || '未命名电报'}</strong>
                    <span>
                      {record.generatedAt.slice(0, 16).replace('T', ' ')} · {record.serialNumber}
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="删除历史记录"
                    onClick={() =>
                      void deleteTelegraphHistory(record.id).then(() =>
                        listTelegraphHistory().then(setHistory),
                      )
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      delete
                    </span>
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">还没有本机历史记录。</p>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );

  function stopAllSounds() {
    audioStopRef.current?.();
    audioStopRef.current = null;
    for (const stop of soundStopsRef.current.splice(0)) stop();
    for (const timerId of paperSoundTimerRef.current) window.clearTimeout(timerId);
    paperSoundTimerRef.current.clear();
  }
  function playPaperSound(sound: TelegraphPaperSound, durationMs: number) {
    const stop = createTelegraphPaperSound(sound, durationMs);
    if (!stop) return;
    soundStopsRef.current.push(stop);
    window.setTimeout(() => {
      soundStopsRef.current = soundStopsRef.current.filter((item) => item !== stop);
    }, durationMs + 80);
  }
  function schedulePaperSound(
    sound: TelegraphPaperSound,
    delayMs: number,
    durationMs: number,
    runId?: number,
  ) {
    const timerId = window.setTimeout(() => {
      paperSoundTimerRef.current.delete(timerId);
      if (runId !== undefined && runIdRef.current !== runId) return;
      playPaperSound(sound, durationMs);
    }, delayMs);
    paperSoundTimerRef.current.add(timerId);
  }
}

function PaperInput({
  className,
  value,
  onChange,
  maxLength,
  disabled = false,
  inputRef,
  ...props
}: Readonly<{
  className: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
  inputRef?: (element: HTMLInputElement | null) => void;
  'aria-label': string;
}>) {
  return (
    <input
      {...props}
      ref={inputRef}
      className={`telegraph-paper-input ${className}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      maxLength={maxLength}
      disabled={disabled}
    />
  );
}

function TelegraphWelcomeCode({
  groups,
  autoPlay,
  onStart,
  onComplete,
}: Readonly<{
  groups: Array<{ character: string; code: string }>;
  autoPlay: boolean;
  onStart: () => void;
  onComplete: (replay: () => void) => void;
}>) {
  const totalSteps = groups.length * 4;
  const [progress, setProgress] = useState(autoPlay ? 0 : totalSteps);
  const playbackRef = useRef<{ stop: () => void } | null>(null);
  const runIdRef = useRef(0);
  const startPlayback = useCallback(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    playbackRef.current?.stop();
    playbackRef.current = null;
    setProgress(0);
    onStart();
    const tokens = groups.flatMap((group, index) => [
      ...Array.from(group.code).map((digit) => ({
        display: digit,
        kind: 'digit' as const,
        line: 'content' as const,
        progressIndex: null,
      })),
      ...(index < groups.length - 1
        ? [
            {
              display: ' ',
              kind: 'space' as const,
              line: 'content' as const,
              progressIndex: null,
              spaceKind: 'character' as const,
            },
          ]
        : []),
    ]);
    void createMorseWav(tokens).then((audioBlob) => {
      if (runIdRef.current !== runId) return;
      const playback = playGeneratedMorseAudio(
        audioBlob,
        tokens.map((token) => token.display).join(''),
        totalSteps,
        (nextProgress) => {
          if (runIdRef.current === runId) setProgress(nextProgress);
        },
      );
      playbackRef.current = playback;
      void playback.promise.then(() => {
        if (runIdRef.current !== runId) return;
        playbackRef.current = null;
        setProgress(totalSteps);
        onComplete(startPlayback);
      });
    });
  }, [groups, onComplete, onStart, totalSteps]);

  useEffect(() => {
    if (autoPlay) {
      startPlayback();
    } else {
      setProgress(totalSteps);
      onComplete(startPlayback);
    }
    return () => {
      runIdRef.current += 1;
      playbackRef.current?.stop();
      playbackRef.current = null;
    };
  }, [autoPlay, onComplete, startPlayback, totalSteps]);

  return (
    <div className="telegraph-welcome-code-wrap">
      <div className="telegraph-welcome-code" aria-hidden="true">
        {groups.map((group, index) => {
          const groupProgress = progress - index * 4;
          const visibleDigits = Math.max(0, Math.min(4, groupProgress));
          const guess =
            visibleDigits > 0 && visibleDigits < 4
              ? inferTelegraphCharacter(group.code, visibleDigits)
              : '';
          const textValue = visibleDigits >= 4 ? group.character : guess ? `${guess}…` : '';
          return (
            <span className="telegraph-welcome-code-group" key={`${group.character}-${group.code}`}>
              <code className={`telegraph-print-segment ${visibleDigits ? 'is-visible' : ''}`}>
                {visibleDigits ? group.code.slice(0, visibleDigits) : '\u00a0'}
              </code>
              <span
                className={`telegraph-welcome-code-text telegraph-print-segment ${textValue ? 'is-visible' : ''}`}
              >
                {textValue || '\u00a0'}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PaperCellInputGrid({
  className,
  label,
  values,
  onChange,
  onCompositionCommit,
  onFocus,
  activeIndex,
  rows,
}: Readonly<{
  className: string;
  label: string;
  values: string[];
  onChange: (index: number, value: string, isComposing: boolean) => void;
  onCompositionCommit: (index: number, value: string) => void;
  onFocus: (index: number) => void;
  activeIndex: number | null;
  rows: number;
}>) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const composingRef = useRef(false);
  const cellCount = rows * 10;

  const focusCell = (index: number) => {
    if (index < 0 || index >= cellCount) return;
    inputRefs.current[index]?.focus();
  };

  const focusAfterEnteredText = (
    index: number,
    nextValue: string,
    sourceInput: HTMLInputElement,
  ) => {
    if (document.activeElement !== sourceInput) return;
    const nextValues = inputRefs.current.map((input) => input?.value ?? '');
    nextValues[index] = nextValue;
    let target = index + 1;
    while (target < cellCount && nextValues[target]) target += 1;
    focusCell(target < cellCount ? target : Math.max(0, cellCount - 1));
  };

  const focusAfterComposition = (index: number, value: string, sourceInput: HTMLInputElement) => {
    if (document.activeElement !== sourceInput) return;
    const chunks = splitGridInputChunks(value);
    const currentValues = inputRefs.current.map((input) => input?.value ?? '');
    let target = index + 1;
    for (let chunkIndex = 1; chunkIndex < chunks.length; chunkIndex += 1) {
      while (target < cellCount) {
        if (!currentValues[target] || currentValues[target] === chunks[chunkIndex]) {
          target += 1;
          break;
        }
        target += 1;
      }
    }
    while (target < cellCount && currentValues[target]) target += 1;
    focusCell(target < cellCount ? target : Math.max(0, cellCount - 1));
  };

  return (
    <div className={`telegraph-cell-input-grid ${className}`} role="group" aria-label={label}>
      {Array.from({ length: cellCount }, (_, index) => {
        const value = values[index] ?? '';
        const rowIndex = Math.floor(index / 10);
        const columnIndex = index % 10;
        return (
          <input
            key={index}
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            className={`telegraph-cell-input ${activeIndex === index ? 'is-active' : ''}`}
            aria-label={`${label}第${index + 1}格`}
            inputMode="text"
            maxLength={20}
            value={value}
            style={{ gridRow: rowIndex * 2 + 1, gridColumn: columnIndex + 1 }}
            onFocus={() => onFocus(index)}
            onChange={(event) => {
              const nativeIsComposing = (event.nativeEvent as InputEvent).isComposing;
              const isComposing = composingRef.current || nativeIsComposing;
              const nextValue = isComposing
                ? event.target.value.slice(0, 20)
                : normalizeGridCellValue(event.target.value);
              const nextIsAlphaNumeric =
                nextValue.length > 0 &&
                Array.from(nextValue).every((character) => /^[A-Za-z0-9]$/.test(character));
              const nextShouldAdvance = nextIsAlphaNumeric
                ? nextValue.length >= 5
                : nextValue.length > 0;
              onChange(index, nextValue, isComposing);
              if (!isComposing && nextShouldAdvance) {
                const sourceInput = event.currentTarget;
                window.setTimeout(() => focusAfterEnteredText(index, nextValue, sourceInput), 0);
              }
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              const compositionValue = event.currentTarget.value;
              onCompositionCommit(index, compositionValue);
              if (compositionValue.length > 0) {
                const sourceInput = event.currentTarget;
                window.setTimeout(
                  () => focusAfterComposition(index, compositionValue, sourceInput),
                  0,
                );
              }
            }}
            onKeyDown={(event) => {
              const nativeIsComposing = (event.nativeEvent as KeyboardEvent).isComposing;
              if (composingRef.current || nativeIsComposing) return;
              if (event.key === 'Backspace' && !value) {
                event.preventDefault();
                focusCell(index - 1);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                focusCell(index - 1);
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                focusCell(index + 1);
              }
            }}
          />
        );
      })}
    </div>
  );
}

function TelegraphSendPaperPreview({
  draft,
  result,
  date,
  serialNumber,
  onClick,
}: Readonly<{
  draft: TelegraphDraftInput;
  result: ReturnType<typeof evaluateTelegraphDraft>;
  date: ReturnType<typeof formatTelegraphDate>;
  serialNumber: string;
  onClick: () => void;
}>) {
  const compactTime = date.time.replace(':', '');
  return (
    <div
      className="telegraph-send-paper-preview"
      role="button"
      tabIndex={0}
      aria-label="切换到收报纸"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="telegraph-paper telegraph-send-paper">
        <img src={appPath('/telegraph/send-paper-template.png')} alt="电报发报纸预览" />
        <div className="telegraph-paper-value telegraph-stat-count">
          {result.billableGrids || ''}
        </div>
        <div className="telegraph-paper-value telegraph-stat-fare">
          {result.amount ? result.amount.toFixed(2) : ''}
        </div>
        <div className="telegraph-paper-value telegraph-flow">
          {formatTelegraphRelayNumber(serialNumber)}
        </div>
        <div className="telegraph-paper-value telegraph-out-date">{date.date}</div>
        <div className="telegraph-paper-value telegraph-out-time">{compactTime}</div>
        <div className="telegraph-paper-value telegraph-office">电报大楼</div>
        <div className="telegraph-paper-value telegraph-destination-province">{draft.province}</div>
        <div className="telegraph-paper-value telegraph-destination-city">{draft.city}</div>
        <div className="telegraph-paper-value telegraph-destination-county">
          {draft.county || draft.district}
        </div>
        <GridTextPreview
          cells={result.recipientCells}
          className="telegraph-recipient-grid"
          rows={2}
        />
        <GridPreview cells={result.recipientCells} className="telegraph-recipient-grid" rows={2} />
        <GridTextPreview cells={result.bodyCells} className="telegraph-body-grid" rows={5} />
        <GridPreview cells={result.bodyCells} className="telegraph-body-grid" rows={5} />
        <div className="telegraph-paper-value telegraph-sender-name">{draft.senderName}</div>
        <div className="telegraph-paper-value telegraph-sender-address">{draft.senderAddress}</div>
      </div>
    </div>
  );
}

function GridTextPreview({
  cells,
  className,
  rows,
}: {
  cells: TelegraphCell[];
  className: string;
  rows: number;
}) {
  return (
    <div className={`telegraph-grid-text-preview ${className}`} aria-hidden="true">
      {Array.from({ length: rows * 10 }, (_, index) => {
        const cell = cells[index];
        const rowIndex = Math.floor(index / 10);
        const columnIndex = index % 10;
        const value = cell?.value ?? '';
        return (
          <span key={index} style={{ gridRow: rowIndex * 2 + 1, gridColumn: columnIndex + 1 }}>
            {value}
          </span>
        );
      })}
    </div>
  );
}

function GridPreview({
  cells,
  className,
  rows,
}: {
  cells: TelegraphCell[];
  className: string;
  rows: number;
}) {
  return (
    <div className={`telegraph-grid-preview ${className}`} aria-hidden="true">
      {Array.from({ length: rows * 10 }, (_, index) => {
        const cell = cells[index];
        const rowIndex = Math.floor(index / 10);
        const columnIndex = index % 10;
        const previousIsRun =
          Boolean(cell?.alphanumericRun) &&
          cells[index - 1]?.alphanumericRun === cell?.alphanumericRun;
        const nextIsRun =
          Boolean(cell?.alphanumericRun) &&
          cells[index + 1]?.alphanumericRun === cell?.alphanumericRun;
        const value = cell?.alphanumericRun
          ? `${previousIsRun ? '' : '('}${cell.value}${nextIsRun ? '' : ')'}`
          : '';
        return (
          <span
            key={index}
            className={cell?.unsupported ? 'is-unsupported' : ''}
            style={{ gridRow: rowIndex * 2 + 2, gridColumn: columnIndex + 1 }}
          >
            <small>
              {cell?.alphanumericRun
                ? value
                : cell?.code?.startsWith('(')
                  ? ''
                  : (cell?.code ?? '')}
            </small>
          </span>
        );
      })}
    </div>
  );
}

function renderReceiveCodeLine(
  tokens: TelegraphReceiveCodeToken[],
  line: TelegraphReceiveCodeToken['line'],
  progress: number,
  animationState: TelegraphAnimationState,
): ReactNode {
  const forceVisible = animationState === 'sealed' || animationState === 'opened';
  return tokens
    .filter((token) => token.line === line)
    .map((token, index) => {
      const visible =
        forceVisible || token.progressIndex === null || token.progressIndex < progress;
      return (
        <span
          className={`telegraph-print-segment ${visible ? 'is-visible' : ''}`}
          key={`${line}-${index}`}
        >
          {visible ? token.display : '\u00a0'}
        </span>
      );
    });
}

function renderReceivePaperTextLine(
  value: string,
  tokens: TelegraphReceiveCodeToken[],
  line: TelegraphReceiveCodeToken['line'],
  progress: number,
  animationState: TelegraphAnimationState,
): ReactNode {
  const forceVisible = animationState === 'sealed' || animationState === 'opened';
  const lineTokens = tokens.filter((token) => token.line === line);
  let cursor = 0;
  return Array.from(value).map((character, index) => {
    const matchingTokens: TelegraphReceiveCodeToken[] = [];
    if (/\s/.test(character)) {
      if (lineTokens[cursor]?.kind === 'space') matchingTokens.push(lineTokens[cursor++]);
    } else if (lineTokens[cursor]?.source === character) {
      const source = lineTokens[cursor].source;
      while (lineTokens[cursor]?.source === source) matchingTokens.push(lineTokens[cursor++]);
    } else if (lineTokens[cursor]) {
      matchingTokens.push(lineTokens[cursor++]);
    }
    const visible =
      forceVisible ||
      matchingTokens.length === 0 ||
      matchingTokens.every(
        (token) => token.progressIndex !== null && token.progressIndex < progress,
      );
    return (
      <span
        className={`telegraph-print-segment ${visible ? 'is-visible' : ''}`}
        key={`${line}-paper-${index}`}
      >
        {visible ? character : '\u00a0'}
      </span>
    );
  });
}

function getCellTokens(
  tokens: TelegraphReceiveCodeToken[],
  cellIndex: number,
): TelegraphReceiveCodeToken[] {
  return tokens.filter((token) => token.cellIndex === cellIndex);
}

function getReceiveCellCodeValue(
  tokens: TelegraphReceiveCodeToken[],
  cells: TelegraphCell[],
  cellIndex: number,
  progress: number,
): string {
  const cell = cells[cellIndex];
  const cellTokens = getCellTokens(tokens, cellIndex);
  return cellTokens
    .filter((token) => token.progressIndex !== null && token.progressIndex < progress)
    .map((token) => token.display)
    .join('');
}

function getReceiveCellTextValue(
  tokens: TelegraphReceiveCodeToken[],
  cells: TelegraphCell[],
  cellIndex: number,
  progress: number,
): string {
  const cell = cells[cellIndex];
  if (!cell) return '';
  const cellTokens = getCellTokens(tokens, cellIndex);
  if (!cellTokens.length) return '';
  const completed = cellTokens.every(
    (token) => token.progressIndex !== null && token.progressIndex < progress,
  );
  if (cell.codeOnly || cell.alphanumericRun) return '';
  const code = (cell.code ?? '').replace(/\D/g, '');
  if (!code) return completed ? cell.value : '';
  const visibleDigits = cellTokens.filter(
    (token) =>
      token.kind === 'digit' && token.progressIndex !== null && token.progressIndex < progress,
  ).length;
  if (visibleDigits >= code.length) return cell.value;
  const guess = inferTelegraphCharacter(code, visibleDigits);
  return guess ? `${guess}…` : '';
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
function playGeneratedMorseAudio(
  audioBlob: Blob,
  codeText: string,
  totalSteps: number,
  onProgress: (completed: number) => void,
) {
  let stopped = false;
  let finish: () => void = () => undefined;
  const timerIds: number[] = [];
  let context: AudioContext | undefined;
  let source: AudioBufferSourceNode | undefined;
  const stepCount = Math.max(0, totalSteps);
  const stop = () => {
    stopped = true;
    for (const timerId of timerIds) window.clearTimeout(timerId);
    timerIds.length = 0;
    try {
      source?.stop();
    } catch {
      /* 音源已停止时无需处理。 */
    }
    if (context) void context.close().catch(() => undefined);
    finish();
  };
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
    if (!stepCount || typeof window === 'undefined') {
      resolve();
      return;
    }
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      onProgress(stepCount);
      resolve();
      return;
    }
    void (async () => {
      try {
        context = new AudioContextConstructor();
        const audioBuffer = await context.decodeAudioData(await audioBlob.arrayBuffer());
        if (stopped || !context) return;
        source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(context.destination);
        const startedAt = context.currentTime + 0.03;
        source.start(startedAt);
        const durationMs = audioBuffer.duration * 1000;
        Array.from({ length: stepCount }, (_, index) => {
          timerIds.push(
            window.setTimeout(
              () => {
                if (!stopped) onProgress(index + 1);
              },
              Math.max(0, (durationMs * (index + 1)) / stepCount),
            ),
          );
        });
        source.onended = () => {
          if (stopped) return;
          onProgress(stepCount);
          void context?.close().catch(() => undefined);
          finish();
        };
        await context.resume();
      } catch {
        if (!stopped) {
          onProgress(stepCount);
          finish();
        }
      }
    })();
  });
  return { promise, stop };
}
function createTelegraphPaperSound(
  sound: TelegraphPaperSound,
  durationMs: number,
): (() => void) | undefined {
  if (typeof window === 'undefined') return undefined;
  let stopped = false;
  let timerId: number | null = null;
  let intervalId: number | null = null;
  const activeAudios = new Set<HTMLAudioElement>();
  const playClip = () => {
    if (stopped || (sound === 'writing' && activeAudios.size >= TELEGRAPH_WRITING_MAX_VOICES)) {
      return;
    }
    const audio = new window.Audio(appPath(telegraphPaperSoundPaths[sound]));
    audio.preload = 'auto';
    audio.volume = sound === 'writing' ? 0.1 : sound === 'friction' ? 0.2 : 0.3;
    activeAudios.add(audio);
    const cleanup = () => {
      activeAudios.delete(audio);
      audio.removeEventListener('ended', cleanup);
    };
    audio.addEventListener('ended', cleanup);
    void audio
      .play()
      .then(() => {
        if (stopped) cleanup();
      })
      .catch(cleanup);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timerId !== null) window.clearTimeout(timerId);
    if (intervalId !== null) window.clearInterval(intervalId);
    for (const audio of activeAudios) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeAudios.clear();
  };
  playClip();
  if (sound === 'writing') {
    intervalId = window.setInterval(playClip, TELEGRAPH_WRITING_OVERLAP_MS);
  }
  timerId = window.setTimeout(stop, durationMs);
  return stop;
}
async function createMorseWav(tokens: TelegraphReceiveCodeToken[]): Promise<Blob> {
  const sampleRate = 22050;
  const unit = Math.round(sampleRate * 0.045);
  const samples: number[] = [];
  const morse: Record<string, string> = {
    A: '.-',
    B: '-...',
    C: '-.-.',
    D: '-..',
    E: '.',
    F: '..-.',
    G: '--.',
    H: '....',
    I: '..',
    J: '.---',
    K: '-.-',
    L: '.-..',
    M: '--',
    N: '-.',
    O: '---',
    P: '.--.',
    Q: '--.-',
    R: '.-.',
    S: '...',
    T: '-',
    U: '..-',
    V: '...-',
    W: '.--',
    X: '-..-',
    Y: '-.--',
    Z: '--..',
    '(': '-.--.',
    ')': '-.--.-',
    '0': '-----',
    '1': '.----',
    '2': '..---',
    '3': '...--',
    '4': '....-',
    '5': '.....',
    '6': '-....',
    '7': '--...',
    '8': '---..',
    '9': '----.',
  };
  const appendSilence = (length: number) => {
    for (let index = 0; index < length; index += 1) samples.push(0);
  };
  const appendTone = (length: number) => {
    for (let index = 0; index < length; index += 1)
      samples.push(Math.sin((index / sampleRate) * Math.PI * 2 * 660) * 0.18);
  };
  const events: Array<{ kind: 'symbol'; pattern: string } | { kind: 'gap'; units: number }> = [];
  for (const token of tokens) {
    const display = token.display.toUpperCase();
    if (token.kind === 'space' || /\s/.test(token.display)) {
      const gapUnits = token.spaceKind === 'character' ? 3 : 7;
      events.push({ kind: 'gap', units: gapUnits });
      continue;
    }
    const pattern = morse[display];
    if (pattern) events.push({ kind: 'symbol', pattern });
  }
  events.forEach((event, index) => {
    if (event.kind === 'gap') {
      appendSilence(unit * event.units);
      return;
    }
    for (const [markIndex, mark] of event.pattern.split('').entries()) {
      appendTone(mark === '.' ? unit : unit * 3);
      if (markIndex < event.pattern.length - 1) appendSilence(unit);
    }
    if (events[index + 1]?.kind === 'symbol') appendSilence(unit * 3);
  });
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) =>
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true),
  );
  return new Blob([buffer], { type: 'audio/wav' });
}
function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1)
    view.setUint8(offset + index, value.charCodeAt(index));
}
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
