import React, { useEffect, useRef, useState } from 'react';
import { ICON, IconClose, IconVerified, IconWarning } from './icons';

export interface ConfirmActionFact {
 label: string;
 value: string;
}

export interface ConfirmActionNoteField {
 label: string;
 placeholder: string;
 required: boolean;
 initialValue?: string;
 requiredMessage: string;
}

/**
 * A single high-impact decision awaiting explicit auditor confirmation.
 * Every field is supplied by the caller so the dialog stays language-agnostic.
 */
export interface ConfirmActionRequest {
 id: string;
 tone: 'destructive' | 'approval';
 title: string;
 description: string;
 consequence: string;
 facts: ConfirmActionFact[];
 confirmLabel: string;
 cancelLabel: string;
 note?: ConfirmActionNoteField;
 onConfirm: (note: string) => void;
}

interface ConfirmActionDialogProps {
 request: ConfirmActionRequest | null;
 onCancel: () => void;
 reviewHeading: string;
 closeLabel: string;
}

const FOCUSABLE_SELECTOR =
 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
 request,
 onCancel,
 reviewHeading,
 closeLabel,
}) => {
 const dialogRef = useRef<HTMLDivElement | null>(null);
 const initialFocusRef = useRef<HTMLTextAreaElement | HTMLButtonElement | null>(null);
 const cancelRef = useRef(onCancel);
 const [note, setNote] = useState('');
 const [showNoteError, setShowNoteError] = useState(false);

 const requestId = request?.id;
 const noteInitialValue = request?.note?.initialValue ?? '';

 // The dashboard re-renders on every polling tick, so onCancel is a new function each
 // time. Keeping it in a ref stops the focus effect below from re-running and stealing
 // focus back from the note field while the auditor is typing.
 cancelRef.current = onCancel;

 useEffect(() => {
 setNote(noteInitialValue);
 setShowNoteError(false);
 }, [requestId, noteInitialValue]);

 useEffect(() => {
 if (!requestId) return undefined;

 const previouslyFocused = document.activeElement as HTMLElement | null;
 initialFocusRef.current?.focus();

 const handleKeyDown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') {
 event.preventDefault();
 cancelRef.current();
 return;
 }

 if (event.key !== 'Tab') return;

 const dialogNode = dialogRef.current;
 if (!dialogNode) return;

 const focusable = Array.from(dialogNode.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[];
 if (focusable.length === 0) return;

 const first = focusable[0];
 const last = focusable[focusable.length - 1];

 if (event.shiftKey && document.activeElement === first) {
 event.preventDefault();
 last.focus();
 } else if (!event.shiftKey && document.activeElement === last) {
 event.preventDefault();
 first.focus();
 }
 };

 document.addEventListener('keydown', handleKeyDown, true);
 const previousOverflow = document.body.style.overflow;
 document.body.style.overflow = 'hidden';

 return () => {
 document.removeEventListener('keydown', handleKeyDown, true);
 document.body.style.overflow = previousOverflow;
 previouslyFocused?.focus?.();
 };
 }, [requestId]);

 if (!request) return null;

 const trimmedNote = note.trim();
 const noteMissing = Boolean(request.note?.required) && trimmedNote.length === 0;
 const isDestructive = request.tone === 'destructive';

 const handleConfirm = () => {
 if (noteMissing) {
 setShowNoteError(true);
 initialFocusRef.current?.focus();
 return;
 }

 request.onConfirm(trimmedNote);
 };

 return (
 <div
 className="fixed inset-0 z-100 flex items-end sm:items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
 onMouseDown={(event) => {
 if (event.target === event.currentTarget) onCancel();
 }}
 >
 <div
 ref={dialogRef}
 role="dialog"
 aria-modal="true"
 aria-labelledby={`${request.id}-title`}
 aria-describedby={`${request.id}-description`}
 className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
 >
 <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
 <div className="flex items-start gap-3">
 <span
 className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
 isDestructive ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
 }`}
 >
 {isDestructive ? <IconWarning className="h-5 w-5" aria-hidden="true" /> : <IconVerified className="h-5 w-5" aria-hidden="true" />}
 </span>
 <div>
 <p className="text-xs font-medium text-slate-500">{reviewHeading}</p>
 <h2 id={`${request.id}-title`} className="mt-1 text-lg font-semibold text-slate-950">
 {request.title}
 </h2>
 </div>
 </div>
 <button
 type="button"
 onClick={onCancel}
 className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 cursor-pointer"
 aria-label={closeLabel}
 >
 <IconClose className="h-4 w-4" aria-hidden="true" />
 </button>
 </div>

 <div className="flex flex-col gap-4 p-5">
 <p id={`${request.id}-description`} className="text-sm leading-relaxed text-slate-700">
 {request.description}
 </p>

 <dl className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
 {request.facts.map((fact) => (
 <div key={fact.label}>
 <dt className="text-xs font-medium text-slate-500">{fact.label}</dt>
 <dd className="mt-0.5 text-sm font-semibold text-slate-800">{fact.value}</dd>
 </div>
 ))}
 </dl>

 <p
 className={`rounded-xl border p-3.5 text-sm font-semibold leading-relaxed ${
 isDestructive
 ? 'border-rose-200 bg-rose-50 text-rose-800'
 : 'border-amber-200 bg-amber-50 text-amber-900'
 }`}
 >
 {request.consequence}
 </p>

 {request.note && (
 <div className="flex flex-col gap-1.5">
 <label htmlFor={`${request.id}-note`} className="text-sm font-medium text-slate-800">
 {request.note.label}
 </label>
 <textarea
 id={`${request.id}-note`}
 ref={(element) => {
 initialFocusRef.current = element;
 }}
 value={note}
 onChange={(event) => {
 setNote(event.target.value);
 if (showNoteError) setShowNoteError(false);
 }}
 placeholder={request.note.placeholder}
 rows={3}
 maxLength={500}
 aria-invalid={showNoteError || undefined}
 aria-describedby={showNoteError ? `${request.id}-note-error` : undefined}
 className={`w-full resize-y rounded-xl border bg-white p-3 text-sm text-slate-800 outline-none focus:ring-2 ${
 showNoteError
 ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
 : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-100'
 }`}
 />
 {showNoteError && (
 <p id={`${request.id}-note-error`} role="alert" className="text-sm font-semibold text-rose-700">
 {request.note.requiredMessage}
 </p>
 )}
 </div>
 )}
 </div>

 <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
 <button
 type="button"
 onClick={onCancel}
 className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer"
 id={`btn-cancel-${request.id}`}
 >
 {request.cancelLabel}
 </button>
 <button
 type="button"
 onClick={handleConfirm}
 ref={(element) => {
 if (!request.note) initialFocusRef.current = element;
 }}
 className={`h-11 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition-colors cursor-pointer ${
 isDestructive ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
 }`}
 id={`btn-confirm-${request.id}`}
 >
 {request.confirmLabel}
 </button>
 </div>
 </div>
 </div>
 );
};
