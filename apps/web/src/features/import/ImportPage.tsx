/**
 * /import — the three import entry points plus the list of open drafts.
 *
 *   a) URL      -> POST /imports/url
 *   b) FOTO     -> POST /imports/image  (camera first, client-side downscale)
 *   c) DOKUMENT -> POST /imports/pdf | /imports/image (drag & drop on desktop)
 *   +) TEXT     -> POST /imports/text   (escape hatch when nothing else works)
 *
 * Every path ends in a draft and navigates to /import/<draftId> for review.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import {
  Camera,
  ClipboardPaste,
  FileUp,
  Globe,
  Info,
  Link as LinkIcon,
  PenLine,
  Trash2,
  Upload,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { MAX_UPLOAD_BYTES } from "@toon/shared";
import {
  Button,
  Input,
  Label,
  Select,
  Textarea,
  readChangeValue,
  useActiveGroupState,
  useImportAvailability,
  useShellToast,
} from "./lib/shell";
import { useImportNavigation } from "./lib/navigation";
import { importFromText, importFromUrl, importImage, importPdf } from "./lib/importApi";
import { checkFileSize, formatBytes, isImageFile, isPdfFile, prepareImageForUpload, stitchImagesForUpload } from "./lib/image";
import { useDeleteDraft, useDraftList } from "./lib/queries";
import ImageCaptureButton from "./components/ImageCaptureButton";
import OcrProgressPanel, { type ImportPhase } from "./components/OcrProgressPanel";
import UploadProgress from "./components/UploadProgress";
import PendingDraftsList from "./components/PendingDraftsList";
import ImportErrorPanel from "./components/ImportErrorPanel";

type ImportSource = "url" | "photo" | "document" | "text";

interface JobState {
  source: ImportSource;
  phase: ImportPhase;
  fraction: number;
  subject?: string;
  mode: "ocr" | "text" | "url";
  kind: "image" | "pdf";
}

interface PickedPhoto {
  id: string;
  file: File;
  url: string;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ImportPage() {
  const { groupId, groupName, groups, switchGroup } = useActiveGroupState();
  const navigation = useImportNavigation();
  const toast = useShellToast();

  const [targetGroupId, setTargetGroupId] = useState<string | undefined>(groupId);
  useEffect(() => {
    setTargetGroupId((current) => current ?? groupId);
  }, [groupId]);
  const effectiveGroupId = targetGroupId ?? groupId;

  const [job, setJob] = useState<JobState | undefined>(undefined);
  const [error, setError] = useState<{ source: ImportSource; error: unknown } | undefined>(undefined);
  const inFlight = job !== undefined && job.phase !== "done" && job.phase !== "error";
  /**
   * Every import entry point posts to the server and OCR runs there, so NOTHING
   * here works offline. Folding that into the one flag that already disables the
   * buttons keeps the guard in a single place — the offline PWA support is
   * deliberately read-only (see lib/persist.ts).
   */
  const offline = useImportAvailability();
  const busy = inFlight || !offline.enabled;

  /* ------------------------------ url import ------------------------------ */
  const [urlValue, setUrlValue] = useState("");
  const urlTouched = urlValue.trim().length > 0;
  const urlValid = isValidHttpUrl(urlValue);

  /* ----------------------------- photo import ----------------------------- */
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [photoNotice, setPhotoNotice] = useState<string | undefined>(undefined);
  const photoSectionRef = useRef<HTMLElement | null>(null);
  const [photoHighlight, setPhotoHighlight] = useState(false);

  // Revoke every preview URL on unmount (individual removals revoke in removePhoto).
  const photosRef = useRef<PickedPhoto[]>([]);
  photosRef.current = photos;
  useEffect(
    () => () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url);
    },
    [],
  );

  /* --------------------------- document import ---------------------------- */
  const [documentFile, setDocumentFile] = useState<File | undefined>(undefined);
  const [documentNotice, setDocumentNotice] = useState<string | undefined>(undefined);
  const [dragActive, setDragActive] = useState(false);

  /* ----------------------------- text import ------------------------------ */
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const textSectionRef = useRef<HTMLElement | null>(null);

  /* ----------------------------- pending drafts --------------------------- */
  const draftsQuery = useDraftList(effectiveGroupId, "pending", 20);
  const deleteDraft = useDeleteDraft();
  const [deletingDraftId, setDeletingDraftId] = useState<string | undefined>(undefined);

  const finish = useCallback(
    (draftId: string) => {
      setJob(undefined);
      navigation.toDraft(draftId);
    },
    [navigation],
  );

  const fail = useCallback((source: ImportSource, cause: unknown) => {
    setJob(undefined);
    setError({ source, error: cause });
  }, []);

  const requireGroup = useCallback((): string | undefined => {
    if (typeof effectiveGroupId === "string" && effectiveGroupId.length > 0) return effectiveGroupId;
    toast({
      title: "Keine Gruppe ausgewählt",
      description: "Wähle zuerst die Gruppe, in die das Rezept importiert werden soll.",
      variant: "error",
    });
    return undefined;
  }, [effectiveGroupId, toast]);

  /* -------------------------------- actions ------------------------------- */

  const runUrlImport = useCallback(async () => {
    const group = requireGroup();
    if (group === undefined || !urlValid) return;
    setError(undefined);
    setJob({ source: "url", phase: "processing", fraction: 1, mode: "url", kind: "image", subject: urlValue.trim() });
    try {
      const draft = await importFromUrl(group, urlValue.trim());
      finish(draft.id);
    } catch (cause) {
      fail("url", cause);
    }
  }, [fail, finish, requireGroup, urlValid, urlValue]);

  const runPhotoImport = useCallback(async () => {
    const group = requireGroup();
    if (group === undefined || photos.length === 0) return;
    setError(undefined);
    const files = photos.map((photo) => photo.file);
    setJob({
      source: "photo",
      phase: "preparing",
      fraction: 0,
      mode: "ocr",
      kind: "image",
      subject: files.length === 1 ? files[0]!.name : `${files.length} Fotos`,
    });
    try {
      const prepared = files.length === 1 ? await prepareImageForUpload(files[0]!) : await stitchImagesForUpload(files);
      const sizeProblem = checkFileSize(prepared.file);
      if (sizeProblem !== null) {
        setJob(undefined);
        setPhotoNotice(sizeProblem);
        return;
      }
      setJob((current) =>
        current === undefined ? current : { ...current, phase: "uploading", subject: prepared.file.name },
      );
      const draft = await importImage(group, prepared.file, {
        onProgress: (fraction) => setJob((current) => (current === undefined ? current : { ...current, fraction })),
        onUploadComplete: () =>
          setJob((current) => (current === undefined ? current : { ...current, phase: "processing" })),
      });
      finish(draft.id);
    } catch (cause) {
      fail("photo", cause);
    }
  }, [fail, finish, photos, requireGroup]);

  const runDocumentImport = useCallback(async () => {
    const group = requireGroup();
    if (group === undefined || documentFile === undefined) return;
    setError(undefined);
    const pdf = isPdfFile(documentFile);
    setJob({
      source: "document",
      phase: pdf ? "uploading" : "preparing",
      fraction: 0,
      mode: pdf ? "text" : "ocr",
      kind: pdf ? "pdf" : "image",
      subject: documentFile.name,
    });
    try {
      const file = pdf ? documentFile : (await prepareImageForUpload(documentFile)).file;
      const sizeProblem = checkFileSize(file);
      if (sizeProblem !== null) {
        setJob(undefined);
        setDocumentNotice(sizeProblem);
        return;
      }
      setJob((current) => (current === undefined ? current : { ...current, phase: "uploading" }));
      const handle = {
        onProgress: (fraction: number) => setJob((current) => (current === undefined ? current : { ...current, fraction })),
        onUploadComplete: () =>
          setJob((current) => (current === undefined ? current : { ...current, phase: "processing" })),
      };
      const draft = pdf ? await importPdf(group, file, handle) : await importImage(group, file, handle);
      finish(draft.id);
    } catch (cause) {
      fail("document", cause);
    }
  }, [documentFile, fail, finish, requireGroup]);

  const runTextImport = useCallback(async () => {
    const group = requireGroup();
    if (group === undefined || textValue.trim().length === 0) return;
    setError(undefined);
    setJob({ source: "text", phase: "processing", fraction: 1, mode: "url", kind: "image", subject: "Eingefügter Text" });
    try {
      const draft = await importFromText(group, textValue, textTitle.trim().length > 0 ? textTitle.trim() : undefined);
      finish(draft.id);
    } catch (cause) {
      fail("text", cause);
    }
  }, [fail, finish, requireGroup, textTitle, textValue]);

  /* ------------------------------ file helpers ---------------------------- */

  const addPhotos = useCallback((files: File[]) => {
    setPhotoNotice(undefined);
    const accepted: PickedPhoto[] = [];
    for (const file of files) {
      if (!isImageFile(file)) {
        setPhotoNotice(`„${file.name}“ ist kein Bild. Erlaubt sind JPEG, PNG, WebP oder HEIC.`);
        continue;
      }
      const problem = checkFileSize(file);
      if (problem !== null) {
        setPhotoNotice(problem);
        continue;
      }
      accepted.push({ id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`, file, url: URL.createObjectURL(file) });
    }
    if (accepted.length > 0) setPhotos((current) => [...current, ...accepted].slice(0, 10));
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target !== undefined) URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.id !== id);
    });
  }, []);

  const pickDocument = useCallback((files: File[]) => {
    setDocumentNotice(undefined);
    const file = files[0];
    if (file === undefined) return;
    if (!isPdfFile(file) && !isImageFile(file)) {
      setDocumentNotice("Bitte eine PDF-Datei oder ein Bild auswählen.");
      return;
    }
    const problem = checkFileSize(file);
    if (problem !== null) {
      setDocumentNotice(problem);
      return;
    }
    setDocumentFile(file);
  }, []);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    pickDocument(Array.from(event.dataTransfer.files ?? []));
  };

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim().length > 0) setUrlValue(text.trim());
      else setPhotoNotice(undefined);
    } catch {
      toast({
        title: "Zwischenablage nicht lesbar",
        description: "Dein Browser erlaubt das Einfügen nicht automatisch – bitte die URL manuell einfügen.",
        variant: "info",
      });
    }
  }, [toast]);

  const clipboardSupported = typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

  const jumpToPhoto = useCallback(() => {
    setPhotoHighlight(true);
    photoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setPhotoHighlight(false), 2400);
  }, []);

  const jumpToText = useCallback(() => {
    setTextOpen(true);
    setTimeout(() => textSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, []);

  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups],
  );

  const totalPhotoBytes = photos.reduce((sum, photo) => sum + photo.file.size, 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-28 pt-4 lg:pb-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-fg">Rezept importieren</h1>
        <p className="text-sm text-fg-muted">
          Aus dem Netz, vom Kochbuch-Foto oder aus einem PDF. Vor dem Speichern kannst du alles prüfen und korrigieren.
        </p>
      </header>

      {offline.enabled ? null : (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-soft-fg"
        >
          <WifiOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          Offline — Importieren braucht eine Verbindung, weil die Texterkennung auf dem Server
          läuft. Gespeicherte Rezepte kannst du weiterhin ansehen und nachkochen.
        </p>
      )}

      {groups.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
          <Users aria-hidden className="h-4 w-4 text-fg-subtle" />
          <Label htmlFor="import-group" className="text-xs font-medium text-fg-muted">
            Ziel-Gruppe
          </Label>
          <Select
            id="import-group"
            containerClassName="min-w-40 flex-1"
            value={effectiveGroupId ?? ""}
            options={groupOptions}
            onChange={(event) => {
              const next = readChangeValue(event);
              setTargetGroupId(next);
              switchGroup(next);
            }}
          />
        </div>
      ) : groupName !== undefined ? (
        <p className="text-xs text-fg-muted">
          Wird gespeichert in <span className="font-medium">{groupName}</span>
        </p>
      ) : null}

      {/* ----------------------------- a) URL ------------------------------ */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg">
            <Globe aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-fg">Von einer Webseite</h2>
            <p className="text-xs text-fg-muted">Link einfügen, wir lesen das Rezept aus.</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              id="import-url"
              containerClassName="flex-1"
              type="url"
              inputMode="url"
              value={urlValue}
              placeholder="https://www.chefkoch.de/rezepte/…"
              aria-label="Rezept-URL"
              aria-invalid={urlTouched && !urlValid}
              autoComplete="off"
              onChange={(event) => setUrlValue(readChangeValue(event))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && urlValid && !busy) {
                  event.preventDefault();
                  void runUrlImport();
                }
              }}
            />
            {clipboardSupported ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void pasteFromClipboard()}
                aria-label="Aus Zwischenablage einfügen"
                title="Aus Zwischenablage einfügen"
                disabled={busy}
              >
                <ClipboardPaste aria-hidden className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {urlTouched && !urlValid ? (
            <p className="text-xs text-warning">
              Das sieht noch nicht nach einer vollständigen Adresse aus – sie muss mit http:// oder https:// beginnen.
            </p>
          ) : null}

          {/* The sentence must be ONE flex item. Left directly in the flex container,
              every text run and every <span> becomes its own flex item: each gets the
              1.5 gap around it and wraps on its own, so the emphasised hostnames drifted
              apart and the full stop after them started a line of its own. */}
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Getestet mit <span className="font-medium">chefkoch.de</span> und{" "}
              <span className="font-medium">biancazapatka.com</span>. Andere Seiten funktionieren,
              wenn sie Rezeptdaten im Standardformat mitliefern.
            </span>
          </p>

          <Button type="button" onClick={() => void runUrlImport()} disabled={!urlValid || busy} className="w-full sm:w-auto">
            <LinkIcon aria-hidden className="mr-2 h-4 w-4" />
            Rezept laden
          </Button>

          {job?.source === "url" ? <OcrProgressPanel phase={job.phase} mode="url" subject={job.subject} /> : null}

          {error?.source === "url" ? (
            <ImportErrorPanel
              error={error.error}
              onRetry={() => void runUrlImport()}
              actions={
                <>
                  <button
                    type="button"
                    onClick={jumpToPhoto}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-xs font-medium text-danger-soft-fg hover:bg-danger-soft"
                  >
                    <Camera aria-hidden className="h-3.5 w-3.5" />
                    Trotzdem als Foto importieren
                  </button>
                  <button
                    type="button"
                    onClick={jumpToText}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-xs font-medium text-danger-soft-fg hover:bg-danger-soft"
                  >
                    <PenLine aria-hidden className="h-3.5 w-3.5" />
                    Text von Hand einfügen
                  </button>
                </>
              }
            />
          ) : null}
        </div>
      </section>

      {/* ----------------------------- b) FOTO ----------------------------- */}
      <section
        ref={photoSectionRef}
        className={clsx(
          "rounded-xl border bg-surface p-4 transition",
          photoHighlight
            ? "border-brand ring-2 ring-brand/30"
            : "border-line",
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg">
            <Camera aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-fg">Foto vom Rezept</h2>
            <p className="text-xs text-fg-muted">
              Kochbuch, Zeitschrift, Zettel – die Texterkennung läuft auf dem Server.
            </p>
          </div>
        </div>

        <ImageCaptureButton onFiles={addPhotos} disabled={busy} />

        <p className="mt-2 text-xs text-fg-muted">
          Tipp: gerade von oben fotografieren, gutes Licht, keine Schatten. Bilder werden vor dem Upload automatisch
          verkleinert.
        </p>

        {photos.length > 0 ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span>
                {photos.length} Foto{photos.length === 1 ? "" : "s"} · {formatBytes(totalPhotoBytes)}
              </span>
              {photos.length > 1 ? <span>werden zu einer Vorlage zusammengefügt</span> : null}
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <li key={photo.id} className="relative overflow-hidden rounded-lg border border-line">
                  <img src={photo.url} alt={`Ausgewähltes Foto ${index + 1}`} className="h-24 w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[11px] font-medium text-white">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    aria-label={`Foto ${index + 1} entfernen`}
                    className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" onClick={() => void runPhotoImport()} disabled={busy} className="w-full">
              <Upload aria-hidden className="mr-2 h-4 w-4" />
              {photos.length > 1 ? `${photos.length} Fotos importieren` : "Foto importieren"}
            </Button>
          </div>
        ) : null}

        {photoNotice !== undefined ? (
          <p className="mt-2 rounded-lg bg-warning-soft p-2 text-xs text-warning-soft-fg">
            {photoNotice}
          </p>
        ) : null}

        {job?.source === "photo" ? (
          <div className="mt-3 space-y-3">
            {job.phase === "uploading" ? (
              <UploadProgress fraction={job.fraction} fileName={job.subject} kind="image" />
            ) : null}
            <OcrProgressPanel phase={job.phase} mode="ocr" subject={job.subject} />
          </div>
        ) : null}

        {error?.source === "photo" ? (
          <ImportErrorPanel className="mt-3" error={error.error} onRetry={() => void runPhotoImport()} />
        ) : null}
      </section>

      {/* --------------------------- c) DOKUMENT --------------------------- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg">
            <FileUp aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-fg">PDF oder Bilddatei</h2>
            <p className="text-xs text-fg-muted">
              Bei PDFs wird zuerst die Textebene gelesen – das ist exakt und schnell.
            </p>
          </div>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={clsx(
            "rounded-xl border-2 border-dashed p-4 text-center transition",
            dragActive
              ? "border-brand bg-brand-soft"
              : "border-line-strong",
          )}
        >
          <p className="hidden text-xs text-fg-muted sm:block">
            Datei hierher ziehen oder
          </p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2">
            <FileUp aria-hidden className="h-4 w-4" />
            Datei auswählen
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                pickDocument(files);
              }}
            />
          </label>
          <p className="mt-2 text-[11px] text-fg-muted">
            PDF, JPEG, PNG, WebP oder HEIC · max. {formatBytes(MAX_UPLOAD_BYTES)}
          </p>
        </div>

        {documentFile !== undefined ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-line p-2">
            <FileUp aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">
              {documentFile.name}
              <span className="text-fg-muted"> · {formatBytes(documentFile.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => setDocumentFile(undefined)}
              aria-label="Datei entfernen"
              className="rounded-md p-1.5 text-fg-subtle hover:bg-surface-2"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {documentNotice !== undefined ? (
          <p className="mt-2 rounded-lg bg-warning-soft p-2 text-xs text-warning-soft-fg">
            {documentNotice}
          </p>
        ) : null}

        {documentFile !== undefined ? (
          <Button type="button" className="mt-3 w-full" onClick={() => void runDocumentImport()} disabled={busy}>
            <Upload aria-hidden className="mr-2 h-4 w-4" />
            Datei importieren
          </Button>
        ) : null}

        {job?.source === "document" ? (
          <div className="mt-3 space-y-3">
            {job.phase === "uploading" ? (
              <UploadProgress fraction={job.fraction} fileName={job.subject} kind={job.kind} />
            ) : null}
            <OcrProgressPanel phase={job.phase} mode={job.mode} subject={job.subject} />
          </div>
        ) : null}

        {error?.source === "document" ? (
          <ImportErrorPanel
            className="mt-3"
            error={error.error}
            onRetry={() => void runDocumentImport()}
            actions={
              <button
                type="button"
                onClick={jumpToPhoto}
                className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-xs font-medium text-danger-soft-fg hover:bg-danger-soft"
              >
                <Camera aria-hidden className="h-3.5 w-3.5" />
                Stattdessen Foto aufnehmen
              </button>
            }
          />
        ) : null}
      </section>

      {/* ------------------------------ +) TEXT ---------------------------- */}
      <section ref={textSectionRef} className="rounded-xl border border-line bg-surface p-4">
        <button
          type="button"
          onClick={() => setTextOpen((open) => !open)}
          aria-expanded={textOpen}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
            <PenLine aria-hidden className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-fg">Text einfügen</span>
            <span className="block text-xs text-fg-muted">
              Wenn du das Rezept schon als Text hast – z. B. aus einer Nachricht.
            </span>
          </span>
          <span className="text-xs text-fg-muted">{textOpen ? "schließen" : "öffnen"}</span>
        </button>

        {textOpen ? (
          <div className="mt-3 space-y-2">
            <Input
              value={textTitle}
              placeholder="Titel (optional)"
              aria-label="Titel"
              onChange={(event) => setTextTitle(readChangeValue(event))}
            />
            <Textarea
              rows={8}
              value={textValue}
              aria-label="Rezepttext"
              placeholder={"Zutaten und Zubereitung einfügen.\n\nZutaten\n250 g Mehl\n2 Eier\n\nZubereitung\n1. Alles verrühren…"}
              onChange={(event) => setTextValue(readChangeValue(event))}
            />
            <Button type="button" className="w-full" onClick={() => void runTextImport()} disabled={busy || textValue.trim().length === 0}>
              Text auswerten
            </Button>
            {job?.source === "text" ? <OcrProgressPanel phase={job.phase} mode="url" subject={job.subject} /> : null}
            {error?.source === "text" ? (
              <ImportErrorPanel error={error.error} onRetry={() => void runTextImport()} />
            ) : null}
          </div>
        ) : null}
      </section>

      {/* --------------------------- pending drafts ------------------------ */}
      {(draftsQuery.data?.items.length ?? 0) > 0 || draftsQuery.isLoading || draftsQuery.error != null ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Offene Entwürfe</h2>
            {(draftsQuery.data?.total ?? 0) > 0 ? (
              <span className="text-xs text-fg-muted">{draftsQuery.data?.total}</span>
            ) : null}
          </div>
          <p className="text-xs text-fg-muted">
            Ein abgebrochener Import ist nicht verloren – hier kannst du weitermachen.
          </p>
          <PendingDraftsList
            drafts={draftsQuery.data?.items ?? []}
            isLoading={draftsQuery.isLoading}
            error={draftsQuery.error ?? undefined}
            deletingDraftId={deletingDraftId}
            onOpen={(draftId) => navigation.toDraft(draftId)}
            onDelete={(draftId) => {
              const group = effectiveGroupId;
              if (group === undefined) return;
              setDeletingDraftId(draftId);
              deleteDraft.mutate(
                { groupId: group, draftId },
                {
                  onSettled: () => setDeletingDraftId(undefined),
                  onError: () =>
                    toast({
                      title: "Entwurf konnte nicht verworfen werden",
                      description: "Bitte versuche es erneut.",
                      variant: "error",
                    }),
                },
              );
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
